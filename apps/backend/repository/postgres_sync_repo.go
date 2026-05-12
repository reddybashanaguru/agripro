package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/finagra/unity/domain"
)

// SyncRepository pulls and pushes delta-sync payloads to/from PostgreSQL.
type SyncRepository interface {
	// Pull returns all records changed since the given timestamp.
	Pull(ctx context.Context, since domain.SyncTimestamp) (*domain.SyncChangeSet, error)
	// Push applies offline mutations atomically. Returns local→server ID mapping.
	Push(ctx context.Context, req *domain.PushRequest) (*domain.PushResponse, *domain.SyncStats, error)
}

type postgresSyncRepo struct {
	db *pgxpool.Pool
}

func NewPostgresSyncRepo(db *pgxpool.Pool) SyncRepository {
	return &postgresSyncRepo{db: db}
}

// Pull fetches all records changed after `since` across all synced tables.
// Uses created_at OR last_synced_at to catch both new and updated records.
func (r *postgresSyncRepo) Pull(ctx context.Context, since domain.SyncTimestamp) (*domain.SyncChangeSet, error) {
	sinceTime := since.Time()
	cs := &domain.SyncChangeSet{}
	var err error

	cs.Farmers, err = r.pullFarmers(ctx, sinceTime)
	if err != nil {
		return nil, domain.ErrInternal(fmt.Errorf("pull farmers: %w", err))
	}

	cs.LandPlots, err = r.pullLandPlots(ctx, sinceTime)
	if err != nil {
		return nil, domain.ErrInternal(fmt.Errorf("pull land_plots: %w", err))
	}

	cs.Transactions, err = r.pullTransactions(ctx, sinceTime)
	if err != nil {
		return nil, domain.ErrInternal(fmt.Errorf("pull transactions: %w", err))
	}

	return cs, nil
}

func (r *postgresSyncRepo) pullFarmers(ctx context.Context, since time.Time) (domain.TableChanges, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, phone, name, kyc_status,
		       COALESCE(fpo_id::text, '')  AS fpo_id,
		       created_at, updated_at, deleted_at
		FROM farmers
		WHERE created_at > $1 OR last_synced_at > $1
		ORDER BY COALESCE(last_synced_at, created_at) ASC`, since)
	if err != nil {
		return domain.TableChanges{}, err
	}
	defer rows.Close()

	return partitionRows(rows, func(r pgx.CollectableRow) (map[string]any, *time.Time, error) {
		var id, phone, name, kycStatus, fpoID string
		var createdAt, updatedAt time.Time
		var deletedAt *time.Time
		if err := r.Scan(&id, &phone, &name, &kycStatus, &fpoID, &createdAt, &updatedAt, &deletedAt); err != nil {
			return nil, nil, err
		}
		return map[string]any{
			"id":         id,
			"phone":      phone,
			"name":       name,
			"kyc_status": kycStatus,
			"fpo_id":     fpoID,
			"created_at": createdAt.UnixMilli(),
			"updated_at": updatedAt.UnixMilli(),
		}, deletedAt, nil
	})
}

func (r *postgresSyncRepo) pullLandPlots(ctx context.Context, since time.Time) (domain.TableChanges, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, farmer_id,
		       COALESCE(plot_name, '') AS plot_name,
		       ST_AsGeoJSON(geom)::text AS geom_json,
		       area_sqm::float8, area_acres::float8,
		       COALESCE(survey_number,'') AS survey_number,
		       COALESCE(district,'') AS district,
		       COALESCE(state,'') AS state,
		       COALESCE(soil_type,'') AS soil_type,
		       created_at, updated_at, deleted_at
		FROM land_plots
		WHERE created_at > $1 OR last_synced_at > $1
		ORDER BY COALESCE(last_synced_at, created_at) ASC`, since)
	if err != nil {
		return domain.TableChanges{}, err
	}
	defer rows.Close()

	return partitionRows(rows, func(r pgx.CollectableRow) (map[string]any, *time.Time, error) {
		var id, farmerID, plotName, geomJSON, surveyNum, district, state, soilType string
		var areaSqM, areaAcres float64
		var createdAt, updatedAt time.Time
		var deletedAt *time.Time
		if err := r.Scan(&id, &farmerID, &plotName, &geomJSON,
			&areaSqM, &areaAcres, &surveyNum, &district, &state, &soilType,
			&createdAt, &updatedAt, &deletedAt); err != nil {
			return nil, nil, err
		}
		return map[string]any{
			"id":            id,
			"farmer_id":     farmerID,
			"plot_name":     plotName,
			"geom_json":     geomJSON,
			"area_sqm":      areaSqM,
			"area_acres":    areaAcres,
			"survey_number": surveyNum,
			"district":      district,
			"state":         state,
			"soil_type":     soilType,
			"created_at":    createdAt.UnixMilli(),
			"updated_at":    updatedAt.UnixMilli(),
		}, deletedAt, nil
	})
}

