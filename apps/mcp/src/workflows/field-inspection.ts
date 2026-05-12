import { submitFieldProofTool } from "../tools/proof.js";
import { smartPayoutWorkflow } from "./smart-payout.js";

export interface FieldInspectionInput {
  plot_id: string;
  farmer_id: string;
  photo_hash: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  gross_amount: string;
  description?: string;
}

export interface FieldInspectionResult {
  workflow: "FIELD_INSPECTION";
  status: "PAYOUT_TRIGGERED" | "PROOF_REJECTED" | "PAYOUT_BLOCKED" | "FAILED";
  steps: Array<{ step: number; name: string; outcome: string; detail: unknown }>;
  summary: string;
}

/**
 * Workflow 2: Field Inspection → Auto-Payout
 *
 * Step 1 — submit_field_proof: Verify farmer visited the field (anti-spoofing)
 * Step 2 — smart_payout_workflow: If VERIFIED, run the full NDVI-gated payout
 */
export async function fieldInspectionWorkflow(input: FieldInspectionInput): Promise<FieldInspectionResult> {
  const steps: Array<{ step: number; name: string; outcome: string; detail: unknown }> = [];

  // ── Step 1: Submit GPS proof-of-action ────────────────────────────────────
  const proofResult = await submitFieldProofTool.execute({
    plot_id: input.plot_id,
    farmer_id: input.farmer_id,
    photo_hash: input.photo_hash,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_m: input.accuracy_m,
    action_type: "FIELD_VISIT",
    notes: "Automated MCP field inspection workflow",
  });

  const proofData = JSON.parse(proofResult.content[0].text) as {
    verdict: string;
    proof_id: string | null;
    explanation: string;
  };

  steps.push({
    step: 1,
    name: "GPS Proof-of-Action",
    outcome: proofData.verdict,
    detail: proofData,
  });

  if (proofData.verdict !== "VERIFIED") {
    return {
      workflow: "FIELD_INSPECTION",
      status: "PROOF_REJECTED",
      steps,
      summary: `Field inspection failed. Verdict: ${proofData.verdict}. ${proofData.explanation} No payout will be triggered.`,
    };
  }

  // ── Step 2: Trigger smart payout ──────────────────────────────────────────
  const payoutResult = await smartPayoutWorkflow({
    farmer_id: input.farmer_id,
    plot_id: input.plot_id,
    gross_amount: input.gross_amount,
    description: input.description ?? `Field inspection payout — plot ${input.plot_id.slice(0, 8)}`,
  });

  steps.push({
    step: 2,
    name: "Smart Payout (NDVI + Ledger)",
    outcome: payoutResult.status,
    detail: {
      sub_workflow: payoutResult.workflow,
      sub_steps: payoutResult.steps,
    },
  });

  return {
    workflow: "FIELD_INSPECTION",
    status: payoutResult.status === "COMPLETED"
      ? "PAYOUT_TRIGGERED"
      : payoutResult.status === "BLOCKED"
      ? "PAYOUT_BLOCKED"
      : "FAILED",
    steps,
    summary: payoutResult.summary,
  };
}
