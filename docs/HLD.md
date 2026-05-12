# Finagra Unity — High-Level Design

> Version: Step 11 complete | Last updated: 2026-05-12

---

## 1. System Context

Finagra Unity is a multi-tenant AgTech financial platform that sits between agricultural investors, field agents, farmers, and external data sources (GPS satellites, NDVI satellite imagery).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FINAGRA UNITY PLATFORM                             │
│                                                                             │
│  Investors / Admin  ──────►  Investor CC (Next.js)  ◄──── SSE Events       │
│                                                                             │
│  AI Agents / Claude ──────►  MCP Server (stdio)     ──────►  Backend API   │
│                                                                             │
│  Field Agents       ──────►  Mobile App (RN)         ──────►  Sync API     │
│                                      ▼                                      │
│  GPS + NDVI Satellites ─────►  Backend API (:8888)                         │
│                                      │                                      │
│                         ┌────────────┴────────────┐                        │
│                         ▼                         ▼                        │
│                   PostGIS DB              NATS Event Bus                   │
│                   Redis Cache             (pub/sub)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Actors

| Actor | Interface | Primary Operations |
|---|---|---|
| Investor / Admin | Next.js web app | View metrics, ledger, NDVI alerts, live events |
| AI Agent (Claude) | MCP stdio server | Smart payout, field inspection, platform audit |
| Field Agent | React Native mobile | Offline data capture, GPS proof submission, sync |
| External Satellite | REST API | NDVI observation ingestion |
| CI/CD | GitHub Actions | 5-gate automated test pipeline |

---

## 2. Component Architecture

### 2.1 Backend API (Go 1.25 + Echo v4)

Clean Architecture with strict layer isolation:

```
┌─────────────────────────────────────────────────────┐
│                    HTTP Layer (Echo)                 │
│  Handler: parse request → call usecase → send resp  │
├─────────────────────────────────────────────────────┤
│  Middleware Stack (applied in order):               │
│  1. OTel tracing                                    │
│  2. Correlation ID (X-Correlation-ID header)        │
│  3. Audit logging (writes to audit_log table)       │
│  4. Idempotency (Redis check-then-cache)            │
│  5. CORS + rate limit                               │
├─────────────────────────────────────────────────────┤
│                  Usecase Layer                       │
│  Business logic only — no framework imports         │
│  Depends on Repository INTERFACES                   │
│  Holds: EventPublisher interface                    │
├─────────────────────────────────────────────────────┤
│               Repository Layer                       │
│  Interfaces defined in repository/interfaces.go     │
│  Implementations: postgres_*.go (8 files)           │
│  Uses: pgx/v5 for Postgres, go-redis for Redis      │
├─────────────────────────────────────────────────────┤
│                  Domain Layer                        │
│  Pure Go — ZERO external package imports            │
│  Entities: Farmer, LandPlot, Transaction, Proof,   │
│            SatelliteObservation, PlatformEvent      │
│  Constants: 50/25/5/20 splits                       │
│  Invariants: NDVI threshold, anti-spoofing rules    │
└─────────────────────────────────────────────────────┘
```

### 2.2 Web Frontend (Next.js 15)

```
┌──────────────────────────────────────────────────────────┐
│                Next.js 15 App Router                     │
│                                                          │
│  Server Components (ISR/SSR):                           │
│  - Dashboard page (revalidate: 30s)                     │
│  - Ledger, Transactions, Sentinel pages                 │
│  - server-side fetch via lib/api.ts                     │
│                                                          │
│  Client Components ("use client"):                      │
│  - Navigation (usePathname)                             │
│  - EventFeed (EventSource SSE + useState/useEffect)     │
│  - NDVIGauge (interactive)                              │
│                                                          │
│  Pure Components (no hooks):                            │
│  - EventCard, MetricCard, StatusBadge, etc.             │
└──────────────────────────────────────────────────────────┘
```

### 2.3 MCP Server (TypeScript)

```
stdin/stdout (stdio transport)
        │
        ▼
┌───────────────────────────┐
│     MCP stdio server       │
│  ListTools → 8 tools       │
│  CallTool → dispatch       │
├───────────────────────────┤
│  tools/                   │
│   land-plots, ledger,     │
│   metrics, ndvi, payout,  │
│   proof, transactions     │
├───────────────────────────┤
│  workflows/               │
│   smart-payout            │
│   field-inspection        │
│   platform-audit          │
├───────────────────────────┤
│  api-client.ts            │
│   → HTTP to Backend :8888  │
└───────────────────────────┘
```

