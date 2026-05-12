# Finagra Unity — Low-Level Design

> Version: Step 11 complete | Last updated: 2026-05-12

---

## 1. Database Schema

### 1.1 Core Tables

#### `farmers`
```sql
CREATE TABLE farmers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL UNIQUE,
    aadhaar_hash  TEXT,
    kyc_status    TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED')),
    bank_account  TEXT,
    ifsc_code     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_synced_at TIMESTAMPTZ
);
-- Trigger: update last_synced_at on INSERT/UPDATE
-- Audit trigger: writes to audit_log
```

Domain rule: `CanReceivePayout()` returns true only when `kyc_status == "VERIFIED"` AND `bank_account` AND `ifsc_code` are non-empty.

#### `land_plots`
```sql
CREATE TABLE land_plots (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id  UUID NOT NULL REFERENCES farmers(id),
    name       TEXT NOT NULL,
    area_acres NUMERIC(10,4) NOT NULL CHECK (area_acres > 0),
    geometry   GEOMETRY(POLYGON, 4326),  -- PostGIS SRID 4326
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_synced_at TIMESTAMPTZ
);
CREATE INDEX idx_land_plots_farmer_id ON land_plots(farmer_id);
CREATE INDEX idx_land_plots_geometry ON land_plots USING GIST(geometry);
```

