# Finagra Unity — Production Handover Document

> Platform: ₹500Cr-scale AgTech payments infrastructure  
> Build date: 2026-05-12  
> Handover owner: Principal Engineer (Claude, Founding)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     FINAGRA UNITY STACK                         │
├───────────────────────────┬─────────────────────────────────────┤
│  Layer                    │  Technology                         │
├───────────────────────────┼─────────────────────────────────────┤
│  Investor Command Center  │  Next.js 15.5.18 (App Router, RSC)  │
│  Agentic MCP Server       │  @modelcontextprotocol/sdk, Node.js │
│  API Backend              │  Go 1.25 + Echo v4                  │
│  Database                 │  PostGIS 17 (GIST indexes)          │
│  Cache / Idempotency      │  Redis 7                            │
│  Observability            │  OpenTelemetry + Prometheus          │
│  Mobile Sync              │  React Native + WatermelonDB        │
└───────────────────────────┴─────────────────────────────────────┘
```

### Clean Architecture layers (backend)

```
Handler (HTTP) → Usecase (Business) → Repository (DB) → Domain (Entities)
```

- **Domain**: zero external imports — entities, value objects, error types
- **Usecase**: depends only on repository interfaces, never concrete types
- **Handler**: translates HTTP ↔ Usecase, no business logic
- **Repository**: Postgres via pgx v5; all money as `decimal.Decimal`, stored as `NUMERIC`

---

## 2. The 50/25/5/20 Math Laws (Immutable)

Every rupee entering the ledger splits exactly as:

| Bucket           | Rate | Account Type      |
|------------------|------|-------------------|
| FARMER_PAYMENT   | 50%  | FARMER_WALLET     |
| PLATFORM_FEE     | 25%  | PLATFORM_REVENUE  |
| AGENT_COMMISSION |  5%  | AGENT_COMMISSION  |
| RESERVE_FUND     | 20%  | RESERVE_FUND      |

**Hard invariants:**
- Arithmetic uses `github.com/shopspring/decimal` — never `float64`
- `FARMER + PLATFORM + AGENT + RESERVE == GROSS` (decimal equality)
- `TestMathLockdown` in CI blocks any merge that touches split constants
- 8 journal entries per payout (4 debits + 4 credits) enforced by DB trigger

---

## 3. Environment Variables

### Backend (`apps/backend`)

| Variable          | Default                                                    | Required |
|-------------------|------------------------------------------------------------|----------|
| `DATABASE_URL`    | `postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev` | Yes |
| `REDIS_URL`       | `redis://localhost:6379`                                   | Yes      |
| `PORT`            | `8888`                                                     | No       |
| `APP_ENV`         | `development` (`production` enables JSON logging)          | No       |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `localhost:4317`                           | No       |

### Frontend (`apps/web`)

| Variable              | Default                     | Required |
|-----------------------|-----------------------------|----------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8888`     | Yes (prod) |

### MCP Server (`apps/mcp`)

| Variable          | Default                     | Required |
|-------------------|-----------------------------|----------|
| `FINAGRA_API_URL` | `http://localhost:8888`     | Yes      |
| `FINAGRA_API_KEY` | _(none)_                    | Prod only |

---

## 4. Database Schema

Source of truth: `schema/schema.sql`

### Key tables

| Table                  | Purpose                                        |
|------------------------|------------------------------------------------|
| `farmers`              | KYC-verified farmer registry                   |
| `land_plots`           | PostGIS polygons (SRID 4326)                   |
| `transactions`         | Payout records with idempotency_key index      |
| `journal_entries`      | Double-entry ledger (8 per transaction)        |
| `accounts`             | 4 singleton system accounts (seeded on boot)   |
| `proof_of_action`      | GPS field visit proofs with anti-spoofing      |
| `satellite_observations` | NDVI time-series per plot                    |
| `audit_log`            | Immutable audit trail (trigger blocks UPDATE/DELETE) |

### Critical DB constraints

- `transactions.idempotency_key` — unique index (prevents duplicate payouts)
- `proof_of_action.photo_hash` — unique index (prevents photo replay)
- `enforce_double_entry` trigger — rejects journal entries that create imbalance
- `audit_log_no_update` trigger — raises exception on any UPDATE or DELETE

### Applying the schema

```bash
psql "$DATABASE_URL" -f schema/schema.sql
```

---

## 5. Running Locally

```bash
# 1. Start infra
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Apply schema
psql "postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev?sslmode=disable" \
  -f schema/schema.sql

# 3. Start backend (port 8888)
cd apps/backend && go run .

# 4. Start frontend (port 3000)
cd apps/web && pnpm dev

# 5. Start MCP server (stdio — attach to Claude Desktop)
cd apps/mcp && pnpm dev
```

Health check: `curl http://localhost:8888/health/ready`