### 2.4 Mobile (React Native + WatermelonDB)

```
┌─────────────────────────────────────┐
│         React Native App            │
│  WatermelonDB (SQLite local store)  │
│  Offline-first: write locally first │
│  Background sync: push → pull       │
├─────────────────────────────────────┤
│  Sync Protocol:                     │
│  POST /sync/push  → send local data │
│  GET  /sync/pull  → fetch delta     │
│  Conflict: last_synced_at wins      │
└─────────────────────────────────────┘
```

---

## 3. Data Flow Diagrams

### 3.1 Payout Flow (Core Path)

```
Client                Backend                  Redis        PostGIS       NATS
  │                      │                       │              │           │
  │──POST /payouts────►  │                       │              │           │
  │  X-Idempotency-Key   │                       │              │           │
  │                      │──GET key─────────────►│              │           │
  │                      │◄──MISS────────────────│              │           │
  │                      │                       │              │           │
  │                      │── BEGIN TRANSACTION ──────────────►  │           │
  │                      │   INSERT transactions ──────────────►│           │
  │                      │   INSERT journal_entries (x8) ──────►│           │
  │                      │   trigger: enforce_double_entry ─────►│          │
  │                      │   INSERT audit_log ─────────────────►│           │
  │                      │── COMMIT ─────────────────────────►  │           │
  │                      │                       │              │           │
  │                      │──SET key (24h TTL)───►│              │           │
  │                      │                       │              │           │
  │                      │── Publish payout.completed ──────────────────────►│
  │                      │   (fire-and-forget)   │              │           │
  │◄─201 Created─────────│                       │              │           │
```

### 3.2 GPS Proof of Action Flow

```
Mobile App            Backend              PostGIS        NATS
    │                    │                    │              │
    │──POST /proof────►  │                    │              │
    │  (accuracy_m,      │                    │              │
    │   photo_hash,      │                    │              │
    │   lat/lon)         │                    │              │
    │                    │── Check photo_hash ──────────────►│
    │                    │   (SELECT WHERE hash = ?)         │
    │                    │◄── exists? ─────────────────────── │
    │                    │                    │              │
    │                    │  EvaluateAccuracy()│              │
    │                    │  (domain function) │              │
    │                    │  accuracy <= 0 → SPOOFED          │
    │                    │  accuracy < 1.0 → SPOOFED         │
    │                    │  duplicate hash → SPOOFED         │
    │                    │  else → VERIFIED  │              │
    │                    │                    │              │
    │                    │── INSERT proof_of_action ────────►│
    │                    │── INSERT audit_log ──────────────►│
    │                    │                    │              │
    │                    │── Publish proof.verdict ─────────────────────────►│
    │◄─201 Created───────│                    │              │
```

### 3.3 NDVI Observation + Alert Flow

```
Satellite / API         Backend             PostGIS        NATS
       │                   │                   │              │
       │──POST /satellite ►│                   │              │
       │  (ndvi_mean,       │                   │              │
       │   ndvi_min/max,    │                   │              │
       │   plot_id)         │                   │              │
       │                   │  CheckNDVI()      │              │
       │                   │  ndvi_mean < 0.30 → reject 422  │
       │                   │  ndvi_mean >= 0.30 → allowed    │
       │                   │                   │              │
       │                   │── INSERT satellite_observations ►│
       │                   │── INSERT audit_log ─────────────►│
       │                   │                   │              │
       │                   │  if ndvi_mean < 0.30:           │
       │                   │── Publish ndvi.alert ─────────────────────────►│
       │◄─201 Created──────│                   │              │
```

### 3.4 SSE Event Streaming Flow

```
SSE Client (browser / EventFeed.tsx)    Backend         NATS
           │                               │               │
           │──GET /events/stream──────────►│               │
           │  Accept: text/event-stream    │               │
           │                               │──Subscribe────►│
           │                               │  finagra.>    │
           │◄──data: {"type":"connected"}──│               │
           │                               │               │
           │   [15s keep-alive ticks]       │               │
           │◄──: ping ─────────────────────│               │
           │                               │               │
           │   [domain action occurs]       │               │
           │                               │◄──Message─────│
           │◄──data: {PlatformEvent JSON}──│               │
           │                               │               │
           │   [client disconnects]        │               │
           │──(connection closed)─────────►│               │
           │                               │──ctx.Done()──►│
           │                               │  Unsubscribe  │
```