#### `accounts`
```sql
CREATE TABLE accounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id    UUID REFERENCES farmers(id),
    account_type TEXT NOT NULL
                 CHECK (account_type IN ('FARMER_WALLET','PLATFORM_REVENUE',
                                         'AGENT_COMMISSION','RESERVE_FUND')),
    balance      NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    currency     TEXT NOT NULL DEFAULT 'INR',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `transactions`
```sql
CREATE TABLE transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id        UUID NOT NULL REFERENCES farmers(id),
    gross_amount     NUMERIC(20,4) NOT NULL CHECK (gross_amount > 0),
    farmer_gets      NUMERIC(20,4) NOT NULL,  -- 50%
    platform_fee     NUMERIC(20,4) NOT NULL,  -- 25%
    agent_commission NUMERIC(20,4) NOT NULL,  -- 5%
    reserve_fund     NUMERIC(20,4) NOT NULL,  -- 20%
    currency         TEXT NOT NULL DEFAULT 'INR',
    status           TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','COMPLETED','FAILED')),
    description      TEXT,
    idempotency_key  TEXT UNIQUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_farmer_id ON transactions(farmer_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_idempotency_key ON transactions(idempotency_key);
```

#### `journal_entries`
```sql
CREATE TABLE journal_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    account_id     UUID NOT NULL REFERENCES accounts(id),
    entry_type     TEXT NOT NULL CHECK (entry_type IN ('DEBIT','CREDIT')),
    amount         NUMERIC(20,4) NOT NULL CHECK (amount > 0),
    description    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_journal_entries_transaction_id ON journal_entries(transaction_id);
-- Trigger: enforce_double_entry
```

**enforce_double_entry trigger logic:**
After each INSERT, the trigger sums all DEBIT and CREDIT amounts for the transaction. If the transaction has any entries AND debits ≠ credits, it raises an exception. Because entries are inserted as a batch in a single transaction, this fires at the end of the batch.

#### `audit_log`
```sql
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name  TEXT NOT NULL,
    record_id   UUID NOT NULL,
    operation   TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    old_data    JSONB,
    new_data    JSONB,
    actor       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
-- Trigger: audit_log_no_update — RAISES EXCEPTION on UPDATE/DELETE
```

#### `satellite_observations`
```sql
CREATE TABLE satellite_observations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id     UUID NOT NULL REFERENCES land_plots(id),
    source      TEXT NOT NULL,
    ndvi_mean   NUMERIC(6,4) NOT NULL,
    ndvi_min    NUMERIC(6,4) NOT NULL,
    ndvi_max    NUMERIC(6,4) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_satellite_observations_plot_id ON satellite_observations(plot_id);
CREATE INDEX idx_satellite_observations_observed_at ON satellite_observations(observed_at);
```

NDVI domain rule: `CheckNDVI(ndvi_mean)` returns error if `ndvi_mean < 0.30`.

#### `proof_of_action`
```sql
CREATE TABLE proof_of_action (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id     UUID NOT NULL REFERENCES land_plots(id),
    farmer_id   UUID NOT NULL REFERENCES farmers(id),
    longitude   NUMERIC(11,8) NOT NULL,
    latitude    NUMERIC(10,8) NOT NULL,
    accuracy_m  NUMERIC(8,2) NOT NULL,
    photo_hash  TEXT NOT NULL UNIQUE,
    verdict     TEXT NOT NULL CHECK (verdict IN ('VERIFIED','SPOOFED','REJECTED')),
    spoof_reason TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proof_of_action_plot_id ON proof_of_action(plot_id);
CREATE INDEX idx_proof_of_action_farmer_id ON proof_of_action(farmer_id);
CREATE UNIQUE INDEX idx_proof_of_action_photo_hash ON proof_of_action(photo_hash);
```

Anti-spoofing rules evaluated by `EvaluateAccuracy()` in `domain/proof_of_action.go`:
1. `accuracy_m <= 0` → SPOOFED (reason: "zero or negative accuracy")
2. `accuracy_m < 1.0` → SPOOFED (reason: "sub-meter accuracy suggests spoofing")
3. `photo_hash` already exists → SPOOFED (reason: "duplicate photo hash")
4. Otherwise → VERIFIED

---

### 1.2 Trigger Reference

| Trigger Name | Table | Event | Action |
|---|---|---|---|
| `enforce_double_entry` | `journal_entries` | AFTER INSERT | Validate debit sum == credit sum per txn |
| `audit_log_no_update` | `audit_log` | BEFORE UPDATE/DELETE | RAISE EXCEPTION (append-only) |
| `farmers_audit` | `farmers` | AFTER INSERT/UPDATE/DELETE | Write to audit_log |
| `land_plots_audit` | `land_plots` | AFTER INSERT/UPDATE/DELETE | Write to audit_log |
| `transactions_audit` | `transactions` | AFTER INSERT/UPDATE/DELETE | Write to audit_log |
| `journal_entries_audit` | `journal_entries` | AFTER INSERT | Write to audit_log |
| `farmers_sync_ts` | `farmers` | BEFORE INSERT/UPDATE | Set `last_synced_at = now()` |
| `land_plots_sync_ts` | `land_plots` | BEFORE INSERT/UPDATE | Set `last_synced_at = now()` |

---

## 2. API Contract

### 2.1 Base URL and Headers

```
Base: http://localhost:8888/api/v1
Content-Type: application/json
X-Correlation-ID: <uuid>          (auto-generated by middleware if absent)
X-Idempotency-Key: <string>       (required for POST /payouts)
```

### 2.2 Health

#### GET /health/live
```json
200 OK
{"status": "ok"}
```

#### GET /health/ready
```json
200 OK
{"status": "ready", "db": "ok", "redis": "ok"}

503 Service Unavailable
{"status": "degraded", "db": "error: ...", "redis": "ok"}
```

### 2.3 Farmers

#### POST /farmers
```json
Request:
{
  "name": "Ramesh Kumar",
  "phone": "+919876543210",
  "aadhaar_hash": "sha256:...",
  "kyc_status": "VERIFIED",
  "bank_account": "123456789",
  "ifsc_code": "SBIN0001234"
}

201 Created:
{
  "id": "d457d2ae-2dae-4988-a0cc-fc5eda76cd76",
  "name": "Ramesh Kumar",
  "phone": "+919876543210",
  "kyc_status": "VERIFIED",
  "bank_account": "123456789",
  "ifsc_code": "SBIN0001234",
  "created_at": "2026-05-12T10:00:00Z"
}
```

#### GET /farmers/:id
```json
200 OK: (same shape as POST response)
404 Not Found: {"error": "farmer_not_found", "message": "farmer not found"}
```

### 2.4 Land Plots

#### POST /land-plots
```json
Request:
{
  "farmer_id": "d457d2ae-...",
  "name": "Field A",
  "area_acres": 2.5,
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[78.4, 17.4], [78.41, 17.4], [78.41, 17.41], [78.4, 17.41], [78.4, 17.4]]]
  }
}

201 Created:
{
  "id": "8d510da6-22f3-43de-a4cc-0e6e87109526",
  "farmer_id": "d457d2ae-...",
  "name": "Field A",
  "area_acres": 2.5,
  "geometry": { ... },
  "created_at": "2026-05-12T10:00:00Z"
}
```

### 2.5 Payouts

#### POST /payouts
```
Header: X-Idempotency-Key: <unique-string>
```
```json
Request:
{
  "farmer_id": "d457d2ae-...",
  "gross_amount": "50000",
  "currency": "INR",
  "description": "Kharif season disbursement"
}

