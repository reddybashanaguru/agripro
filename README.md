# Finagra Unity

> Bank-grade AgTech payments platform — ₹500Cr scale proof for a ₹75L package

Finagra Unity is a production-quality monorepo demonstrating end-to-end financial infrastructure for agricultural credit disbursement: double-entry ledger, GPS fraud prevention, satellite crop monitoring, offline-first mobile sync, AI-agentic workflows via MCP, and real-time event streaming — all validated by 202+ automated tests across 5 CI gates.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FINAGRA UNITY                               │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  Next.js 15  │    │  React Native│    │   MCP stdio server   │  │
│  │  App Router  │    │  WatermelonDB│    │   (AI Agent layer)   │  │
│  │  (Web CC)    │    │  (Mobile)    │    │   8 tools + 3 flows  │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │ delta-sync             │              │
│         └───────────────────┴────────────────────────┘             │
│                             │ HTTP + SSE                            │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │            Go 1.25 + Echo v4 — Backend API (:8888)           │  │
│  │  Clean Architecture: Domain → Usecase → Repository → Handler │  │
│  │  Middleware: Audit | Idempotency (Redis) | OTel | CORS       │  │
│  └───────┬───────────────────────┬──────────────────────────────┘  │
│          │                       │                                   │
│  ┌───────▼──────┐    ┌───────────▼──────┐    ┌──────────────────┐  │
│  │ PostGIS 17   │    │   Redis 7        │    │   NATS 2.10      │  │
│  │ (primary DB) │    │ (idempotency)    │    │ (event bus)      │  │
│  │ 8 tables     │    │ 24h TTL keys     │    │ JetStream        │  │
│  │ 16+ indexes  │    │                  │    │ 4 subjects       │  │
│  └──────────────┘    └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Go 1.25, Echo v4, zerolog, shopspring/decimal |
| Database | PostGIS 17 (PostgreSQL + spatial extensions) |
| Cache / Idempotency | Redis 7 |
| Message Bus | NATS 2.10 (JetStream) |
| Web Frontend | Next.js 15, React 19, Tailwind CSS v3, TypeScript |
| Mobile | React Native + WatermelonDB (offline-first) |
| AI / Agentic | @modelcontextprotocol/sdk v1.29 (MCP stdio) |
| Observability | OpenTelemetry, Prometheus, Grafana |
| Testing | Go test, Jest 29, React Testing Library, Playwright |
| CI/CD | GitHub Actions (5 gates, concurrency cancel) |
| Package Manager | pnpm 9 (workspaces) |

---

## Monorepo Structure

```
finagra-unity/
├── apps/
│   ├── backend/                 # Go API server
│   │   ├── config/              # env var loading
│   │   ├── domain/              # entities, events, errors (zero deps)
│   │   ├── usecase/             # business logic + EventPublisher
│   │   ├── repository/          # interfaces + Postgres implementations
│   │   ├── handler/             # HTTP handlers (thin adapters)
│   │   ├── middleware/          # audit, idempotency, otel, correlation
│   │   ├── observability/       # OTel provider init
│   │   └── main.go              # DI wiring, Echo server, graceful shutdown
│   ├── web/                     # Next.js 15 Investor Command Center
│   │   ├── app/                 # App Router pages (ISR/SSR/force-dynamic)
│   │   │   ├── page.tsx         # Dashboard
│   │   │   ├── ledger/          # Global Ledger Balance
│   │   │   ├── transactions/    # Transaction history
│   │   │   ├── sentinel/        # Satellite NDVI monitoring
│   │   │   └── activity/        # Live event feed (SSE)
│   │   ├── components/          # EventCard, EventFeed, MetricCard, etc.
│   │   ├── lib/                 # api.ts, types.ts, formatters
│   │   ├── e2e/                 # Playwright specs (WCAG 2.1 AA)
│   │   └── __tests__/           # Jest + RTL unit tests
│   ├── mobile/                  # React Native app
│   │   └── watermelon/          # WatermelonDB schema + sync engine
│   └── mcp/                     # MCP stdio AI agent server
│       └── src/
│           ├── tools/           # 8 MCP tools
│           └── workflows/       # 3 agentic workflows
├── packages/
│   └── core/                    # Shared TypeScript / Zod schemas
├── infra/
│   └── docker/                  # docker-compose.yml (full stack)
├── schema/
│   └── schema.sql               # PostGIS DDL — single source of truth
├── tests/
│   └── regression/              # Go integration + math lockdown
├── docs/
│   ├── HLD.md                   # High-Level Design
│   └── LLD.md                   # Low-Level Design
├── .github/
│   └── workflows/ci.yml         # 5-gate CI pipeline
└── CLAUDE.md                    # Engineering runbook (AI memory)
```

---

## The 50/25/5/20 Math Laws (Immutable)

Every rupee entering the Finagra ledger must split as:

| Bucket | Split | Role |
|---|---|---|
| FARMER_PAYMENT | 50% | Primary beneficiary |
| PLATFORM_FEE | 25% | Platform revenue |
| AGENT_COMMISSION | 5% | FPO / onboarding agent |
| RESERVE_FUND | 20% | Insurance pool |

- All arithmetic uses `shopspring/decimal` — never `float64`
- `FARMER + PLATFORM + AGENT + RESERVE == GROSS` must hold (decimal equality)
- 8 journal entries per payout (4 debits + 4 credits)
- `TestMathLockdown` blocks any merge that mutates these constants

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Go 1.25+
- Node.js 22+, pnpm 9+

