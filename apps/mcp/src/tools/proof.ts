import { z } from "zod";
import { randomUUID } from "crypto";
import { api } from "../api-client.js";
import type { ToolDefinition } from "./index.js";

const SubmitProofSchema = z.object({
  plot_id: z.string().uuid(),
  farmer_id: z.string().uuid(),
  photo_hash: z.string().min(8, "photo_hash must be at least 8 characters"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0, "accuracy_m must be >= 0 (use 0 to test spoofing detection)"),
  action_type: z.string().default("FIELD_VISIT"),
  notes: z.string().optional(),
});

export interface ProofResult {
  proof_id: string | null;
  verdict: "VERIFIED" | "REJECTED" | "SPOOFED";
  reason: string;
  farmer_id: string;
  plot_id: string;
  photo_hash: string;
}

const VERDICT_EXPLANATION: Record<string, string> = {
  VERIFIED: "GPS coordinates are authentic and within the registered plot boundary. Field visit confirmed.",
  REJECTED: "GPS coordinates do not match the registered plot boundary.",
  SPOOFED: "GPS accuracy is suspiciously precise (accuracy_m < 1.0 or ≤ 0) — spoofing detected.",
};

export const submitFieldProofTool: ToolDefinition = {
  name: "submit_field_proof",
  description:
    "Submit a GPS proof-of-action for a farmer's field visit. The system anti-spoofing check rejects impossible GPS accuracy (≤0m) and suspicious precision (<1m). Duplicate photo hashes are also flagged as SPOOFED. Returns VERIFIED, REJECTED, or SPOOFED verdict.",
  inputSchema: {
    type: "object" as const,
    properties: {
      plot_id: { type: "string", description: "UUID of the land plot being visited" },
      farmer_id: { type: "string", description: "UUID of the farmer performing the field visit" },
      photo_hash: { type: "string", description: "SHA-256 hash of the field photo for deduplication" },
      latitude: { type: "number", description: "GPS latitude of the field visit" },
      longitude: { type: "number", description: "GPS longitude of the field visit" },
      accuracy_m: { type: "number", description: "GPS accuracy in metres (must be ≥ 1.0 to pass anti-spoofing)" },
      action_type: { type: "string", description: "Type of field action (default: FIELD_VISIT)" },
      notes: { type: "string", description: "Optional notes about the field visit" },
    },
    required: ["plot_id", "farmer_id", "photo_hash", "latitude", "longitude", "accuracy_m"],
  },
  execute: async (args: Record<string, unknown>) => {
    const params = SubmitProofSchema.parse(args);

    const result = await api.postWithAutoKey<ProofResult>(
      `/api/v1/land-plots/${params.plot_id}/proof-of-action`,
      {
        farmer_id: params.farmer_id,
        photo_hash: params.photo_hash,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy_m: params.accuracy_m,
        action_type: params.action_type,
        notes: params.notes ?? "",
      }
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verdict: result.verdict,
            proof_id: result.proof_id,
            explanation: VERDICT_EXPLANATION[result.verdict] ?? result.reason,
            details: {
              farmer_id: result.farmer_id,
              plot_id: result.plot_id,
              photo_hash: result.photo_hash,
            },
            next_step: result.verdict === "VERIFIED"
              ? "Field visit confirmed. You may now initiate a payout using initiate_payout."
              : "No payout should be initiated for this visit.",
          }, null, 2),
        },
      ],
      isError: result.verdict !== "VERIFIED",
    };
  },
};