201 Created:
{
  "id": "txn-uuid",
  "farmer_id": "d457d2ae-...",
  "gross_amount": "50000",
  "farmer_gets": "25000",
  "platform_fee": "12500",
  "agent_commission": "2500",
  "reserve_fund": "10000",
  "currency": "INR",
  "status": "COMPLETED",
  "created_at": "2026-05-12T10:00:00Z"
}

409 Conflict: (same payout, idempotent repeat — same response as 201)
422 Unprocessable Entity: {"error": "farmer_not_eligible", "message": "farmer KYC not verified"}
```

**Split computation (always shopspring/decimal):**
```
farmer_gets      = gross_amount * 0.50
platform_fee     = gross_amount * 0.25
agent_commission = gross_amount * 0.05
reserve_fund     = gross_amount - farmer_gets - platform_fee - agent_commission
```
The `reserve_fund` is computed by subtraction (not multiplication) to absorb any decimal remainder and guarantee the sum equals gross exactly.

### 2.6 Transactions

#### GET /transactions
```json
Query params: ?farmer_id=&status=&limit=50&offset=0

200 OK:
{
  "transactions": [{
    "id": "...",
    "farmer_id": "...",
    "gross_amount": "50000",
    "farmer_gets": "25000",
    "status": "COMPLETED",
    "created_at": "..."
  }],
  "total": 1
}
```

### 2.7 Ledger

#### GET /ledger/balance
```json
200 OK:
{
  "total_gross": "1500000",
  "total_farmer_gets": "750000",
  "total_platform_fee": "375000",
  "total_agent_commission": "75000",
  "total_reserve_fund": "300000",
  "is_balanced": true,
  "transaction_count": 30
}
```

`is_balanced` = `farmer_gets + platform_fee + agent_commission + reserve_fund == total_gross`

### 2.8 GPS Proof of Action

#### POST /land-plots/:plot_id/proof-of-action
```json
Request:
{
  "farmer_id": "d457d2ae-...",
  "longitude": 78.4005,
  "latitude": 17.4005,
  "accuracy_m": 5.2,
  "photo_hash": "sha256:unique-hash"
}

201 Created:
{
  "id": "proof-uuid",
  "plot_id": "8d510da6-...",
  "farmer_id": "d457d2ae-...",
  "verdict": "VERIFIED",
  "accuracy_m": 5.2,
  "spoof_reason": null,
  "created_at": "..."
}

201 Created (spoofed):
{
  "verdict": "SPOOFED",
  "spoof_reason": "duplicate photo hash"
}
```

### 2.9 Satellite Observations

#### POST /satellite/observations
```json
Request:
{
  "plot_id": "8d510da6-...",
  "source": "SENTINEL-2",
  "ndvi_mean": "0.65",
  "ndvi_min": "0.55",
  "ndvi_max": "0.75",
  "observed_at": "2026-05-12T08:00:00Z"
}

201 Created:
{
  "id": "obs-uuid",
  "plot_id": "...",
  "ndvi_mean": "0.65",
  "source": "SENTINEL-2",
  "observed_at": "2026-05-12T08:00:00Z"
}

422 Unprocessable Entity (NDVI < 0.30):
{
  "error": "ndvi_below_threshold",
  "message": "NDVI mean 0.18 is below minimum threshold 0.30"
}
```

### 2.10 Sync

#### POST /sync/push
```json
Request:
{
  "client_timestamp": 1747046400000,
  "farmers": [{
    "local_id": "local-uuid",
    "name": "Farmer Name",
    "phone": "+91...",
    "kyc_status": "PENDING"
  }],
  "plots": [{
    "local_id": "local-plot-uuid",
    "farmer_local_id": "local-uuid",
    "name": "Field A",
    "area_acres": 1.5
  }]
}

200 OK:
{
  "server_timestamp": 1747046400123,
  "farmers_created": 1,
  "plots_created": 1,
  "farmers_updated": 0,
  "plots_updated": 0,
  "total_records": 2
}
```

#### GET /sync/pull
```
Query: ?since=<unix_ms_timestamp>

200 OK:
{
  "server_timestamp": 1747046400123,
  "farmers": [...],
  "plots": [...],
  "transactions": [...]
}
```

### 2.11 Events (SSE)

#### GET /events/stream
```
Request Headers:
Accept: text/event-stream

Response Headers:
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

SSE frame format:
```
data: {"id":"uuid","type":"payout.completed","timestamp":"2026-05-12T10:00:00Z","data":{...}}

: ping
```

