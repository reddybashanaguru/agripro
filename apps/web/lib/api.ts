import type {
  LedgerBalance,
  TransactionListResponse,
  PlatformMetrics,
  JournalEntriesResponse,
} from "./types";

// NEXT_PUBLIC_ vars may be inlined as the string "undefined" by SWC when unset
const _raw = process.env.NEXT_PUBLIC_API_URL;
const BACKEND_URL = (!_raw || _raw === "undefined") ? "" : _raw;
const API_BASE = BACKEND_URL || "http://localhost:8888";
const DEMO_MODE = !BACKEND_URL;

// ─── Demo Mode mock data (returned when no backend is configured) ─────────────

const MOCK_METRICS: PlatformMetrics = {
  farmer_count: 142,
  plot_count: 89,
  transaction_count: 37,
  total_disbursed: "1847500",
  total_ndvi_alerts: 3,
  total_proof_records: 124,
};

const MOCK_BALANCE: LedgerBalance = {
  total_debit: "9237500",
  total_credit: "9237500",
  is_balanced: true,
  entry_count: 296,
  transaction_count: 37,
};

const MOCK_TRANSACTIONS: TransactionListResponse = {
  total: 37,
  limit: 20,
  offset: 0,
  transactions: [
    {
      id: "txn-001",
      idempotency_key: "idem-001",
      gross_amount: "75000",
      currency: "INR",
      status: "COMPLETED",
      farmer_id: "d457d2ae-2dae-4988-a0cc-fc5eda76cd76",
      description: "Wheat harvest payout — Rabi season",
      created_at: "2026-05-12T08:30:00Z",
      completed_at: "2026-05-12T08:30:04Z",
    },
    {
      id: "txn-002",
      idempotency_key: "idem-002",
      gross_amount: "50000",
      currency: "INR",
      status: "COMPLETED",
      farmer_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      description: "Maize harvest payout — pilot batch",
      created_at: "2026-05-11T14:15:00Z",
      completed_at: "2026-05-11T14:15:06Z",
    },
    {
      id: "txn-003",
      idempotency_key: "idem-003",
      gross_amount: "120000",
      currency: "INR",
      status: "COMPLETED",
      farmer_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      description: "Sugarcane payout — Karnataka pilot",
      created_at: "2026-05-10T09:45:00Z",
      completed_at: "2026-05-10T09:45:08Z",
    },
    {
      id: "txn-004",
      idempotency_key: "idem-004",
      gross_amount: "30000",
      currency: "INR",
      status: "COMPLETED",
      farmer_id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
      description: "Tomato harvest payout",
      created_at: "2026-05-09T11:00:00Z",
      completed_at: "2026-05-09T11:00:05Z",
    },
    {
      id: "txn-005",
      idempotency_key: "idem-005",
      gross_amount: "85000",
      currency: "INR",
      status: "COMPLETED",
      farmer_id: "d4e5f6a7-b8c9-0123-defa-234567890123",
      description: "Rice harvest payout — Andhra batch",
      created_at: "2026-05-08T16:20:00Z",
      completed_at: "2026-05-08T16:20:09Z",
    },
    {
      id: "txn-006",
      idempotency_key: "idem-006",
      gross_amount: "45000",
      currency: "INR",
      status: "PENDING",
      farmer_id: "e5f6a7b8-c9d0-1234-efab-345678901234",
      description: "Cotton harvest payout — pending GPS verification",
      created_at: "2026-05-13T07:10:00Z",
      completed_at: null,
    },
    {
      id: "txn-007",
      idempotency_key: "idem-007",
      gross_amount: "62000",
      currency: "INR",
      status: "COMPLETED",
      farmer_id: "f6a7b8c9-d0e1-2345-fabc-456789012345",
      description: "Groundnut payout — Telangana pilot",
      created_at: "2026-05-07T13:30:00Z",
      completed_at: "2026-05-07T13:30:07Z",
    },
    {
      id: "txn-008",
      idempotency_key: "idem-008",
      gross_amount: "98000",
      currency: "INR",
      status: "COMPLETED",
      farmer_id: "a7b8c9d0-e1f2-3456-abcd-567890123456",
      description: "Soybean harvest — bulk disbursal",
      created_at: "2026-05-06T10:00:00Z",
      completed_at: "2026-05-06T10:00:11Z",
    },
    {
      id: "txn-009",
      idempotency_key: "idem-009",
      gross_amount: "37500",
      currency: "INR",
      status: "FAILED",
      farmer_id: "b8c9d0e1-f2a3-4567-bcde-678901234567",
      description: "Onion payout — NDVI below threshold (0.22)",
      created_at: "2026-05-05T08:45:00Z",
      completed_at: null,
    },
    {
      id: "txn-010",
      idempotency_key: "idem-010",
      gross_amount: "110000",
      currency: "INR",
      status: "COMPLETED",
      farmer_id: "c9d0e1f2-a3b4-5678-cdef-789012345678",
      description: "Banana harvest payout — Kenya pilot",
      created_at: "2026-05-04T15:55:00Z",
      completed_at: "2026-05-04T15:55:13Z",
    },
  ],
};

// ─── Live fetch (used when NEXT_PUBLIC_API_URL is set) ────────────────────────

async function fetchAPI<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}/api/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Server-side fetchers (called from Server Components) ─────────────────────

export async function getLedgerBalance(): Promise<LedgerBalance> {
  if (DEMO_MODE) return MOCK_BALANCE;
  try {
    return await fetchAPI<LedgerBalance>("/ledger/balance", { next: { revalidate: 30 } });
  } catch {
    return MOCK_BALANCE;
  }
}

export async function getTransactions(
  limit = 20,
  offset = 0
): Promise<TransactionListResponse> {
  if (DEMO_MODE) {
    const sliced = MOCK_TRANSACTIONS.transactions.slice(offset, offset + limit);
    return { ...MOCK_TRANSACTIONS, transactions: sliced, limit, offset };
  }
  try {
    return await fetchAPI<TransactionListResponse>(
      `/transactions?limit=${limit}&offset=${offset}`,
      { next: { revalidate: 15 } }
    );
  } catch {
    const sliced = MOCK_TRANSACTIONS.transactions.slice(offset, offset + limit);
    return { ...MOCK_TRANSACTIONS, transactions: sliced, limit, offset };
  }
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  if (DEMO_MODE) return MOCK_METRICS;
  try {
    return await fetchAPI<PlatformMetrics>("/metrics-platform", { next: { revalidate: 60 } });
  } catch {
    return MOCK_METRICS;
  }
}

export async function getJournalEntries(
  txnId: string
): Promise<JournalEntriesResponse> {
  if (DEMO_MODE) return { txn_id: txnId, entries: [], count: 0 };
  try {
    return await fetchAPI<JournalEntriesResponse>(`/payouts/${txnId}/entries`, { next: { revalidate: 300 } });
  } catch {
    return { txn_id: txnId, entries: [], count: 0 };
  }
}

// ─── Client-side fetchers (used as SWR keys) ──────────────────────────────────

export const swrFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function ledgerBalanceKey() {
  return `${API_BASE}/api/v1/ledger/balance`;
}
export function transactionsKey(limit = 20, offset = 0) {
  return `${API_BASE}/api/v1/transactions?limit=${limit}&offset=${offset}`;
}
export function metricsKey() {
  return `${API_BASE}/api/v1/metrics-platform`;
}
