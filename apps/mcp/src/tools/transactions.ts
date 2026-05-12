import { z } from "zod";
import { api } from "../api-client.js";
import type { ToolDefinition } from "./index.js";

const ListTransactionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).default(0),
});

export interface Transaction {
  id: string;
  idempotency_key: string;
  gross_amount: string;
  currency: string;
  status: string;
  farmer_id: string;
  description: string;
  created_at: string;
  completed_at: string | null;
}

export const listTransactionsTool: ToolDefinition = {
  name: "list_transactions",
  description:
    "List payout transactions ordered by most recent first. Supports pagination. Returns each transaction's ID, gross amount (INR), status (COMPLETED/PENDING/FAILED), farmer ID, description, and timestamps.",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Number of transactions to return (1–100, default 10)",
      },
      offset: {
        type: "number",
        description: "Pagination offset (default 0)",
      },
    },
    required: [],
  },
  execute: async (args: Record<string, unknown>) => {
    const { limit, offset } = ListTransactionsSchema.parse(args);
    const data = await api.get<{ transactions: Transaction[]; total: number; limit: number; offset: number }>(
      `/api/v1/transactions?limit=${limit}&offset=${offset}`
    );
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            showing: `${offset + 1}–${Math.min(offset + limit, data.total)} of ${data.total}`,
            transactions: data.transactions.map((t) => ({
              id: t.id,
              amount: `₹${parseInt(t.gross_amount).toLocaleString("en-IN")}`,
              gross_amount_raw: t.gross_amount,
              status: t.status,
              farmer_id: t.farmer_id,
              description: t.description || "(no description)",
              created_at: t.created_at,
            })),
            pagination: { total: data.total, limit, offset },
          }, null, 2),
        },
      ],
    };
  },
};
