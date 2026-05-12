// ─── API Response Types ───────────────────────────────────────────────────────

export interface LedgerBalance {
  total_debit: string;
  total_credit: string;
  is_balanced: boolean;
  entry_count: number;
  transaction_count: number;
}

export interface Transaction {
  id: string;
  idempotency_key: string;
  gross_amount: string;
  currency: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REVERSED";
  farmer_id: string;
  description: string;
  created_at: string;
  completed_at: string | null;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface PlatformMetrics {
  farmer_count: number;
  plot_count: number;
  transaction_count: number;
  total_disbursed: string;
  total_ndvi_alerts: number;
  total_proof_records: number;
}

export interface SatelliteObservation {
  id: string;
  plot_id: string;
  source: string;
  observed_at: string;
  ndvi_mean: string;
  ndvi_min: string;
  ndvi_max: string;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  txn_id: string;
  account_id: string;
  entry_type: "DEBIT" | "CREDIT";
  amount: string;
  description: string;
  created_at: string;
}

export interface JournalEntriesResponse {
  txn_id: string;
  entries: JournalEntry[];
  count: number;
}

// ─── UI Helper Types ──────────────────────────────────────────────────────────

export type StatusVariant = "success" | "warning" | "error" | "neutral";

export function statusToVariant(status: Transaction["status"]): StatusVariant {
  switch (status) {
    case "COMPLETED":  return "success";
    case "PENDING":
    case "PROCESSING": return "warning";
    case "FAILED":
    case "REVERSED":   return "error";
    default:           return "neutral";
  }
}

export function ndviToVariant(ndvi: number): StatusVariant {
  if (ndvi >= 0.5)  return "success";
  if (ndvi >= 0.3)  return "warning";
  return "error";
}

export function formatINR(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