---

## 6. CI / Test Pyramid

### Running tests

```bash
# Math Lockdown (no infra needed — runs anywhere)
cd tests/regression && go test -v ./... -run "TestMathLockdown|TestDoubleEntryBalance|TestDomainErrors"

# All integration tests (requires backend + DB + Redis)
cd tests/regression && go test -tags integration -v ./... -timeout 180s

# Frontend unit tests (Jest)
cd apps/web && pnpm test --coverage

# MCP workflow tests (Jest + runInBand)
cd apps/mcp && pnpm test

# E2E + accessibility (Playwright — requires running dev server)
cd apps/web && pnpm exec playwright test
```

### Test inventory

| Layer        | Suite                           | Count | Gate |
|--------------|---------------------------------|-------|------|
| Go unit      | Math Lockdown + Domain          |    11 | CI Gate 1 (blocks all merges) |
| Go integration | Payout + Ledger + Proof + Satellite + Sync | 17 | CI Gate 2 |
| Go integration | E2E Pipeline + Concurrency + Audit + NDVI Boundary | 8 | CI Gate 2 |
| TypeScript   | MCP tools + workflows           |    46 | CI Gate 4 |
| TypeScript   | Frontend components + lib       |    80 | CI Gate 3 |
| Playwright   | E2E + WCAG 2.1 AA               |    22 | CI Gate 5 |

**Total: 184 tests**

---

## 7. API Reference

Base URL: `http://localhost:8888/api/v1`

### Health

| Method | Path           | Description                        |
|--------|----------------|------------------------------------|
| GET    | /health/live   | Kubernetes liveness probe          |
| GET    | /health/ready  | Readiness — checks Postgres + Redis |

### Payouts

| Method | Path                  | Headers required          | Description         |
|--------|-----------------------|---------------------------|---------------------|
| POST   | /payouts              | X-Idempotency-Key         | Initiate payout     |
| GET    | /payouts/:id/entries  | —                         | Journal entries     |

### Ledger

| Method | Path            | Description              |
|--------|-----------------|--------------------------|
| GET    | /ledger/balance | Global double-entry check |

### Land Plots & Proofs

| Method | Path                         | Description            |
|--------|------------------------------|------------------------|
| POST   | /land-plots                  | Register plot          |
| GET    | /land-plots/:id              | Get plot               |
| POST   | /land-plots/:id/proof-of-action | Submit GPS proof    |
| GET    | /land-plots/:id/satellite    | Latest NDVI            |

### Satellite / NDVI

| Method | Path                     | Description               |
|--------|--------------------------|---------------------------|
| POST   | /satellite/observations  | Seed NDVI data (staging)  |

### Platform Metrics

| Method | Path               | Description           |
|--------|--------------------|-----------------------|
| GET    | /metrics-platform  | KPI snapshot          |
| GET    | /metrics           | Prometheus scrape     |

### Offline Sync (WatermelonDB)

| Method | Path        | Description        |
|--------|-------------|--------------------|
| GET    | /sync/pull  | Pull since=<epoch> |
| POST   | /sync/push  | Push local changes |

---

## 8. NDVI Anti-Fraud Gate

Payouts with `plot_id` trigger a satellite pre-check:

- NDVI ≥ 0.30 → payout proceeds
- NDVI < 0.30 → `422 NDVI_BELOW_THRESHOLD` — payout blocked
- No satellite data → payout proceeds (fail-open)

Satellite observations are refreshed every ~5 days from Sentinel-2.

---

## 9. GPS Anti-Spoofing

`POST /land-plots/:id/proof-of-action` enforces:

| Condition                   | Verdict  | Reason                                   |
|-----------------------------|----------|------------------------------------------|
| accuracy_m ≤ 0              | SPOOFED  | Impossible GPS reading                   |
| accuracy_m < 1.0            | SPOOFED  | Consumer GPS cannot achieve sub-metre    |
| Duplicate photo_hash        | SPOOFED  | Photo replay attack                      |
| GPS outside plot polygon    | REJECTED | Farmer not at registered field           |
| GPS inside polygon, valid   | VERIFIED | Field visit confirmed                    |

---

## 10. Incident Response

### Payout stuck / not completing

1. Check `GET /health/ready` — is Postgres and Redis healthy?
2. Check `GET /ledger/balance` — is `is_balanced: true`?
3. Check transaction: `GET /payouts/:id/entries` — are there 8 entries?
4. Check audit_log for the transaction record

### NDVI blocking a legitimate payout

1. Verify via `GET /land-plots/:id/satellite` — what is current NDVI?
2. If stale data: seed a new observation via `POST /satellite/observations`
3. Retry payout with a **new** idempotency key (old key is cached in Redis)

### Idempotency key collision