func (r *postgresSyncRepo) pullTransactions(ctx context.Context, since time.Time) (domain.TableChanges, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, farmer_id, gross_amount::text, currency, status,
		       COALESCE(description,'') AS description,
		       created_at, updated_at
		FROM transactions
		WHERE created_at > $1 OR updated_at > $1
		ORDER BY created_at ASC`, since)
	if err != nil {
		return domain.TableChanges{}, err
	}
	defer rows.Close()

	return partitionRows(rows, func(r pgx.CollectableRow) (map[string]any, *time.Time, error) {
		var id, farmerID, amount, currency, status, description string
		var createdAt, updatedAt time.Time
		if err := r.Scan(&id, &farmerID, &amount, &currency, &status, &description, &createdAt, &updatedAt); err != nil {
			return nil, nil, err
		}
		return map[string]any{
			"id":          id,
			"farmer_id":   farmerID,
			"gross_amount": amount,
			"currency":    currency,
			"status":      status,
			"description": description,
			"created_at":  createdAt.UnixMilli(),
			"updated_at":  updatedAt.UnixMilli(),
		}, nil, nil // transactions are never soft-deleted on mobile
	})
}

// Push applies all offline mutations in a single atomic transaction.
// Conflict resolution: server record wins if server.updated_at > client.updated_at.
func (r *postgresSyncRepo) Push(ctx context.Context, req *domain.PushRequest) (*domain.PushResponse, *domain.SyncStats, error) {
	resp := &domain.PushResponse{
		ServerIDs: map[string]map[string]string{
			"farmers":    {},
			"land_plots": {},
		},
	}
	stats := &domain.SyncStats{}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, nil, domain.ErrInternal(err)
	}
	defer tx.Rollback(ctx)

	// ── Farmers ──────────────────────────────────────────────────
	for _, f := range req.Changes.Farmers.Created {
		localID, _ := f["id"].(string)
		serverID := uuid.New()
		clientUpdatedAt := msToTime(f["updated_at"])

		_, err := tx.Exec(ctx, `
			INSERT INTO farmers (id, phone, name, kyc_status, fpo_id, created_at, updated_at)
			VALUES ($1, $2, $3, $4, NULLIF($5,'')::uuid, $6, $7)
			ON CONFLICT (phone) DO NOTHING`,
			serverID,
			strVal(f, "phone"), strVal(f, "name"),
			strVal(f, "kyc_status"), strVal(f, "fpo_id"),
			clientUpdatedAt, clientUpdatedAt,
		)
		if err != nil {
			return nil, nil, domain.ErrInternal(fmt.Errorf("push farmer create: %w", err))
		}
		resp.ServerIDs["farmers"][localID] = serverID.String()
		stats.FarmersCreated++
	}

	for _, f := range req.Changes.Farmers.Updated {
		serverID, _ := f["server_id"].(string)
		clientUpdatedAt := msToTime(f["updated_at"])

		var serverUpdatedAt time.Time
		err := tx.QueryRow(ctx, `SELECT updated_at FROM farmers WHERE id = $1`, serverID).Scan(&serverUpdatedAt)
		if err != nil {
			continue // record doesn't exist on server — skip
		}

		if clientUpdatedAt.After(serverUpdatedAt) {
			_, err = tx.Exec(ctx, `
				UPDATE farmers SET name=$1, kyc_status=$2, updated_at=$3
				WHERE id=$4`,
				strVal(f, "name"), strVal(f, "kyc_status"),
				clientUpdatedAt, serverID,
			)
			if err != nil {
				return nil, nil, domain.ErrInternal(fmt.Errorf("push farmer update: %w", err))
			}
			stats.FarmersUpdated++
		} else {
			stats.ConflictsResolved++ // server is newer — discard client change
		}
	}

	// ── Land Plots ───────────────────────────────────────────────
	for _, p := range req.Changes.LandPlots.Created {
		localID, _ := p["id"].(string)
		serverID := uuid.New()
		geomJSON, _ := p["geom_json"].(string)
		clientUpdatedAt := msToTime(p["updated_at"])

		var geomExpr string
		if geomJSON != "" {
			geomExpr = geomJSON
		}

		farmerServerID := r.resolveFarmerID(ctx, tx, strVal(p, "farmer_id"), resp.ServerIDs["farmers"])

		if geomExpr != "" {
			_, err = tx.Exec(ctx, `
				INSERT INTO land_plots (id, farmer_id, plot_name, geom,
				  survey_number, district, state, soil_type, created_at, updated_at)
				VALUES ($1, $2, $3,
				  ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
				  $5, $6, $7, $8, $9, $9)`,
				serverID, farmerServerID,
				strVal(p, "plot_name"), geomExpr,
				strVal(p, "survey_number"), strVal(p, "district"),
				strVal(p, "state"), strVal(p, "soil_type"),
				clientUpdatedAt,
			)
		} else {
			continue // skip plot without geometry
		}
		if err != nil {
			return nil, nil, domain.ErrInternal(fmt.Errorf("push plot create: %w", err))
		}
		resp.ServerIDs["land_plots"][localID] = serverID.String()
		stats.PlotsCreated++
	}

	// ── Soft deletes ─────────────────────────────────────────────
	for _, serverID := range req.Changes.Farmers.Deleted {
		tx.Exec(ctx, `UPDATE farmers SET deleted_at=NOW() WHERE id=$1`, serverID)
	}
	for _, serverID := range req.Changes.LandPlots.Deleted {
		tx.Exec(ctx, `UPDATE land_plots SET deleted_at=NOW() WHERE id=$1`, serverID)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, domain.ErrInternal(fmt.Errorf("push commit: %w", err))
	}

	return resp, stats, nil
}

// ─── helpers ─────────────────────────────────────────────────────────

type rowScanner func(pgx.CollectableRow) (map[string]any, *time.Time, error)

func partitionRows(rows pgx.Rows, scanner rowScanner) (domain.TableChanges, error) {
	tc := domain.TableChanges{
		Created: []map[string]any{},
		Updated: []map[string]any{},
		Deleted: []string{},
	}
	for rows.Next() {
		record, deletedAt, err := scanner(rows)
		if err != nil {
			return tc, err
		}
		id, _ := record["id"].(string)
		if deletedAt != nil {
			tc.Deleted = append(tc.Deleted, id)
		} else if record["created_at"] == record["updated_at"] {
			// Exact equality → brand new record
			tc.Created = append(tc.Created, record)
		} else {
			tc.Updated = append(tc.Updated, record)
		}
	}
	return tc, rows.Err()
}

func strVal(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

func msToTime(v any) time.Time {
	switch n := v.(type) {
	case float64:
		return time.UnixMilli(int64(n)).UTC()
	case int64:
		return time.UnixMilli(n).UTC()
	case json.Number:
		ms, _ := n.Int64()
		return time.UnixMilli(ms).UTC()
	}
	return time.Now().UTC()
}

// resolveFarmerID maps local farmer ID → server UUID using the push response IDs.
func (r *postgresSyncRepo) resolveFarmerID(ctx context.Context, tx pgx.Tx, localFarmerID string, serverIDs map[string]string) uuid.UUID {
	if serverUUID, ok := serverIDs[localFarmerID]; ok {
		id, _ := uuid.Parse(serverUUID)
		return id
	}
	id, err := uuid.Parse(localFarmerID)
	if err != nil {
		return uuid.Nil
	}
	return id
}
