# Finagra Unity

> Full-stack AgTech ops platform — farmer onboarding, GPS field verification, satellite crop monitoring, profit-share disbursement, and AI-agentic workflows via MCP.

**Live demo (no backend needed):** [finagra-unity.vercel.app/mobile-demo](https://finagra-unity.vercel.app/mobile-demo)

---

## What This Solves

Rural agripreneurs need a system that works where they work — offline in the field, across poor connectivity, with transparent profit-sharing that farmers can verify themselves. This platform handles the full ops loop:

1. **Field onboarding** — farmer registration + land plot creation with GPS boundary capture
2. **GPS fraud prevention** — anti-spoofing engine that flags low-accuracy or duplicate submissions
3. **Satellite crop monitoring** — NDVI threshold enforcement (< 0.30 blocks disbursement)
4. **Profit-share disbursement** — 50/25/5/20 split (farmer / platform / agent / reserve) with double-entry ledger and idempotency guarantees
5. **Offline-first mobile sync** — WatermelonDB delta-sync lets field agents work without connectivity
6. **AI agent layer** — MCP server with 8 tools and 3 agentic workflows that orchestrate the above over a structured API

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FINAGRA UNITY                               │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  Next.js 15  │    │  React Native│    │   MCP stdio server   │  │
│  │  Ops Command │    │  Field Agent │    │   (AI Agent layer)   │  │
│  │  Center      │    │  WatermelonDB│    │   8 tools + 3 flows  │  │
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
│   │   ├── domain/              # entities, events, errors (zero deps)
│   │   ├── usecase/             # business logic + EventPublisher
│   │   ├── repository/          # Postgres implementations
│   │   ├── handler/             # HTTP handlers (thin adapters)
│   │   └── middleware/          # audit, idempotency, otel, correlation
│   ├── web/                     # Next.js 15 Ops Command Center
│   │   ├── app/
│   │   │   ├── page.tsx         # Dashboard
│   │   │   ├── ledger/          # Global Ledger Balance
│   │   │   ├── transactions/    # Transaction history
│   │   │   ├── sentinel/        # Satellite NDVI monitoring
│   │   │   ├── activity/        # Live event feed (SSE)
│   │   │   └── mobile-demo/     # Interactive iPhone simulator for demos
│   ├── mobile/                  # React Native field agent app
│   │   └── watermelon/          # WatermelonDB schema + sync engine
│   └── mcp/                     # MCP stdio AI agent server
│       └── src/
│           ├── tools/           # 8 MCP tools
│           └── workflows/       # 3 agentic workflows
├── schema/
│   └── schema.sql               # PostGIS DDL — single source of truth
├── tests/
│   └── regression/              # Go integration + math lockdown
├── docs/
│   ├── HLD.md                   # High-Level Design
│   └── LLD.md                   # Low-Level Design
└── .github/
    └── workflows/ci.yml         # 5-gate CI pipeline
```

---

## The Profit-Share Model (Immutable Math Law)

Every disbursement splits as follows — enforced at the domain layer with `shopspring/decimal` (no float arithmetic) and verified by a regression test that blocks any PR mutating these constants:

| Bucket | Split | Role |
|---|---|---|
| FARMER_PAYMENT | 50% | Primary beneficiary |
| PLATFORM_FEE | 25% | Platform revenue |
| AGENT_COMMISSION | 5% | FPO / onboarding agent |
| RESERVE_FUND | 20% | Insurance pool |

- 8 journal entries per payout (4 debits + 4 credits) in a single DB transaction
- `FARMER + PLATFORM + AGENT + RESERVE == GROSS` enforced by decimal equality + DB trigger

---

## MCP AI Agent Layer

The MCP server exposes the platform as a structured API for AI agents. Three production workflows:

| Workflow | Steps |
|---|---|
| `smart-payout` | eligibility check → GPS proof verify → disburse |
| `field-inspection` | GPS proof + NDVI correlation → risk flag |
| `platform-audit` | ledger balance + audit trail verification |

Any Claude-compatible client (Claude Desktop, Claude Code, custom agents) can invoke these workflows over stdio.

---

## Quick Start (Local)

```bash
# 1. Infrastructure
cd infra/docker && docker-compose up -d

# 2. Schema
psql postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev -f schema/schema.sql

# 3. Backend
cd apps/backend && go run .

# 4. Web
pnpm install && cd apps/web && pnpm dev
```

---

## Running Tests

```bash
# Math lockdown — no infra needed
cd tests/regression && go test -v ./... -run "TestMathLockdown"

# Full backend integration (PostGIS + Redis + NATS)
go test -tags integration -v ./... -timeout 180s

# Frontend unit
cd apps/web && pnpm test --coverage --ci

# MCP server
cd apps/mcp && pnpm test

# Playwright E2E + WCAG 2.1 AA
cd apps/web && pnpm exec playwright test
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health/ready` | Readiness probe (DB + Redis) |
| POST | `/sync/push` | Mobile offline sync push |
| GET | `/sync/pull` | Mobile delta pull |
| POST | `/payouts` | Disburse payout (idempotent) |
| GET | `/ledger/balance` | Global ledger balance |
| POST | `/land-plots/:id/proof-of-action` | Submit GPS proof |
| POST | `/satellite/observations` | Ingest NDVI observation |
| GET | `/events/stream` | SSE live event stream |
| GET | `/metrics` | Prometheus metrics |

---

## CI Pipeline (5 Gates)

```
Gate 1: Math Lockdown       → pure unit, no infra
Gate 2: Backend Integration → real PostGIS + Redis + NATS (parallel)
Gate 3: Frontend Jest       → 80% coverage threshold (parallel)
Gate 4: MCP Jest            → 8 tools + 3 workflows (parallel)
Gate 5: Playwright E2E      → WCAG 2.1 AA accessibility (requires 2+3)
```

**Total: 202+ tests**

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis connection string |
| `NATS_URL` | `nats://127.0.0.1:4222` | NATS connection string |
| `PORT` | `8888` | Backend listen port |
| `APP_ENV` | `development` | `development` or `production` |
| `NEXT_PUBLIC_API_URL` | — | Web → backend URL (empty = demo mode) |
