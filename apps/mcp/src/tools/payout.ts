import { z } from "zod";
import { randomUUID } from "crypto";
import { api, FinagraAPIError } from "../api-client.js";
import type { ToolDefinition } from "./index.js";

const InitiatePayoutSchema = z.object({
  farmer_id: z.string().uuid("farmer_id must be a valid UUID"),
  gross_amount: z.string().regex(/^\d+(\.\d+)?$/, "gross_amount must be a numeric string (e.g. '50000')"),
  description: z.string().min(1).max(500),
  plot_id: z.string().uuid().optional(),
  idempotency_key: z.string().optional(),
});

export interface PayoutResponse {
  id: string;
  idempotency_key: string;
  gross_amount: string;
  currency: string;
  status: string;
  created_at: string;
}

export const initiatePayoutTool: ToolDefinition = {
  name: "initiate_payout",
  description:
    "Execute a payout to a farmer. Applies the immutable 50/25/5/20 split: 50% farmer, 25% platform, 5% agent commission, 20% reserve fund. If a plot_id is given, NDVI is checked first — payout is blocked when NDVI < 0.30. Returns the transaction ID and all split amounts.",
  inputSchema: {
    type: "object" as const,
    properties: {
      farmer_id: { type: "string", description: "UUID of the farmer receiving payment" },
      gross_amount: { type: "string", description: "Gross INR amount as string, e.g. '50000'" },
      description: { type: "string", description: "Purpose of this payout" },
      plot_id: { type: "string", description: "(Optional) UUID of the land plot — enables NDVI pre-check" },
      idempotency_key: { type: "string", description: "(Optional) Custom idempotency key for replay-safety" },
    },
    required: ["farmer_id", "gross_amount", "description"],
  },
  execute: async (args: Record<string, unknown>) => {
    const params = InitiatePayoutSchema.parse(args);
    const idKey = params.idempotency_key ?? `mcp-payout-${randomUUID()}`;

    try {
      const result = await api.post<PayoutResponse>(
        "/api/v1/payouts",
        {
          farmer_id: params.farmer_id,
          gross_amount: params.gross_amount,
          currency: 'INR',
          description: params.description,
          ...(params.plot_id ? { plot_id: params.plot_id } : {}),
        },
        idKey
      );

      const gross = parseInt(result.gross_amount);
      // Compute 50/25/5/20 splits (immutable math laws — see CLAUDE.md)
      const farmer = Math.floor(gross * 50 / 100);
      const platform = Math.floor(gross * 25 / 100);
      const agent = Math.floor(gross * 5 / 100);
      const reserve = gross - farmer - platform - agent;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "PAYOUT_COMPLETED",
              transaction_id: result.id,
              idempotency_key: idKey,
              disbursement: {
                gross: `₹${gross.toLocaleString("en-IN")}`,
                farmer_payment: `₹${farmer.toLocaleString("en-IN")} (50%)`,
                platform_fee: `₹${platform.toLocaleString("en-IN")} (25%)`,
                agent_commission: `₹${agent.toLocaleString("en-IN")} (5%)`,
                reserve_fund: `₹${reserve.toLocaleString("en-IN")} (20%)`,
              },
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      if (err instanceof FinagraAPIError && err.code === "NDVI_BELOW_THRESHOLD") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "PAYOUT_BLOCKED",
                reason: "NDVI_BELOW_THRESHOLD",
                message: err.message,
                action_required: "Wait for the next satellite pass (every 5 days). Payout will auto-unblock when NDVI ≥ 0.30.",
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
      throw err;
    }
  },
};