- Initial frame on connect: `data: {"type":"connected","timestamp":"..."}`
- Keep-alive: `: ping` every 15 seconds
- All NATS subjects forwarded: `finagra.payout.completed`, `finagra.proof.verdict`, `finagra.ndvi.alert`, `finagra.sync.batch`

### 2.12 Metrics

#### GET /metrics
```
Content-Type: text/plain; version=0.0.4
(Prometheus exposition format)
```

Custom metrics exposed:
```
finagra_payouts_total{status="COMPLETED"}
finagra_payouts_amount_inr{bucket="farmer_gets|platform_fee|..."}
finagra_ndvi_observations_total{below_threshold="true|false"}
finagra_proof_verdicts_total{verdict="VERIFIED|SPOOFED"}
finagra_sync_batches_total
```

---

## 3. Domain Model

### 3.1 Entities

```go
type Farmer struct {
    ID          string    // UUID
    Name        string
    Phone       string    // unique
    AadhaarHash string
    KYCStatus   KYCStatus // PENDING | VERIFIED | REJECTED
    BankAccount string
    IFSCCode    string
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

func (f *Farmer) CanReceivePayout() bool {
    return f.KYCStatus == KYCVerified && f.BankAccount != "" && f.IFSCCode != ""
}
```

```go
type Transaction struct {
    ID              string
    FarmerID        string
    GrossAmount     decimal.Decimal
    FarmerGets      decimal.Decimal  // GrossAmount * 0.50
    PlatformFee     decimal.Decimal  // GrossAmount * 0.25
    AgentCommission decimal.Decimal  // GrossAmount * 0.05
    ReserveFund     decimal.Decimal  // GrossAmount - others (remainder absorber)
    Currency        string
    Status          PayoutStatus     // PENDING | COMPLETED | FAILED
    IdempotencyKey  string
}
```

```go
type PlatformEvent struct {
    ID        string          // UUID
    Type      EventType       // "payout.completed" | "proof.verdict" | "ndvi.alert" | "sync.batch"
    Timestamp time.Time
    Data      json.RawMessage // typed payload
}
```

### 3.2 Value Objects

```go
// NDVI threshold — never change without TestMathLockdown
const NDVIThreshold = 0.30

func CheckNDVI(ndviMean decimal.Decimal) error {
    threshold := decimal.NewFromFloat(NDVIThreshold)
    if ndviMean.LessThan(threshold) {
        return DomainError{Code: ErrNDVIBelowThreshold, ...}
    }
    return nil
}
```

```go
func EvaluateAccuracy(accuracyM float64) (VerdictType, string) {
    if accuracyM <= 0 { return VerdictSpoofed, "zero or negative accuracy" }
    if accuracyM < 1.0 { return VerdictSpoofed, "sub-meter accuracy suggests spoofing" }
    return VerdictVerified, ""
}
```

---

## 4. Usecase Layer Contracts

Each usecase struct holds its dependencies via interfaces:

```go
// Payout
type PayoutUsecase struct {
    txnRepo     TransactionRepository
    farmerRepo  FarmerRepository
    satRepo     SatelliteRepository  // checks NDVI history
    publisher   EventPublisher
    log         zerolog.Logger
}

// ProofOfAction
type ProofOfActionUsecase struct {
    proofRepo   ProofRepository
    plotRepo    LandPlotRepository
    farmerRepo  FarmerRepository
    publisher   EventPublisher
    log         zerolog.Logger
}

// Satellite
type SatelliteUsecase struct {
    satRepo     SatelliteRepository
    plotRepo    LandPlotRepository
    publisher   EventPublisher
    log         zerolog.Logger
}

// Sync
type SyncUsecase struct {
    repo      SyncRepository
    publisher EventPublisher
    log       zerolog.Logger
}
```

### EventPublisher Interface

```go
type EventPublisher interface {
    Publish(ctx context.Context, subject string, event domain.PlatformEvent) error
}

type NATSPublisher struct { nc *nats.Conn }
func (p *NATSPublisher) Publish(_ context.Context, subject string, event domain.PlatformEvent) error {
    data, _ := json.Marshal(event)
    return p.nc.Publish(subject, data)
}

type NoopPublisher struct{}
func (p *NoopPublisher) Publish(_ context.Context, _ string, _ domain.PlatformEvent) error {
    return nil  // silently drops all events — used when NATS is unavailable
}
```

