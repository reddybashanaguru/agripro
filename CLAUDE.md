# Finagra Unity — Permanent Engineering Memory

> Principal Engineer: Claude (Founding)
> Target: ₹500Cr-scale AgTech platform | ₹75L package proof

---

## THE 50/25/5/20 MATH LAWS (IMMUTABLE)

Every single rupee that enters the Finagra ledger MUST split as follows:

| Bucket          | Split | Purpose                          |
|-----------------|-------|----------------------------------|
| FARMER_PAYMENT  | 50%   | Primary beneficiary — the farmer |
| PLATFORM_FEE    | 25%   | Platform revenue & operations    |
| AGENT_COMMISSION| 5%    | FPO/agent who onboarded the deal |
| RESERVE_FUND    | 20%   | Insurance pool + compliance hold |
| **TOTAL**       | **100%** | Must balance to the paisa    |

### Hard Invariants
- All arithmetic uses `github.com/shopspring/decimal` — NEVER float64 for money.
- Sum check: `FARMER + PLATFORM + AGENT + RESERVE == GROSS_AMOUNT` (decimal equality).
- Any PR that changes these constants will fail the `TestMathLockdown` regression test.
- Idempotency-Key header is MANDATORY on all `/api/v1/payouts/*` endpoints.
- Every payout creates exactly 4 Journal Entries (one per bucket) in a single DB transaction.

---

## ARCHITECTURE BLUEPRINT

```
finagra-unity/
├── apps/
│   ├── backend/          # Go 1.24 + Echo — Clean Architecture
│   │   ├── domain/       # Entities, Value Objects, Domain Errors
│   │   ├── usecase/      # Business logic — no framework imports
│   │   ├── repository/   # DB interfaces + Postgres implementations
│   │   ├── handler/      # HTTP handlers (Echo) — thin adapters
│   │   └── middleware/   # Audit, Idempotency, RateLimit, CORS
│   ├── web/              # Next.js 15 (App Router)
│   └── mobile/           # React Native + WatermelonDB
│       └── watermelon/   # Offline-first schema + sync logic
├── packages/
│   └── core/             # Shared TS types (zod schemas)
├── infra/
│   └── docker/           # docker-compose (PostGIS 17, Redis, NATS)
├── schema/
│   ├── schema.sql        # PostGIS DDL — source of truth
│   └── migrations/       # golang-migrate numbered files
├── tests/
│   └── regression/       # Math Lockdown + E2E
└── .claude/
    ├── config.json       # Pinned context files
    └── agents/           # Specialist sub-agents
```

---

## CLEAN ARCHITECTURE CONTRACT

```
Handler → Usecase → Repository → Domain
   ↑           ↑          ↑
 (HTTP)    (Business)  (DB/Cache)
```

- Domain layer has ZERO external imports.
- Usecases depend only on repository INTERFACES, never concrete types.
- Handlers never contain business logic — they translate HTTP ↔ Usecase.

---

## DOUBLE-ENTRY LEDGER RULES

Every money movement creates two or more balanced journal entries:
- Debit increases ASSET/EXPENSE accounts.
- Credit increases LIABILITY/REVENUE accounts.
- Sum of all Debits == Sum of all Credits in every transaction (enforced at DB level via CHECK constraint).

---

## PRODUCTION DAY 1 CHECKLIST

- [x] Idempotency keys on all payout endpoints (Redis-backed, 24h TTL)
- [x] Double-entry journal with shopspring/decimal
- [x] PostGIS 17 with GIST indexes on land_plots
- [x] WatermelonDB schema with last_synced_at conflict resolution
- [x] Audit middleware (immutable audit_log table)
- [x] Custom domain error types with HTTP status mappings
- [x] Delta-sync PostgreSQL triggers
- [x] Math Lockdown regression test (blocks merges on split mutation)
- [x] Health check endpoints (liveness + readiness)
- [x] Structured logging with zerolog + correlation IDs
- [ ] Circuit breaker for external payment gateways
- [ ] OpenTelemetry traces + Grafana dashboard
- [ ] K8s Helm chart

---

## PINNED CONTEXT (zero-drift)
- `CLAUDE.md` — this file
- `schema/schema.sql` — DB source of truth
- `apps/backend/go.mod` — dependency versions
- `apps/backend/domain/` — business invariants
- `tests/regression/math_lockdown_test.go` — immutable math contract
