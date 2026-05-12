import { randomUUID } from "crypto";
import { checkPlotNDVITool } from "../tools/ndvi.js";
import { initiatePayoutTool } from "../tools/payout.js";
import { getLedgerBalanceTool } from "../tools/ledger.js";

export interface SmartPayoutInput {
  farmer_id: string;
  plot_id: string;
  gross_amount: string;
  description: string;
}

export interface SmartPayoutResult {
  workflow: "SMART_PAYOUT";
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  steps: StepResult[];
  summary: string;
}

interface StepResult {
  step: number;
  name: string;
  outcome: "PASS" | "BLOCK" | "FAIL";
  detail: unknown;
}

/**
 * Workflow 1: Smart Payout Orchestration
 *
 * Step 1 — check_plot_ndvi: Verify vegetation index ≥ 0.30
 * Step 2 — initiate_payout: Execute payout with 50/25/5/20 split
 * Step 3 — get_ledger_balance: Assert ledger is still balanced post-payout
 */
export async function smartPayoutWorkflow(input: SmartPayoutInput): Promise<SmartPayoutResult> {
  const steps: StepResult[] = [];

  // ── Step 1: NDVI pre-flight check ────────────────────────────────────────
  const ndviResult = await checkPlotNDVITool.execute({ plot_id: input.plot_id });
  const ndviData = JSON.parse(ndviResult.content[0].text) as {
    payout_eligible: boolean;
    ndvi?: { mean: string };
    payout_status: string;
    label?: string;
  };

  steps.push({
    step: 1,
    name: "NDVI Pre-flight Check",
    outcome: ndviData.payout_eligible ? "PASS" : "BLOCK",
    detail: ndviData,
  });

  if (!ndviData.payout_eligible) {
    return {
      workflow: "SMART_PAYOUT",
      status: "BLOCKED",
      steps,
      summary: `Payout blocked. NDVI for plot ${input.plot_id} is ${ndviData.ndvi?.mean ?? "unknown"} — below the 0.30 threshold (${ndviData.label ?? "stressed crop"}). Auto-unblocks after next satellite pass.`,
    };
  }

  // ── Step 2: Execute payout ─────────────────────────────────────────────────
  const idKey = `mcp-smart-payout-${randomUUID()}`;
  const payoutResult = await initiatePayoutTool.execute({
    farmer_id: input.farmer_id,
    plot_id: input.plot_id,
    gross_amount: input.gross_amount,
    description: input.description,
    idempotency_key: idKey,
  });

  const payoutData = JSON.parse(payoutResult.content[0].text) as {
    status: string;
    transaction_id?: string;
    disbursement?: Record<string, string>;
    reason?: string;
  };

  const payoutPassed = payoutData.status === "PAYOUT_COMPLETED";
  steps.push({
    step: 2,
    name: "Payout Execution",
    outcome: payoutPassed ? "PASS" : "FAIL",
    detail: payoutData,
  });

  if (!payoutPassed) {
    return {
      workflow: "SMART_PAYOUT",
      status: "FAILED",
      steps,
      summary: `Payout failed: ${payoutData.reason ?? "unknown error"}`,
    };
  }

  // ── Step 3: Post-payout ledger integrity check ─────────────────────────────
  const ledgerResult = await getLedgerBalanceTool.execute({});
  const ledgerData = JSON.parse(ledgerResult.content[0].text) as {
    status: string;
    balance: { is_balanced: boolean };
  };

  const ledgerOk = ledgerData.balance.is_balanced;
  steps.push({
    step: 3,
    name: "Post-Payout Ledger Integrity",
    outcome: ledgerOk ? "PASS" : "FAIL",
    detail: { ledger_status: ledgerData.status, is_balanced: ledgerData.balance.is_balanced },
  });

  return {
    workflow: "SMART_PAYOUT",
    status: ledgerOk ? "COMPLETED" : "FAILED",
    steps,
    summary: ledgerOk
      ? `Payout of ₹${parseInt(input.gross_amount).toLocaleString("en-IN")} completed for farmer ${input.farmer_id}. Transaction: ${payoutData.transaction_id}. Ledger remains balanced.`
      : `Payout completed but ledger is imbalanced — investigate immediately!`,
  };
}