### 3.5 Offline Mobile Sync Flow

```
Mobile (WatermelonDB)          Backend              PostGIS
       │                          │                    │
       │  [offline operations]    │                    │
       │  INSERT/UPDATE locally   │                    │
       │                          │                    │
       │──POST /sync/push────────►│                    │
       │  {farmers[], plots[],    │                    │
       │   records[],             │                    │
       │   client_timestamp}      │                    │
       │                          │── BEGIN TXN ──────►│
       │                          │  UPSERT with        │
       │                          │  last_synced_at     │
       │                          │  conflict resolution│
       │                          │── COMMIT ──────────►│
       │                          │                    │
       │                          │──Publish sync.batch─────────────►NATS
       │◄─200 OK─────────────────│                    │
       │  {server_timestamp}      │                    │
       │                          │                    │
       │──GET /sync/pull─────────►│                    │
       │  ?since=<last_pull>      │                    │
       │                          │── SELECT WHERE ────►│
       │                          │   updated_at > since│
       │◄─200 {delta records}─────│                    │
```

---

## 4. Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     docker-compose (local / staging)                     │
│                                                                          │
│  ┌────────────────┐   ┌────────────────┐   ┌─────────────────────────┐  │
│  │  PostGIS 17    │   │   Redis 7      │   │      NATS 2.10          │  │
│  │  :5432         │   │   :6379        │   │      :4222              │  │
│  │  postgis/      │   │   redis:7-     │   │      JetStream: -js     │  │
│  │  postgis:17-   │   │   alpine       │   │                         │  │
│  │  3.5           │   │                │   │                         │  │
│  └────────────────┘   └────────────────┘   └─────────────────────────┘  │
│                                                                          │
│  ┌────────────────┐   ┌────────────────┐   ┌─────────────────────────┐  │
│  │  OTel Collector│   │  Prometheus    │   │      Grafana            │  │
│  │  (OTLP)        │   │  :9090         │   │      :3001              │  │
│  └────────────────┘   └────────────────┘   └─────────────────────────┘  │
│                                                                          │
│  ┌────────────────┐                                                      │
│  │  Adminer       │                                                      │
│  │  :8080         │                                                      │
│  └────────────────┘                                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                     Application Layer (local dev)                         │
│                                                                           │
│  ┌──────────────────────────────────┐   ┌──────────────────────────────┐ │
│  │  Go Backend                      │   │  Next.js Web                 │ │
│  │  :8888                           │   │  :3000                       │ │
│  │  apps/backend/main.go            │   │  apps/web                    │ │
│  └──────────────────────────────────┘   └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Security Model

| Concern | Implementation |
|---|---|
| Idempotency | Redis `SET NX` with 24h TTL per key |
| Audit trail | Immutable `audit_log` table; DB trigger blocks UPDATE/DELETE |
| Double-entry integrity | DB trigger `enforce_double_entry` at INSERT time |
| GPS anti-spoofing | Domain layer: accuracy_m validation + duplicate photo_hash check |
| Correlation tracing | `X-Correlation-ID` header injected by middleware; logged on every request |
| Input validation | Zod (MCP/web) + Go struct binding with Echo validation |

---

## 6. Scalability Considerations

| Concern | Current Approach | Production Path |
|---|---|---|
| Payout throughput | Single Postgres instance | Read replicas + PgBouncer |
| Idempotency | Redis single node | Redis Cluster / Sentinel |
| Event fanout | NATS core pub/sub | NATS JetStream (enabled) for durable consumers |
| Frontend | ISR with 30s revalidation | CDN caching at edge |
| API | Single Echo instance | Horizontal pods behind LB |
| Mobile sync | Single endpoint | Partition by `farmer_id` shard |

---

## 7. CI/CD Pipeline

```
push/PR
  │
  ▼
Gate 1: Math Lockdown (no infra)
  │ pass
  ├────────────────────────────────────────────────┐
  ▼                    ▼                           ▼
Gate 2:              Gate 3:                    Gate 4:
Backend             Frontend Jest              MCP Jest
Integration         80% coverage               (runInBand)
(PostGIS+Redis+NATS)                          (PostGIS+Backend)
  │ pass              │ pass
  └────────────┬──────┘
               ▼
            Gate 5:
            Playwright E2E + WCAG 2.1 AA
            (full stack)
               │ pass
               ▼
            ✓ merge allowed
```

Concurrency group cancel-in-progress prevents queue buildup on the same ref.
