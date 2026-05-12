import { getPlatformMetricsTool } from "../tools/metrics.js";
import { getLedgerBalanceTool } from "../tools/ledger.js";
import { listTransactionsTool } from "../tools/transactions.js";

export interface PlatformAuditResult {
  workflow: "PLATFORM_AUDIT";
  status: "HEALTHY" | "WARNING" | "CRITICAL";
  timestamp: string;
  checks: AuditCheck[];
  summary: string;
  report: string;
}

interface AuditCheck {
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
}

/**
 * Workflow 3: Platform Audit Report
 *
 * Step 1 — get_platform_metrics: KPI snapshot
 * Step 2 — get_ledger_balance: Double-entry integrity
 * Step 3 — list_transactions: Recent activity sample
 *
 * Produces a structured audit report suitable for investor review.
 */
export async function platformAuditWorkflow(): Promise<PlatformAuditResult> {
  const timestamp = new Date().toISOString();
  const checks: AuditCheck[] = [];

  // ── Step 1: Platform Metrics ───────────────────────────────────────────────
  const metricsResult = await getPlatformMetricsTool.execute({});
  const metricsData = JSON.parse(metricsResult.content[0].text) as {
    metrics: {
      farmer_count: number;
      plot_count: number;
      transaction_count: number;
      total_disbursed: string;
      total_ndvi_alerts: number;
      total_proof_records: number;
    };
  };
  const m = metricsData.metrics;

  checks.push({
    name: "Farmer Registration",
    status: m.farmer_count > 0 ? "PASS" : "WARN",
    detail: `${m.farmer_count.toLocaleString()} farmers registered`,
  });

  checks.push({
    name: "NDVI Sentinel",
    status: m.total_ndvi_alerts === 0 ? "PASS" : "WARN",
    detail: m.total_ndvi_alerts === 0
      ? "All plots within healthy NDVI range"
      : `${m.total_ndvi_alerts} plot(s) below NDVI 0.30 — payouts blocked`,
  });

  checks.push({
    name: "GPS Proof Coverage",
    status: m.total_proof_records > 0 ? "PASS" : "WARN",
    detail: `${m.total_proof_records} field proof-of-action records on file`,
  });

  // ── Step 2: Ledger Integrity ───────────────────────────────────────────────
  const ledgerResult = await getLedgerBalanceTool.execute({});
  const ledgerData = JSON.parse(ledgerResult.content[0].text) as {
    status: string;
    balance: {
      is_balanced: boolean;
      total_debit: string;
      total_credit: string;
      entry_count: number;
      transaction_count: number;
    };
    integrity_checks: Array<{ rule: string; pass: boolean }>;
  };
  const bal = ledgerData.balance;

  checks.push({
    name: "Double-Entry Ledger Balance",
    status: bal.is_balanced ? "PASS" : "FAIL",
    detail: bal.is_balanced
      ? `Balanced — ₹${parseInt(bal.total_debit).toLocaleString("en-IN")} debit = ₹${parseInt(bal.total_credit).toLocaleString("en-IN")} credit`
      : `IMBALANCED — debit ₹${bal.total_debit} ≠ credit ₹${bal.total_credit}`,
  });

  checks.push({
    name: "Journal Entry Integrity",
    status: bal.entry_count % 8 === 0 ? "PASS" : "FAIL",
    detail: `${bal.entry_count} entries (${bal.entry_count % 8 === 0 ? "correct multiple of 8" : "WRONG — not multiple of 8"})`,
  });

  // ── Step 3: Recent Transactions ────────────────────────────────────────────
  const txnResult = await listTransactionsTool.execute({ limit: 5, offset: 0 });
  const txnData = JSON.parse(txnResult.content[0].text) as {
    pagination: { total: number };
    transactions: Array<{ id: string; amount: string; status: string; description: string }>;
  };

  checks.push({
    name: "Transaction Activity",
    status: txnData.pagination.total > 0 ? "PASS" : "WARN",
    detail: `${txnData.pagination.total} total transactions on record`,
  });

  // ── Compute overall status ─────────────────────────────────────────────────
  const hasFail = checks.some((c) => c.status === "FAIL");
  const hasWarn = checks.some((c) => c.status === "WARN");
  const overallStatus = hasFail ? "CRITICAL" : hasWarn ? "WARNING" : "HEALTHY";

  // ── Build human-readable report ────────────────────────────────────────────
  const checkLines = checks.map((c) => `  [${c.status}] ${c.name}: ${c.detail}`).join("\n");
  const recentTxns = txnData.transactions
    .map((t) => `    • ${t.amount} | ${t.status} | ${t.description}`)
    .join("\n");

  const report = [
    "═══════════════════════════════════════════════",
    "  FINAGRA UNITY — PLATFORM AUDIT REPORT",
    `  Generated: ${new Date(timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    "═══════════════════════════════════════════════",
    "",
    `  Overall Status: ${overallStatus}`,
    "",
    "  Integrity Checks:",
    checkLines,
    "",
    "  Platform Scale:",
    `    • ${m.farmer_count.toLocaleString()} farmers | ${m.plot_count} land plots`,
    `    • ₹${parseInt(m.total_disbursed).toLocaleString("en-IN")} total disbursed`,
    `    • ${m.transaction_count} completed transactions`,
    "",
    "  50/25/5/20 Math Laws: IMMUTABLE (enforced in Go domain layer)",
    "    • Farmer 50% | Platform 25% | Agent 5% | Reserve 20%",
    "",
    "  Recent Transactions (last 5):",
    recentTxns || "    (none)",
    "",
    "═══════════════════════════════════════════════",
  ].join("\n");

  return {
    workflow: "PLATFORM_AUDIT",
    status: overallStatus,
    timestamp,
    checks,
    summary: `Platform audit ${overallStatus}. ${checks.filter((c) => c.status === "PASS").length}/${checks.length} checks passed.`,
    report,
  };
}
