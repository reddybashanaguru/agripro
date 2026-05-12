import type {
  LedgerBalance,
  TransactionListResponse,
  PlatformMetrics,
  JournalEntriesResponse,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8888";

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
  return fetchAPI<LedgerBalance>("/ledger/balance", {
    next: { revalidate: 30 },
  });
}

export async function getTransactions(
  limit = 20,
  offset = 0
): Promise<TransactionListResponse> {
  return fetchAPI<TransactionListResponse>(
    `/transactions?limit=${limit}&offset=${offset}`,
    { next: { revalidate: 15 } }
  );
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  return fetchAPI<PlatformMetrics>("/metrics-platform", {
    next: { revalidate: 60 },
  });
}

export async function getJournalEntries(
  txnId: string
): Promise<JournalEntriesResponse> {
  return fetchAPI<JournalEntriesResponse>(`/payouts/${txnId}/entries`, {
    next: { revalidate: 300 },
  });
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
