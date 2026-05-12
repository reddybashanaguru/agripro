package domain

import "time"

// ─────────────────────────────────────────────────────────────────────
// DELTA-SYNC PROTOCOL — WatermelonDB compatible
//
// Pull:  GET /api/v1/sync/pull?since=<unix_ms>
//        Returns records where created_at > since OR last_synced_at > since
//        Cursor: server timestamp at start of the pull (not end) — avoids gaps
//
// Push:  POST /api/v1/sync/push
//        Receives offline mutations, applies in single DB transaction
//        Server wins on conflict (updated_at comparison)
//        Returns local→server ID mapping for new records
// ─────────────────────────────────────────────────────────────────────

// SyncTimestamp is unix milliseconds — matches WatermelonDB convention.
type SyncTimestamp int64

func NowSyncTimestamp() SyncTimestamp {
	return SyncTimestamp(time.Now().UnixMilli())
}

func (s SyncTimestamp) Time() time.Time {
	return time.UnixMilli(int64(s))
}

// ─── Pull types ──────────────────────────────────────────────────────

// PullResponse is the payload returned to the mobile client on pull.
// Matches WatermelonDB synchronize() pullChanges contract exactly.
type PullResponse struct {
	Timestamp SyncTimestamp  `json:"timestamp"`
	Changes   SyncChangeSet  `json:"changes"`
}

// SyncChangeSet contains created/updated/deleted records per table.
type SyncChangeSet struct {
	Farmers    TableChanges `json:"farmers"`
	LandPlots  TableChanges `json:"land_plots"`
	Transactions TableChanges `json:"transactions"`
}

// TableChanges holds the three buckets WatermelonDB expects.
type TableChanges struct {
	Created []map[string]any `json:"created"`
	Updated []map[string]any `json:"updated"`
	Deleted []string         `json:"deleted"` // server IDs
}

// ─── Push types ──────────────────────────────────────────────────────

// PushRequest is the payload sent by the mobile client on push.
type PushRequest struct {
	LastPulledAt SyncTimestamp `json:"last_pulled_at"`
	Changes      PushChangeSet `json:"changes"`
}

// PushChangeSet mirrors what WatermelonDB sends.
type PushChangeSet struct {
	Farmers   PushTableChanges `json:"farmers"`
	LandPlots PushTableChanges `json:"land_plots"`
}

// PushTableChanges uses local WatermelonDB IDs (not server UUIDs for created records).
type PushTableChanges struct {
	Created []map[string]any `json:"created"`
	Updated []map[string]any `json:"updated"`
	Deleted []string         `json:"deleted"` // local IDs
}

// PushResponse maps local WatermelonDB IDs → server UUIDs for newly created records.
// The mobile client uses this to update its server_id column.
type PushResponse struct {
	ServerIDs map[string]map[string]string `json:"server_ids"` // table → {localID: serverUUID}
}

// ─── Conflict resolution ─────────────────────────────────────────────

// ConflictResolution describes how a push conflict was resolved.
type ConflictResolution string

const (
	ConflictServerWins ConflictResolution = "SERVER_WINS"
	ConflictClientWins ConflictResolution = "CLIENT_WINS"
	ConflictNoConflict ConflictResolution = "NO_CONFLICT"
)

// SyncStats is returned in the push response for observability.
type SyncStats struct {
	FarmersCreated   int `json:"farmers_created"`
	FarmersUpdated   int `json:"farmers_updated"`
	PlotsCreated     int `json:"plots_created"`
	PlotsUpdated     int `json:"plots_updated"`
	ConflictsResolved int `json:"conflicts_resolved_server_wins"`
}