All usecases call `_ = u.publisher.Publish(...)` (fire-and-forget) — NATS failure never blocks or rolls back a domain operation.

---

## 5. Repository Interfaces

```go
type FarmerRepository interface {
    Create(ctx context.Context, f *domain.Farmer) error
    GetByID(ctx context.Context, id string) (*domain.Farmer, error)
    GetByPhone(ctx context.Context, phone string) (*domain.Farmer, error)
}

type TransactionRepository interface {
    Create(ctx context.Context, txn *domain.Transaction, entries []domain.JournalEntry) error
    GetByID(ctx context.Context, id string) (*domain.Transaction, error)
    GetByIdempotencyKey(ctx context.Context, key string) (*domain.Transaction, error)
    List(ctx context.Context, filter TransactionFilter) ([]domain.Transaction, int, error)
    GetLedgerBalance(ctx context.Context) (*domain.PlatformMetrics, error)
}

type LandPlotRepository interface {
    Create(ctx context.Context, plot *domain.LandPlot) error
    GetByID(ctx context.Context, id string) (*domain.LandPlot, error)
    ListByFarmerID(ctx context.Context, farmerID string) ([]domain.LandPlot, error)
}

type ProofRepository interface {
    Create(ctx context.Context, proof *domain.ProofOfAction) error
    GetByPhotoHash(ctx context.Context, hash string) (*domain.ProofOfAction, error)
    ListByPlotID(ctx context.Context, plotID string) ([]domain.ProofOfAction, error)
}

type SatelliteRepository interface {
    Create(ctx context.Context, obs *domain.SatelliteObservation) error
    ListByPlotID(ctx context.Context, plotID string) ([]domain.SatelliteObservation, error)
}

type SyncRepository interface {
    Push(ctx context.Context, req *domain.PushRequest) (*domain.PushResponse, error)
    Pull(ctx context.Context, since time.Time) (*domain.PullResponse, error)
}
```

---

## 6. Idempotency Protocol

```
Request arrives with X-Idempotency-Key header
             │
             ▼
  Redis GET idempotency:{key}
             │
        ┌────┴────┐
        │  exists? │
        └────┬────┘
      yes    │    no
       │     │     │
       ▼     │     ▼
   Return    │   Process request
   cached    │   (usecase + DB)
   response  │        │
             │        ▼
             │   Redis SET idempotency:{key}
             │   Value: {status_code, response_body}
             │   TTL: 24 hours
             │        │
             │        ▼
             │   Return 201 response
             │
         [thundering herd race]:
         Two requests with same key arrive simultaneously.
         Both miss Redis. Both hit DB.
         DB unique constraint on idempotency_key allows only one INSERT.
         Loser gets 500 (pgx unique violation).
         Winner's response is cached in Redis.
         Client should retry the loser — will hit Redis cache and get 200.
```

Routes excluded from idempotency middleware:
- `GET` methods (all)
- `/health/*`
- `/events/stream`
- `/metrics`

---

## 7. NATS Subject Topology

```
finagra.payout.completed  →  PayoutCompletedData{txn_id, farmer_id, gross_amount, farmer_gets, currency}
finagra.proof.verdict     →  ProofVerdictData{proof_id, plot_id, farmer_id, verdict, accuracy_m, spoof_reason}
finagra.ndvi.alert        →  NDVIAlertData{plot_id, ndvi_mean, source, threshold}
finagra.sync.batch        →  SyncBatchData{farmers_created, plots_created, total_records}

finagra.>                 →  SSE handler subscribes to all of the above
```

All messages are `PlatformEvent` JSON:
```json
{
  "id": "uuid",
  "type": "payout.completed",
  "timestamp": "2026-05-12T10:00:00Z",
  "data": { ... }
}
```

---

## 8. SSE Protocol (EventFeed.tsx)

```typescript
// Client behavior:
const es = new EventSource('/api/v1/events/stream');

es.onmessage = (e) => {
    const event: PlatformEvent = JSON.parse(e.data);
    if (event.type === 'connected') return;  // filter heartbeat
    setEvents(prev => [event, ...prev].slice(0, 50));  // max 50 events
};

es.onerror = () => {
    setStatus('reconnecting');
    es.close();
    setTimeout(() => reconnect(), 3000);  // reconnect after 3s
};
```