- Each key is unique per transaction. Never reuse keys.
- Redis TTL = 24 hours. After expiry, the key can be reused (new transaction created).
- Use `mcp-payout-<uuid>` prefix from the MCP server to guarantee uniqueness.

### Ledger imbalance detected

This should not happen — the DB trigger `enforce_double_entry` prevents it.  
If `is_balanced: false` is ever returned:
1. Immediately alert the engineering team
2. The failing transaction ID will be in the ledger balance response
3. Do NOT process further payouts until root cause is identified

---

## 11. Monitoring

- **Prometheus**: `GET /metrics` — scrape every 15s
- **Grafana**: http://localhost:3001 (dev) — platform dashboard
- **OpenTelemetry**: traces exported to OTEL collector at `localhost:4317`
- **zerolog**: structured JSON logs in production, coloured console in development

### Key alert conditions

| Metric                           | Alert threshold |
|----------------------------------|-----------------|
| `finagra_payout_failures_total`  | > 5 / 5 min     |
| `finagra_ndvi_blocks_total`      | > 10 / hour     |
| `finagra_spoofed_proofs_total`   | > 3 / hour      |
| Postgres `pg_isready` failure    | Immediate       |
| Redis ping failure               | Immediate       |

---

## 12. Production Day 1 Checklist

- [x] Idempotency keys on all payout endpoints (Redis-backed, 24h TTL)
- [x] Double-entry journal with shopspring/decimal
- [x] PostGIS 17 with GIST indexes on land_plots
- [x] WatermelonDB schema with last_synced_at conflict resolution
- [x] Audit middleware (immutable audit_log table — trigger verified)
- [x] Custom domain error types with HTTP status mappings
- [x] Delta-sync PostgreSQL triggers
- [x] Math Lockdown regression test (blocks merges on split mutation)
- [x] Health check endpoints (liveness + readiness)
- [x] Structured logging with zerolog + correlation IDs
- [x] GPS anti-spoofing (accuracy_m, duplicate photo_hash)
- [x] NDVI satellite pre-check gate (0.30 threshold, boundary tested)
- [x] Investor Command Center (Next.js 15, WCAG 2.1 AA, Playwright E2E)
- [x] Agentic MCP Server (3 workflows, 6 tools, 46 tests)
- [x] GitHub Actions CI (5 gates: Math Lockdown → Integration → Frontend → MCP → E2E)
- [ ] Circuit breaker for external payment gateways
- [ ] OpenTelemetry traces + Grafana dashboard (OTel collector running, dashboard pending)
- [ ] K8s Helm chart

---

## 13. Security Notes

- All payout endpoints require `X-Idempotency-Key` — missing key returns 400
- `audit_log` table is append-only at the DB level — no application-level bypass exists
- CORS is currently `AllowOrigins: ["*"]` — **restrict to your domain before production**
- `APP_ENV=production` must be set — enables JSON logging and disables debug stack traces
- Database password in `DATABASE_URL` — use a secrets manager (AWS SSM / Vault) in production
- The `POST /satellite/observations` endpoint is unauthenticated — gate it behind API key in production

---

## 14. SLA Targets

| Endpoint              | P50   | P99   | Availability |
|-----------------------|-------|-------|--------------|
| POST /payouts         | 80ms  | 400ms | 99.9%        |
| GET /ledger/balance   | 20ms  | 100ms | 99.9%        |
| GET /metrics-platform | 15ms  | 80ms  | 99.5%        |
| POST /proof-of-action | 50ms  | 250ms | 99.9%        |
| GET /health/ready     | 5ms   | 20ms  | 99.99%       |

---

---

## 15. Deployment

### Web Frontend
- **Platform**: Vercel (Hobby — free)
- **Live URL**: https://finagra-unity.vercel.app
- **Mobile Demo**: https://finagra-unity.vercel.app/mobile-demo
- **Config**: `apps/web/vercel.json` + Vercel project `rootDirectory: "apps/web"`
- **Demo Mode**: all pages run with seeded mock data when `NEXT_PUBLIC_API_URL` is unset; set it to switch to live backend
- **Deploy command**: `npx vercel --prod --yes` from repo root

### Backend API
- **Dockerfile**: `apps/backend/Dockerfile` (multi-stage Go build, repo-root context)
- **Railway config**: `railway.toml` at repo root
- **Database**: Supabase (PostgreSQL + PostGIS free tier) — run `schema/schema.sql` after provisioning
- **Cache**: Upstash Redis (free tier, 10K req/day)
- **Required env vars**: `DATABASE_URL`, `REDIS_URL`, `APP_ENV=production`, `PORT=8888`
- **NATS**: optional — platform falls back to `NoopPublisher` gracefully if unavailable

---

*Finagra Unity — built for ₹500Cr scale, bank-grade invariants, zero paisa lost.*
