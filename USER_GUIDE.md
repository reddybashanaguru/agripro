# Finagra Unity — User Guide

> Master manual for investors, engineers, and field operators.
> Platform: ₹500Cr-scale AgTech payments | 202+ tests | 12 production-grade modules
>
> **Live Demo** (no backend needed): https://finagra-unity.vercel.app
> **Mobile Demo**: https://finagra-unity.vercel.app/mobile-demo

---

## Table of Contents

1. [Prerequisites & Local Setup](#1-prerequisites--local-setup)
2. [The 50/25/5/20 Flow — End-to-End Transaction Walk-Through](#2-the-502552020-flow--end-to-end-transaction-walk-through)
3. [Module: Backend API](#3-module-backend-api)
4. [Module: Web Frontend — Investor Command Center](#4-module-web-frontend--investor-command-center)
5. [Module: Mobile App — Field Operations](#5-module-mobile-app--field-operations)
6. [Module: AI / MCP Agent Server](#6-module-ai--mcp-agent-server)
7. [CI/CD Pipeline — 5 Gates Explained](#7-cicd-pipeline--5-gates-explained)
8. [Observability — Traces, Metrics, Events](#8-observability--traces-metrics-events)
9. [SOLID Principles Across the Platform](#9-solid-principles-across-the-platform)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites & Local Setup

### Required Tools

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | latest | https://docs.docker.com/desktop |
| Go | 1.25+ | `brew install go` |
| Node.js | 22+ | `brew install node` |
| pnpm | 9+ | `npm install -g pnpm@9` |
| psql CLI | any | `brew install postgresql` |
| git | any | pre-installed on macOS |

### 1.1 Clone & Verify Structure

```bash
git clone https://github.com/reddybashanaguru/agripro.git finagra-unity
cd finagra-unity
ls
# Expected: apps/ docs/ infra/ schema/ tests/ CLAUDE.md README.md USER_GUIDE.md
```

### 1.2 Start All Infrastructure

```bash
cd infra/docker
docker-compose up -d
```

**Success criteria — what you should see:**

```bash
docker-compose ps
# NAME                STATUS
# finagra-postgres    Up (healthy)
# finagra-redis       Up (healthy)
# finagra-nats        Up (healthy)
# finagra-prometheus  Up
# finagra-grafana     Up
# finagra-adminer     Up
```

All 6 services `Up`. Postgres and Redis must show `(healthy)` before proceeding.

### 1.3 Apply Database Schema

```bash
psql "postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev?sslmode=disable" \
  -f schema/schema.sql
```

**Success criteria:**

```
CREATE TABLE
CREATE TABLE
... (8 table confirmations)
CREATE INDEX
... (16+ index confirmations)
CREATE TRIGGER
... (8 trigger confirmations)
```

### 1.4 Start the Backend

```bash
cd apps/backend
DATABASE_URL="postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev?sslmode=disable" \
REDIS_URL="redis://localhost:6379" \
NATS_URL="nats://localhost:4222" \
go run .
```

**Success criteria — logs you should see:**

```json
{"level":"info","service":"finagra-unity","msg":"NATS connected","url":"nats://localhost:4222"}
{"level":"info","service":"finagra-unity","msg":"database connected"}
{"level":"info","service":"finagra-unity","msg":"redis connected"}
{"level":"info","service":"finagra-unity","msg":"server starting","port":8888}
```

Quick smoke test:

```bash
curl -s http://localhost:8888/health/ready | jq
# {"status":"ready","db":"ok","redis":"ok"}
```

### 1.5 Start the Web Frontend

```bash
# From repo root
pnpm install          # installs all workspace dependencies
cd apps/web
pnpm dev
```

**Success criteria:**

```
▲ Next.js 15.x.x
- Local: http://localhost:3000
- Ready in 1234ms
```

Open `http://localhost:3000` — you should see the **Finagra Investor Command Center** dashboard with 4 metric cards.

### 1.6 Install Node Dependencies for MCP

```bash
cd apps/mcp
pnpm build
# Expected: dist/server.js created
```

---

## 2. The 50/25/5/20 Flow — End-to-End Transaction Walk-Through

This section walks through a complete agricultural payout from the moment a field representative submits GPS evidence to the moment the farmer's account is credited and the investor sees the event on their dashboard.

```
STEP 1          STEP 2          STEP 3          STEP 4          STEP 5
Field Rep       GPS Proof       Satellite       Payout          Investor
uploads    →    submitted  →    NDVI check  →   disbursed  →    sees event
plot data       (anti-spoof)    (crop health)   (8 journal      on dashboard
                                                entries)        via SSE
```

### Step 1 — Register Farmer and Land Plot

The field representative registers a new farmer and maps their land plot with GPS polygon.

```bash
# Register farmer
curl -s -X POST http://localhost:8888/api/v1/farmers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ramesh Kumar",
    "phone": "+919876543210",
    "kyc_status": "VERIFIED",
    "bank_account": "123456789012",
    "ifsc_code": "SBIN0001234"
  }' | jq

# Save the returned id
FARMER_ID="<paste id here>"

# Create land plot
curl -s -X POST http://localhost:8888/api/v1/land-plots \
  -H "Content-Type: application/json" \
  -d "{
    \"farmer_id\": \"$FARMER_ID\",
    \"name\": \"Kharif Field A\",
    \"area_acres\": 2.5,
    \"geometry\": {
      \"type\": \"Polygon\",
      \"coordinates\": [[[78.4,17.4],[78.41,17.4],[78.41,17.41],[78.4,17.41],[78.4,17.4]]]
    }
  }" | jq

PLOT_ID="<paste id here>"
```

**What happened:** A `farmers` row and a `land_plots` row were inserted. PostGIS stored the polygon geometry as SRID 4326 with a GIST spatial index for fast boundary queries. Both rows were written to `audit_log` by DB triggers automatically.

---

### Step 2 — Submit GPS Proof of Action

The field rep is physically at the plot. The mobile app submits their GPS coordinates and a photo hash.

```bash
curl -s -X POST "http://localhost:8888/api/v1/land-plots/$PLOT_ID/proof-of-action" \
  -H "Content-Type: application/json" \
  -d "{
    \"farmer_id\": \"$FARMER_ID\",
    \"longitude\": 78.4005,
    \"latitude\": 17.4005,
    \"accuracy_m\": 4.8,
    \"photo_hash\": \"sha256:$(openssl rand -hex 32)\"
  }" | jq
```

**Success criteria:**

```json
{
  "id": "proof-uuid",
  "verdict": "VERIFIED",
  "accuracy_m": 4.8,
  "spoof_reason": null
}
```

**What happened:** The domain function `EvaluateAccuracy()` checked:
- `accuracy_m > 0` ✓
- `accuracy_m >= 1.0` ✓
- `photo_hash` is unique ✓

Verdict = **VERIFIED**. The event `finagra.proof.verdict` was published to NATS. Any open SSE clients (investors on the Activity page) received this in real time.

**Anti-spoofing demonstration:**

```bash
# Try submitting the same photo_hash again
curl -s -X POST "http://localhost:8888/api/v1/land-plots/$PLOT_ID/proof-of-action" \
  -H "Content-Type: application/json" \
  -d "{
    \"farmer_id\": \"$FARMER_ID\",
    \"longitude\": 78.4005,
    \"latitude\": 17.4005,
    \"accuracy_m\": 4.8,
    \"photo_hash\": \"sha256:SAME_HASH_AS_ABOVE\"
  }" | jq
# Returns: {"verdict": "SPOOFED", "spoof_reason": "duplicate photo hash"}
```

---

### Step 3 — Ingest Satellite NDVI Observation

A satellite data pipeline pushes NDVI (crop health index) for the plot.

```bash
# Healthy crop — will be accepted
curl -s -X POST http://localhost:8888/api/v1/satellite/observations \
  -H "Content-Type: application/json" \
  -d "{
    \"plot_id\": \"$PLOT_ID\",
    \"source\": \"SENTINEL-2\",
    \"ndvi_mean\": \"0.65\",
    \"ndvi_min\": \"0.55\",
    \"ndvi_max\": \"0.75\",
    \"observed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }" | jq
# Returns: 201 Created — observation stored
```

**Demonstrate NDVI enforcement:**

```bash
# Distressed crop below 0.30 threshold — will be rejected
curl -s -X POST http://localhost:8888/api/v1/satellite/observations \
  -H "Content-Type: application/json" \
  -d "{
    \"plot_id\": \"$PLOT_ID\",
    \"source\": \"SENTINEL-2\",
    \"ndvi_mean\": \"0.18\",
    \"ndvi_min\": \"0.10\",
    \"ndvi_max\": \"0.25\",
    \"observed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }" | jq
# Returns: 422 — {"error":"ndvi_below_threshold","message":"NDVI mean 0.18 is below minimum threshold 0.30"}
# AND: finagra.ndvi.alert published to NATS → SSE clients notified
```

**What happened:** The domain layer enforced `CheckNDVI()`. Values below 0.30 are rejected from entering the ledger system. The 0.30 threshold is hardcoded as a domain constant — changing it fails `TestMathLockdown`.

---

### Step 4 — Disburse Payout (The 50/25/5/20 Split)

With the farmer KYC-verified, GPS proof confirmed, and healthy NDVI on record, the payout is disbursed.

```bash
curl -s -X POST http://localhost:8888/api/v1/payouts \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: kharif-2026-$(openssl rand -hex 8)" \
  -d "{
    \"farmer_id\": \"$FARMER_ID\",
    \"gross_amount\": \"100000\",
    \"currency\": \"INR\",
    \"description\": \"Kharif season disbursement — Field A\"
  }" | jq
```

**Success criteria:**

```json
{
  "id": "txn-uuid",
  "gross_amount": "100000",
  "farmer_gets": "50000",
  "platform_fee": "25000",
  "agent_commission": "5000",
  "reserve_fund": "20000",
  "status": "COMPLETED"
}
```

**Verify the math:**

```
₹1,00,000 gross  →  ₹50,000 farmer (50%)
                     ₹25,000 platform (25%)
                     ₹5,000  agent (5%)
                     ₹20,000 reserve (20%)
                     ─────────────────────
                     ₹1,00,000 ✓ (decimal equality, enforced by DB trigger)
```

**What happened in the database:** 8 journal entries were created in a single DB transaction (4 debits + 4 credits). The `enforce_double_entry` trigger verified the entries balance before commit. The `audit_log` table received a row for each INSERT. A `finagra.payout.completed` event was published to NATS.

**Verify idempotency:**

```bash
# Replay the exact same request with the same idempotency key
# Returns: identical 201 response, zero DB writes (Redis cache hit)
```

---

### Step 5 — Investor Sees Event on Dashboard

Open your browser at `http://localhost:3000/activity`.

**What you see:**
- A green **"Payout Completed"** card appears within 1–2 seconds of the payout
- The card shows: gross amount ₹1,00,000 | farmer gets ₹50,000 | truncated txn ID
- The status pill shows **"connected"** with an animated dot

The Dashboard at `http://localhost:3000` now reflects updated transaction counts and ledger balance (rendered server-side on each request — hard-refresh to get the latest).

Check ledger balance:

```bash
curl -s http://localhost:8888/api/v1/ledger/balance | jq
# {
#   "total_gross": "100000",
#   "total_farmer_gets": "50000",
#   "total_platform_fee": "25000",
#   "total_agent_commission": "5000",
#   "total_reserve_fund": "20000",
#   "is_balanced": true
# }
```

`"is_balanced": true` is the platform's financial health signal. If this ever shows `false`, the double-entry constraint was bypassed (which is DB-level impossible, but the API checks it anyway).

---

## 3. Module: Backend API

### Purpose

The backend solves the core AgTech financial problem: **disbursing agricultural credit to verified farmers at scale, with zero double-spending, complete audit trail, and fraud prevention** — without relying on external payment rail integrity.

It enforces:
- Decimal precision on all money (no floating-point errors at ₹500Cr scale)
- GPS anti-spoofing before any payout is authorised
- Satellite crop health enforcement before capital deployment
- An immutable audit trail that satisfies regulatory requirements

### Key Commands

```bash
# Run backend (development)
cd apps/backend
go run .

# Build production binary
go build -o /tmp/finagra-api .
/tmp/finagra-api

# Run all regression tests (requires infra)
cd tests/regression
go test -tags integration -v ./... -timeout 180s

# Run math lockdown only (no infra needed — runs in <1s)
go test -v ./... -run "TestMathLockdown|TestDoubleEntryBalance|TestDomainErrors"

# Run a specific test suite
go test -tags integration -v ./... -run TestPayouts
go test -tags integration -v ./... -run TestProofOfAction
go test -tags integration -v ./... -run TestSatellite
go test -tags integration -v ./... -run TestEvents
go test -tags integration -v ./... -run TestNDVIBoundary

# Check API is live
curl -s http://localhost:8888/health/ready | jq
```

### Success Criteria

| Check | Command | Expected |
|---|---|---|
| Server healthy | `curl /health/ready` | `{"status":"ready","db":"ok","redis":"ok"}` |
| Math tests pass | `go test -run TestMathLockdown` | `PASS` — 11/11 |
| Integration tests | `go test -tags integration ./...` | `ok` — 38+/38+ |
| Payout splits correct | `curl POST /payouts` with ₹100000 | `farmer_gets: 50000` |
| Idempotency works | Same key twice | Both return 201, 1 DB row |
| Anti-spoof fires | Duplicate photo_hash | `verdict: SPOOFED` |
| NDVI blocks at 0.2999 | `ndvi_mean: "0.2999"` | `422 ndvi_below_threshold` |
| NDVI allows at 0.3000 | `ndvi_mean: "0.3000"` | `201 Created` |

### SOLID Principles in Action

**Single Responsibility**
Each file has one job. `payout_usecase.go` only orchestrates the payout business flow. `postgres_payout_repository.go` only handles DB queries. `payout_handler.go` only translates HTTP ↔ Usecase. None of these files know about each other's internals.

**Open/Closed**
The `EventPublisher` interface is open for extension (add a new publisher: Kafka, SQS) without modifying any usecase. `NATSPublisher` and `NoopPublisher` are two implementations — swapped by the DI wiring in `main.go`.

**Liskov Substitution**
`NoopPublisher` fully satisfies the `EventPublisher` interface. When NATS is unavailable at startup, `main.go` injects `NoopPublisher` — every usecase continues working identically, silently dropping events. No usecase needs to know which implementation it has.

**Interface Segregation**
Repository interfaces are fine-grained per domain. `SatelliteUsecase` holds a `SatelliteRepository` and a `LandPlotRepository` — it does not have access to `FarmerRepository` or `TransactionRepository`. Each usecase requests exactly the data access it needs, no more.

**Dependency Inversion**
`PayoutUsecase` depends on `FarmerRepository` (interface), `TransactionRepository` (interface), and `EventPublisher` (interface) — never on `PostgresFarmerRepository` or `NATSPublisher` (concrete types). All concrete types are wired in `main.go` and injected downward.

---

## 4. Module: Web Frontend — Investor Command Center

### Purpose

The web app solves the **investor visibility problem** in AgTech: traditionally, an investor deploying capital to agricultural credit has zero real-time insight into where money is, what crops look like, or whether field activity is genuine. The Investor Command Center provides:

- Live dashboard with key metrics
- Global ledger balance with integrity flag
- Transaction history with split visibility
- Satellite NDVI monitoring with health gauge
- Real-time event feed via Server-Sent Events

### Demo Mode (Production Feature)

When `NEXT_PUBLIC_API_URL` is not set, all pages automatically serve mock data — 142 farmers, 89 plots, ₹18.5L disbursed, 3 NDVI alerts, live synthetic event stream. This lets investors explore the full platform at https://finagra-unity.vercel.app without a running backend. Set `NEXT_PUBLIC_API_URL` to a live backend URL to switch to real data.

### Key Commands

```bash
# Install dependencies (from repo root)
pnpm install

# Start development server
cd apps/web
pnpm dev
# http://localhost:3000

# Run Jest unit tests with coverage
pnpm test --coverage --ci
# Expected: 96 tests pass, all thresholds met (80% branches/functions/lines/statements)

# Run a single test file
pnpm test -- __tests__/EventCard.test.tsx

# Type check
pnpm tsc --noEmit

# Build for production
pnpm build
```

### Pages and What to Verify

| Page | URL | What to Check |
|---|---|---|
| Dashboard | `/` | 4 metric cards load, no layout shift |
| Ledger | `/ledger` | `is_balanced: true` shown in green |
| Transactions | `/transactions` | Table shows split columns (farmer_gets, platform_fee) |
| Sentinel | `/sentinel` | NDVI gauge renders with accessibility attributes |
| Activity | `/activity` | Status pill shows "connected", new events appear in real time |

### Running Playwright E2E Tests

```bash
# Requires: backend running at :8888, Next.js at :3000
cd apps/web
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test

# Run a specific spec
pnpm exec playwright test e2e/accessibility.spec.ts

# Open interactive UI mode
pnpm exec playwright test --ui
```

**Success criteria:**

```
Running 5 tests using 1 worker
  ✓ dashboard › shows metric cards (2.1s)
  ✓ ledger › shows balanced ledger (1.8s)
  ✓ transactions › renders transaction table (1.5s)
  ✓ sentinel › NDVI gauge is accessible (1.9s)
  ✓ accessibility › WCAG 2.1 AA — no violations on all pages (4.2s)
5 passed (11.5s)
```

### SOLID Principles in Action

**Single Responsibility**
`EventCard.tsx` only renders a single event — it has no knowledge of SSE connections, state management, or routing. `EventFeed.tsx` only manages the SSE connection and event list state — it delegates all rendering to `EventCard`. `lib/api.ts` only makes HTTP requests — it has no rendering logic.

**Open/Closed**
`EventCard.tsx` handles 4 known event types with a `switch` statement plus a fallback for unknown types. Adding a 5th event type (e.g. `loan.approved`) requires only adding a new `case` — no existing cases change.

**Liskov Substitution**
Every page component receives the same data shape from `lib/api.ts`. Server components and the layout can be composed freely because all data fetchers return typed objects that satisfy the same interfaces defined in `lib/types.ts`.

**Interface Segregation**
`MetricCard` accepts only `{ title, value, unit?, trend? }` — it does not receive the full API response. `StatusBadge` accepts only `{ status }`. Each component requests the minimum props it needs to render.

**Dependency Inversion**
Pages depend on `lib/api.ts` functions (abstractions), not on `fetch` directly. If the backend URL changes or a mock layer is needed for tests, only `lib/api.ts` changes — no page component changes.

---

## 5. Module: Mobile App — Field Operations

### Purpose

The mobile app solves the **last-mile connectivity problem** in AgTech: field representatives operate in areas with no reliable internet. They must be able to:

- Register farmers and map land plots offline
- Capture GPS proof of field visits offline
- Sync all captured data when connectivity returns, with no data loss and no duplicate creation

WatermelonDB (SQLite-backed) is the offline store. The `last_synced_at` timestamp on every record enables deterministic conflict resolution: the server always wins on pull, the client batches inserts on push.

### Key Commands

```bash
# Navigate to mobile app
cd apps/mobile

# Install dependencies
pnpm install  # or npm install

# Start Metro bundler (iOS)
npx react-native run-ios

# Start Metro bundler (Android)
npx react-native run-android

# Run WatermelonDB migrations
# (runs automatically on app startup)

# Inspect local SQLite in Flipper or React Native Debugger
# → Database → watermelon.db → tables: farmers, land_plots
```

### Testing the Sync Flow Manually

```bash
# 1. Confirm sync endpoint works (from tests/regression)
cd tests/regression
go test -tags integration -v ./... -run TestSyncPush
go test -tags integration -v ./... -run TestSyncPull

# 2. Direct API call that simulates a mobile push
curl -s -X POST http://localhost:8888/api/v1/sync/push \
  -H "Content-Type: application/json" \
  -d '{
    "client_timestamp": '"$(date +%s%3N)"',
    "farmers": [{
      "local_id": "local-farmer-001",
      "name": "Suresh Reddy",
      "phone": "+917654321098",
      "kyc_status": "PENDING"
    }],
    "plots": [{
      "local_id": "local-plot-001",
      "farmer_local_id": "local-farmer-001",
      "name": "Rabi Field B",
      "area_acres": 1.75
    }]
  }' | jq
```

**Success criteria:**

```json
{
  "server_timestamp": 1747123456789,
  "farmers_created": 1,
  "plots_created": 1,
  "farmers_updated": 0,
  "plots_updated": 0,
  "total_records": 2
}
```

Check `finagra.sync.batch` event was fired:

```bash
# In the web Activity page (http://localhost:3000/activity)
# A purple "Mobile Sync" card should appear with "+1 farmers"
```

### Conflict Resolution Rule

```
Server timestamp > Client timestamp → server record wins (pull overwrites local)
Duplicate local_id on push          → UPSERT (update existing, no error)
Same farmer, different phone        → last_synced_at determines winner
```

### SOLID Principles in Action

**Single Responsibility**
WatermelonDB models (`Farmer.js`, `LandPlot.js`) only define the schema and relationships. The sync engine (`syncEngine.js`) only handles push/pull orchestration. They do not cross responsibilities.

**Open/Closed**
Adding a new syncable entity (e.g. `livestock`) requires adding a new WatermelonDB model and adding it to the push payload — the sync engine's core loop does not change.

**Dependency Inversion**
The sync engine depends on an `ApiClient` abstraction (wrapping `fetch`). In tests, a `MockApiClient` is injected. The sync logic is identical in both cases.

---

## 6. Module: AI / MCP Agent Server

### Purpose

The MCP server solves the **agentic operations problem**: instead of requiring a human operator to manually check KYC status, query GPS proof, check NDVI, and then trigger a payout — an AI agent (Claude) can do the entire workflow autonomously via structured tool calls.

This enables:
- **Smart Payout**: AI verifies eligibility and disburses in one prompt
- **Field Inspection**: AI correlates GPS evidence with satellite data and reports on crop health
- **Platform Audit**: AI checks ledger integrity and flags imbalances without a human querying the DB

### Key Commands

```bash
# Build the MCP server
cd apps/mcp
pnpm build
# Creates: dist/server.js

# Run MCP server (stdio transport — started by Claude/AI client)
node dist/server.js

# Run all MCP tests
pnpm test

# Run with verbose output
pnpm test -- --verbose

# Run a specific workflow test
pnpm test -- --testNamePattern "smart-payout"
```

### Testing the 8 MCP Tools Directly

The MCP server speaks JSON-RPC over stdio. To test tools interactively, use the MCP inspector or send JSON directly:

```bash
# List all available tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/server.js

# Call the get-platform-metrics tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get-platform-metrics","arguments":{}}}' \
  | node dist/server.js
```

**Success criteria for MCP tests:**

```
PASS src/__tests__/tools.test.ts
  ✓ get-platform-metrics returns balanced flag (234ms)
  ✓ create-payout splits 100000 correctly (187ms)
  ✓ submit-proof-of-action returns VERIFIED for valid GPS (211ms)
  ✓ get-ndvi-observations returns array for known plot (198ms)
  ... (24 tool tests)

PASS src/__tests__/workflows.test.ts
  ✓ smart-payout: verifies KYC → proof → disburses (445ms)
  ✓ field-inspection: correlates GPS verdict with NDVI (398ms)
  ✓ platform-audit: confirms ledger is_balanced=true (312ms)
  ... (22 workflow tests)

Tests: 46 passed, 46 total
```

### Using MCP with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "finagra": {
      "command": "node",
      "args": ["/path/to/finagra-unity/apps/mcp/dist/server.js"],
      "env": {
        "FINAGRA_API_URL": "http://localhost:8888"
      }
    }
  }
}
```

Then in Claude Desktop, try:

```
"Run a smart payout of ₹50,000 for farmer d457d2ae-2dae-4988-a0cc-fc5eda76cd76"
```

Claude will call: `create-farmer` (if needed) → `submit-proof-of-action` → `create-payout` → return a structured disbursement report.

### The 3 Agentic Workflows

**smart-payout** — 3 autonomous steps:
1. Fetch farmer → validate `kyc_status == "VERIFIED"` and bank details present
2. Fetch latest proof for plot → confirm `verdict == "VERIFIED"`
3. POST /payouts → disburse with X-Idempotency-Key auto-generated

**field-inspection** — 3 autonomous steps:
1. GET NDVI observations for plot → extract latest `ndvi_mean`
2. POST proof-of-action → submit GPS coordinates + photo hash
3. Correlate NDVI health + GPS verdict → return structured inspection report

**platform-audit** — 2 autonomous steps:
1. GET /ledger/balance → check `is_balanced` flag
2. GET /transactions → sample last N records
3. Return audit summary with risk flags if imbalanced

### SOLID Principles in Action

**Single Responsibility**
`api-client.ts` only handles HTTP communication. Each file in `tools/` handles one tool's input validation and API call. `workflows/` files orchestrate multi-step operations. Zero cross-contamination.

**Open/Closed**
Adding a 9th tool requires creating a new file in `tools/` and registering it in `tools/index.ts`. The `server.ts` dispatch loop does not change — it iterates the tool registry.

**Liskov Substitution**
All tools are registered in a uniform `Tool[]` array. The MCP server calls `.execute(args)` on any tool — each tool satisfies the same contract regardless of whether it calls one API or three.

**Interface Segregation**
Tools declare their Zod input schema narrowly. `create-payout` does not need to know about NDVI fields. `get-ndvi-observations` does not need to know about bank account fields.

**Dependency Inversion**
Workflows depend on `ApiClient` (the abstraction), not on `fetch` directly. In tests, a `MockApiClient` that returns fixtures is injected — workflows are tested without a live backend.

---

## 7. CI/CD Pipeline — 5 Gates Explained

```bash
# Trigger: any push to main or develop, any PR to main
# File: .github/workflows/ci.yml
```

### Gate 1 — Math Lockdown (no infrastructure)

**What it does:** Runs 11 pure Go unit tests that verify the 50/25/5/20 constants, decimal arithmetic, domain error types, and journal balance validation. No database, no network.

**Why it blocks merge:** If any engineer accidentally changes `FarmerSplit = 0.50` to `0.48`, this gate catches it before any infra spins up. It is the cheapest, fastest guard on the most critical invariant in the system.

```yaml
run: go test -v ./... -run "TestMathLockdown|TestDoubleEntryBalance|TestDomainErrors"
```

**Pass time:** < 5 seconds.

### Gate 2 — Backend Integration (real PostGIS + Redis + NATS)

**What it does:** Spins up actual Postgres, Redis, and NATS as GitHub Actions services. Applies `schema.sql`. Builds and starts the backend binary. Runs all `//go:build integration` tagged tests: payout, journal, proof, satellite, sync, events, NDVI boundary, concurrency, audit immutability, E2E pipeline.

**Why it matters:** These tests hit real SQL, real triggers, real Redis TTL, and real NATS pub/sub. No mocks. A mock that passes but a real DB that fails is how production bugs survive development.

```yaml
run: go test -tags integration -v ./... -timeout 180s
```

### Gate 3 — Frontend Jest (80% coverage threshold)

**What it does:** Runs 96 Jest + React Testing Library unit tests against all components in `components/**` and `lib/types.ts`. Enforces 80% branch, function, line, and statement coverage.

**Note:** `EventFeed.tsx` is excluded from coverage — it uses `EventSource` (browser API) which JSDOM cannot simulate. It is covered by Gate 5 (Playwright) instead.

```yaml
run: pnpm test --coverage --ci
```

### Gate 4 — MCP Jest (runs in band)

**What it does:** Runs 46 Jest tests against all MCP tools and agentic workflows. Uses `--runInBand` (sequential) because tests share a mock API client state. Requires PostGIS + backend running.

```yaml
run: pnpm test  # jest --runInBand is set in jest.config.js
```

### Gate 5 — Playwright E2E + WCAG 2.1 AA

**What it does:** Spins up the full stack (PostGIS, Redis, backend, Next.js). Runs 5 Playwright specs including `accessibility.spec.ts` which uses axe-core to validate WCAG 2.1 AA on every page. Uploads test report as artifact on failure.

**Why WCAG AA matters for investors:** RBI and SEBI digital interface guidelines require accessible financial applications. This gate proves compliance automatically on every merge.

```yaml
run: pnpm exec playwright test
```

### Gate Dependencies

```
Gate 1 (Math Lockdown)
    │
    ├── Gate 2 (Backend Integration) ──┐
    │                                   ├── Gate 5 (Playwright E2E)
    ├── Gate 3 (Frontend Jest) ─────────┘
    │
    └── Gate 4 (MCP Jest)
```

Gates 2, 3, 4 run in parallel after Gate 1 passes. Gate 5 waits for Gates 2 and 3. Total CI time: ~8–12 minutes.

---

## 8. Observability — Traces, Metrics, Events

### Prometheus Metrics

```bash
curl -s http://localhost:8888/metrics | grep finagra
```

Key metrics:
```
finagra_payouts_total{status="COMPLETED"}
finagra_payouts_amount_inr
finagra_ndvi_observations_total{below_threshold="true"}
finagra_proof_verdicts_total{verdict="SPOOFED"}
finagra_sync_batches_total
```

### Grafana Dashboards

Open `http://localhost:3001` (admin / admin).

Pre-loaded dashboards:
- **Finagra Platform Overview** — payout throughput, ledger balance trend, NDVI alert rate
- **API Latency** — p50/p95/p99 per endpoint
- **Error Rate** — 4xx/5xx breakdown

### OpenTelemetry Traces

Traces are exported via OTLP to the collector (`infra/docker/docker-compose.yml`). Every HTTP request gets a span with:
- `http.method`, `http.route`, `http.status_code`
- `db.statement` (Postgres queries)
- `finagra.farmer_id`, `finagra.txn_id` (custom attributes)

### Live Event Stream (SSE)

```bash
# Subscribe to all platform events in terminal
curl -s -N http://localhost:8888/api/v1/events/stream

# Expected output:
# data: {"id":"...","type":"connected","timestamp":"...","data":{}}
# : ping
# data: {"id":"...","type":"payout.completed","timestamp":"...","data":{"txn_id":"...","gross_amount":"50000","farmer_gets":"25000"}}
```

### NATS Monitoring

```bash
# NATS monitoring HTTP endpoint (built-in)
curl http://localhost:8222/varz | jq .connections
curl http://localhost:8222/subsz | jq .num_subscriptions

# Subscribe to all Finagra events via NATS CLI (if installed)
nats sub "finagra.>"
```

---

## 9. SOLID Principles Across the Platform

This section shows how the five SOLID principles manifest at the system level — not just within individual modules.

### Single Responsibility (System Level)

Every process has one reason to change:

| Process | Its Only Job |
|---|---|
| Go backend | Domain logic + HTTP API |
| Next.js | UI rendering + investor-facing data display |
| MCP server | AI tool contracts + workflow orchestration |
| NATS | Message routing — knows nothing about business logic |
| Redis | Key-value cache — knows nothing about idempotency semantics |
| PostGIS | Durable storage + spatial queries — enforces data integrity via triggers |

### Open/Closed (System Level)

The event bus is the clearest example. Adding a new event type (`loan.approved`) requires:
1. Add constant to `domain/events.go`
2. Publish from the relevant usecase
3. Add a `case` to `EventCard.tsx`

Zero existing code changes. No existing tests break. The SSE handler, NATS, and the event bus infrastructure are all untouched.

### Liskov Substitution (System Level)

`NoopPublisher` can substitute for `NATSPublisher` without any consumer noticing. The entire platform runs correctly — just without events. This is used in minimal-infra CI environments and during NATS restarts.

### Interface Segregation (System Level)

The MCP tools do not have access to the DB directly. They call the REST API. The REST API does not have access to the MCP tool registry. The frontend does not import any Go types — it uses `lib/types.ts`. Each layer sees only what it needs.

### Dependency Inversion (System Level)

```
Frontend     depends on    HTTP API contract (OpenAPI-equivalent)    NOT on Go structs
MCP server   depends on    HTTP API contract                          NOT on Go structs
Go usecases  depend on     Repository interfaces                      NOT on pgx directly
Go handlers  depend on     Usecase interfaces                         NOT on usecase structs
```

The entire system can have its DB swapped from Postgres to CockroachDB by rewriting `repository/postgres_*.go` — no usecase, handler, frontend, or MCP code changes.

---

## 10. Troubleshooting

### Backend won't start

```bash
# Check infrastructure is running
docker-compose -f infra/docker/docker-compose.yml ps

# Check port 8888 is free
lsof -i:8888
# If occupied: lsof -ti:8888 | xargs kill -9

# Check DB connection
psql "postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev?sslmode=disable" -c "\dt"
# Should list: farmers, land_plots, accounts, transactions, etc.
```

### Integration tests failing with "connection refused"

```bash
# Ensure schema is applied
psql "$TEST_DB_URL" -f schema/schema.sql

# Ensure backend is running and healthy
curl http://localhost:8888/health/ready
# {"status":"ready","db":"ok","redis":"ok"}
```

### Jest coverage below 80%

```bash
# Check which files are pulling coverage down
cd apps/web
pnpm test --coverage --ci 2>&1 | grep -A 5 "Coverage summary"

# Ensure EventFeed.tsx is excluded (it uses EventSource / browser APIs)
# Check jest.config.js → collectCoverageFrom should include:
# "!components/EventFeed.tsx"
```

### NATS events not appearing in Activity page

```bash
# Check NATS is running
docker-compose ps finagra-nats

# Check backend connected to NATS (look for this in backend logs)
# {"level":"info","msg":"NATS connected","url":"nats://localhost:4222"}

# If NATS is down, backend logs:
# {"level":"warn","msg":"NATS unavailable — event streaming disabled"}
# Platform continues working — events are just not published

# Test SSE connection directly
curl -N http://localhost:8888/api/v1/events/stream
# Should see: data: {"type":"connected",...}
# Then: : ping  (every 15 seconds)
```

### Payout returns 422 "farmer not eligible"

The farmer must have:
- `kyc_status: "VERIFIED"`
- `bank_account` non-empty
- `ifsc_code` non-empty

```bash
curl -s http://localhost:8888/api/v1/farmers/$FARMER_ID | jq '{kyc_status, bank_account, ifsc_code}'
```

### `is_balanced: false` on ledger

This should be impossible with the DB trigger in place. If it appears:

```bash
# Check for any transactions where splits don't sum to gross
psql "$DATABASE_URL" -c "
  SELECT id, gross_amount,
         farmer_gets + platform_fee + agent_commission + reserve_fund AS actual_sum,
         gross_amount - (farmer_gets + platform_fee + agent_commission + reserve_fund) AS diff
  FROM transactions
  WHERE ABS(gross_amount - (farmer_gets + platform_fee + agent_commission + reserve_fund)) > 0.0001;
"
# Should return 0 rows. If any rows: investigate that transaction's journal entries.
```

---

*Finagra Unity — Built step by step, tested line by line.*
*Every rupee accounted for. Every field verified. Every investor informed.*