Connection lifecycle:
1. Client opens `EventSource` connection
2. Server sends `data: {"type":"connected",...}` immediately
3. Server subscribes to `finagra.>` via `nc.ChanSubscribe`
4. Server relays all NATS messages as SSE `data:` frames
5. Server sends `: ping` keep-alive every 15s
6. On `ctx.Done()` (client disconnect): subscription is unsubscribed, goroutine exits

---

## 9. MCP Tool Signatures

| Tool Name | Input Schema | Output |
|---|---|---|
| `create-land-plot` | `farmer_id, name, area_acres, geometry?` | LandPlot object |
| `get-ledger-balance` | (none) | PlatformMetrics with is_balanced |
| `get-platform-metrics` | (none) | Aggregated metrics snapshot |
| `get-ndvi-observations` | `plot_id, limit?` | Array of SatelliteObservation |
| `create-payout` | `farmer_id, gross_amount, currency?, description?` | Transaction with splits |
| `submit-proof-of-action` | `plot_id, farmer_id, longitude, latitude, accuracy_m, photo_hash` | ProofOfAction with verdict |
| `list-transactions` | `farmer_id?, status?, limit?` | Array of Transaction |
| `create-farmer` | `name, phone, kyc_status?, bank_account?, ifsc_code?` | Farmer object |

### MCP Agentic Workflows

**smart-payout** (3-step):
1. GET farmer → verify KYC status
2. GET latest proof → confirm VERIFIED verdict
3. POST /payouts → disburse with computed splits

**field-inspection** (3-step):
1. GET NDVI observations for plot → check latest value
2. POST proof-of-action → submit GPS evidence
3. Correlate NDVI + GPS verdict → return inspection report

**platform-audit** (2-step):
1. GET /ledger/balance → verify is_balanced
2. GET /transactions → sample recent activity
3. Return audit summary with balance status

---

## 10. Frontend Component Contracts

### EventCard Props

```typescript
interface PlatformEvent {
    id: string;
    type: string;  // "payout.completed" | "proof.verdict" | "ndvi.alert" | "sync.batch"
    timestamp: string;  // ISO 8601
    data: Record<string, unknown>;
}

// Renders:
// - payout.completed → "Payout Completed" badge + INR gross + farmer_gets + txn_id
// - proof.verdict    → verdict badge (VERIFIED=emerald, SPOOFED=red) + accuracy_m
// - ndvi.alert       → "NDVI Alert" badge + ndvi_mean + source + threshold
// - sync.batch       → "Mobile Sync" badge + farmers_created + plots_created
// - unknown          → raw type string as fallback label
// Always: <article aria-label="[EventType] event"> with <time dateTime={timestamp}>
```

### NDVIGauge Props

```typescript
interface NDVIGaugeProps {
    value: number;  // 0–1
    label?: string;
}
// Renders: <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={1}>
// Color: value >= 0.5 → emerald, value >= 0.3 → yellow, value < 0.3 → red
```

---

## 11. WatermelonDB Schema

```javascript
// apps/mobile/watermelon/schema.js
tableSchema({
    name: 'farmers',
    columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string' },
        { name: 'kyc_status', type: 'string' },
        { name: 'bank_account', type: 'string', isOptional: true },
        { name: 'last_synced_at', type: 'number', isOptional: true },
        { name: 'is_dirty', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
    ]
})

tableSchema({
    name: 'land_plots',
    columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'farmer_id', type: 'string' },  // local WatermelonDB ID
        { name: 'farmer_server_id', type: 'string', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'area_acres', type: 'number' },
        { name: 'last_synced_at', type: 'number', isOptional: true },
        { name: 'is_dirty', type: 'boolean' },
    ]
})
```

Sync invariant: `last_synced_at` is always set server-side via trigger. Conflict resolution: the record with the later `last_synced_at` wins during UPSERT.

---

## 12. Error Response Format

All domain errors follow:
```json
{
  "error": "snake_case_error_code",
  "message": "human readable description",
  "correlation_id": "uuid"
}
```

Error codes and HTTP status mappings:

| Code | HTTP Status | Scenario |
|---|---|---|
| `farmer_not_found` | 404 | GET /farmers/:id with unknown UUID |
| `plot_not_found` | 404 | GET /land-plots/:id with unknown UUID |
| `farmer_not_eligible` | 422 | Payout to non-KYC-verified farmer |
| `ndvi_below_threshold` | 422 | NDVI mean < 0.30 |
| `duplicate_idempotency_key` | 409 | Repeated payout (returns cached response) |
| `invalid_request` | 400 | Missing required fields or bad types |
| `internal_error` | 500 | Unexpected DB/system errors |
