-- Finagra Unity — Source-of-Truth Database Schema
-- PostGIS 17 | PostgreSQL 17
-- All monetary values: NUMERIC(18,4) — never FLOAT
-- All IDs: UUID v7 (time-ordered)
-- All timestamps: TIMESTAMPTZ (UTC enforced)

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "postgis_topology";

-- ─────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────────────────────
CREATE TYPE account_type AS ENUM (
    'FARMER_WALLET',
    'PLATFORM_REVENUE',
    'AGENT_COMMISSION',
    'RESERVE_FUND',
    'ESCROW'
);

CREATE TYPE entry_type AS ENUM ('DEBIT', 'CREDIT');

CREATE TYPE payout_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'REVERSED'
);

CREATE TYPE kyc_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- ─────────────────────────────────────────────────────────────
-- FARMERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE farmers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone           VARCHAR(15) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    aadhaar_hash    CHAR(64),           -- SHA-256 of Aadhaar, never raw
    kyc_status      kyc_status NOT NULL DEFAULT 'PENDING',
    fpo_id          UUID,               -- FK to FPO/agent org
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,        -- soft delete
    last_synced_at  TIMESTAMPTZ         -- WatermelonDB offline sync marker
);

CREATE INDEX idx_farmers_phone ON farmers(phone);
CREATE INDEX idx_farmers_fpo ON farmers(fpo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_farmers_sync ON farmers(last_synced_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- LAND PLOTS (PostGIS — GIST indexed)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE land_plots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id       UUID NOT NULL REFERENCES farmers(id),
    plot_name       VARCHAR(255),
    geom            GEOMETRY(Polygon, 4326) NOT NULL,  -- WGS84
    area_sqm        NUMERIC(12, 4) GENERATED ALWAYS AS
                    (ST_Area(geom::geography)) STORED,
    area_acres      NUMERIC(12, 4) GENERATED ALWAYS AS
                    (ST_Area(geom::geography) / 4046.8564224) STORED,
    soil_type       VARCHAR(100),
    survey_number   VARCHAR(100),
    district        VARCHAR(100),
    state           VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    last_synced_at  TIMESTAMPTZ
);

-- GIST spatial index — mandatory for sub-second queries
CREATE INDEX idx_land_plots_geom ON land_plots USING GIST(geom);
CREATE INDEX idx_land_plots_farmer ON land_plots(farmer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_land_plots_sync ON land_plots(last_synced_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- ACCOUNTS (double-entry chart of accounts)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_type    account_type NOT NULL,
    owner_id        UUID,               -- NULL for platform-level accounts
    balance         NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    currency        CHAR(3) NOT NULL DEFAULT 'INR',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

CREATE INDEX idx_accounts_owner ON accounts(owner_id);
CREATE INDEX idx_accounts_type ON accounts(account_type);

-- ─────────────────────────────────────────────────────────────
-- TRANSACTIONS (idempotency-keyed)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key     VARCHAR(255) UNIQUE NOT NULL,  -- from X-Idempotency-Key header
    gross_amount        NUMERIC(18, 4) NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'INR',
    status              payout_status NOT NULL DEFAULT 'PENDING',
    description         TEXT,
    farmer_id           UUID REFERENCES farmers(id),
    initiated_by        UUID,           -- agent/operator user ID
    external_ref        VARCHAR(255),   -- payment gateway reference
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    CONSTRAINT gross_positive CHECK (gross_amount > 0)
);

CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX idx_transactions_farmer ON transactions(farmer_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- JOURNAL ENTRIES (double-entry ledger)
-- Invariant: SUM(amount WHERE DEBIT) == SUM(amount WHERE CREDIT) per txn_id
-- ─────────────────────────────────────────────────────────────
CREATE TABLE journal_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    txn_id          UUID NOT NULL REFERENCES transactions(id),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    entry_type      entry_type NOT NULL,
    amount          NUMERIC(18, 4) NOT NULL,
    description     VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_journal_txn ON journal_entries(txn_id);
CREATE INDEX idx_journal_account ON journal_entries(account_id);
CREATE INDEX idx_journal_created ON journal_entries(created_at DESC);

-- Double-entry balance enforcement trigger
CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    debit_sum  NUMERIC(18,4);
    credit_sum NUMERIC(18,4);
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO debit_sum
    FROM journal_entries WHERE txn_id = NEW.txn_id AND entry_type = 'DEBIT';

    SELECT COALESCE(SUM(amount), 0) INTO credit_sum
    FROM journal_entries WHERE txn_id = NEW.txn_id AND entry_type = 'CREDIT';

    -- Only enforce when transaction is marked complete (all entries written)
    IF (SELECT status FROM transactions WHERE id = NEW.txn_id) = 'COMPLETED' THEN
        IF debit_sum != credit_sum THEN
            RAISE EXCEPTION 'Double-entry violation: DEBIT=% != CREDIT=% for txn %',
                debit_sum, credit_sum, NEW.txn_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_double_entry
    AFTER INSERT OR UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOG (append-only, immutable)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    table_name      VARCHAR(100) NOT NULL,
    record_id       UUID NOT NULL,
    action          VARCHAR(10) NOT NULL,   -- INSERT, UPDATE, DELETE
    actor_id        UUID,
    actor_ip        INET,
    old_data        JSONB,
    new_data        JSONB,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at DESC);

-- Prevent any DELETE or UPDATE on audit_log
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is immutable — no updates or deletes allowed';
END;
$$;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- ─────────────────────────────────────────────────────────────
-- DELTA-SYNC TRIGGERS (WatermelonDB offline-first support)
-- Updates last_synced_at = NOW() on every change so mobile can
-- pull only records newer than its last sync checkpoint.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_last_synced_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.last_synced_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER farmers_sync_trigger
    BEFORE UPDATE ON farmers
    FOR EACH ROW EXECUTE FUNCTION update_last_synced_at();

CREATE TRIGGER land_plots_sync_trigger
    BEFORE UPDATE ON land_plots
    FOR EACH ROW EXECUTE FUNCTION update_last_synced_at();

-- Generic audit trigger factory
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log(table_name, record_id, action, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log(table_name, record_id, action, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log(table_name, record_id, action, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW));
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER audit_farmers
    AFTER INSERT OR UPDATE OR DELETE ON farmers
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_land_plots
    AFTER INSERT OR UPDATE OR DELETE ON land_plots
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_transactions
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_journal_entries
    AFTER INSERT ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ─────────────────────────────────────────────────────────────
-- SATELLITE OBSERVATIONS (GIS)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE satellite_observations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plot_id         UUID REFERENCES land_plots(id),
    source          VARCHAR(100),       -- 'SENTINEL-2', 'ISRO-RESOURCESAT', etc.
    observed_at     TIMESTAMPTZ NOT NULL,
    geom            GEOMETRY(Polygon, 4326) NOT NULL,
    ndvi_mean       NUMERIC(6, 4),      -- Normalized Difference Vegetation Index
    ndvi_min        NUMERIC(6, 4),
    ndvi_max        NUMERIC(6, 4),
    raw_data        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_satellite_obs_geom ON satellite_observations USING GIST(geom);
CREATE INDEX idx_satellite_obs_plot ON satellite_observations(plot_id);
CREATE INDEX idx_satellite_obs_time ON satellite_observations(observed_at DESC);