### 1. Start infrastructure

```bash
cd infra/docker
docker-compose up -d
```

Services started: PostGIS :5432, Redis :6379, NATS :4222, Prometheus :9090, Grafana :3001

### 2. Apply schema

```bash
psql postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev?sslmode=disable \
  -f schema/schema.sql
```

### 3. Start backend

```bash
cd apps/backend
go run . &
# Backend available at http://localhost:8888
```

### 4. Start web frontend

```bash
pnpm install
cd apps/web
pnpm dev
# Frontend available at http://localhost:3000
```

### 5. Start MCP server (optional — for AI agent workflows)

```bash
cd apps/mcp
pnpm build
node dist/server.js
```

---

## Running Tests

### Math Lockdown (fast, no infra)

```bash
cd tests/regression
go test -v ./... -run "TestMathLockdown|TestDoubleEntryBalance|TestDomainErrors"
```

### Backend integration tests (requires PostGIS + Redis + NATS)

```bash
cd tests/regression
go test -tags integration -v ./... -timeout 180s
```

### Frontend unit tests (Jest + RTL, 80% coverage threshold)

```bash
cd apps/web
pnpm test --coverage --ci
```

### MCP server tests

```bash
cd apps/mcp
pnpm test
```

### Playwright E2E + Accessibility (requires running stack)

```bash
cd apps/web
pnpm exec playwright test
```

---

## API Reference

All endpoints are under `http://localhost:8888/api/v1`.

| Method | Path | Description |
|---|---|---|
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe (DB + Redis) |
| POST | `/farmers` | Register farmer |
| GET | `/farmers/:id` | Get farmer |
| POST | `/land-plots` | Create land plot |
| GET | `/land-plots/:id` | Get land plot |
| POST | `/payouts` | Disburse payout (idempotent) |
| GET | `/payouts/:id` | Get payout |
| GET | `/transactions` | List transactions |
| GET | `/ledger/balance` | Global ledger balance |
| POST | `/land-plots/:id/proof-of-action` | Submit GPS proof |
| GET | `/land-plots/:id/proof-of-action` | List proofs for plot |
| POST | `/satellite/observations` | Ingest NDVI observation |
| GET | `/satellite/observations` | Query NDVI history |
| POST | `/sync/push` | Mobile offline sync push |
| GET | `/sync/pull` | Mobile delta pull |
| GET | `/events/stream` | SSE live event stream |
| GET | `/metrics` | Prometheus metrics |

### Key Headers

| Header | Required On | Purpose |
|---|---|---|
| `X-Idempotency-Key` | POST /payouts | Exactly-once payout guarantee |
| `X-Correlation-ID` | All | Distributed trace correlation |

---

## Domain Invariants

| Invariant | Rule |
|---|---|
| NDVI threshold | `< 0.30` → blocked (422) |
| Anti-spoofing | `accuracy_m ≤ 0` or duplicate `photo_hash` → SPOOFED |
| Audit log | Append-only (DB trigger rejects UPDATE/DELETE) |
| Double-entry | `enforce_double_entry` trigger rejects imbalanced journals |
| Idempotency race | Thundering herd losers get 500; exactly 1 DB row guaranteed |

---

## CI Pipeline (5 Gates)

```
Gate 1: Math Lockdown   → Pure unit tests (no infra)
Gate 2: Backend Integration → Real PostGIS + Redis + NATS
Gate 3: Frontend Jest   → 80% coverage threshold
Gate 4: MCP Jest        → 8 tools + 3 workflows
Gate 5: Playwright E2E  → WCAG 2.1 AA accessibility
```

Gates 2, 3, 4 run in parallel after Gate 1. Gate 5 requires Gates 2 and 3 to pass.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis connection string |
| `NATS_URL` | `nats://127.0.0.1:4222` | NATS connection string |
| `PORT` | `8888` | Backend listen port |
| `APP_ENV` | `development` | Environment name |
| `FINAGRA_API_URL` | `http://localhost:8888` | MCP server → backend |

---

## What Was Built (11 Steps)

| Step | Deliverable | Tests |
|---|---|---|
| 1 | Domain entities + math laws + Clean Architecture scaffold | 11 pure unit |
| 2 | Postgres schema + double-entry ledger + idempotency middleware | — |
| 3 | Payout usecase + journal entries + Redis idempotency | 3 integration |
| 4 | PostGIS land plots + GPS proof of action + anti-spoofing | 5 integration |
| 5 | Satellite NDVI ingestion + boundary enforcement (0.30) | 4 integration |
| 6 | WatermelonDB mobile schema + delta-sync API + audit triggers | 2 integration |
| 7 | MCP stdio server — 8 tools + 3 agentic workflows | 46 Jest |
| 8 | Next.js 15 Investor Command Center (Dashboard, Ledger, Sentinel, Transactions) | 80 Jest + Playwright |
| 9 | Playwright E2E + WCAG 2.1 AA accessibility | 5 Playwright specs |
| 10 | OpenTelemetry traces + Prometheus metrics + Grafana dashboards | — |
| 11 | NATS event streaming + SSE Activity feed + EventCard/EventFeed components | 8 integration + 16 Jest |

**Total: 202+ tests across Go integration, Jest unit, and Playwright E2E.**

---

## Ports

| Service | Port |
|---|---|
| Backend API | 8888 |
| Next.js Web | 3000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| NATS | 4222 |
| Prometheus | 9090 |
| Grafana | 3001 |
| Adminer | 8080 |
