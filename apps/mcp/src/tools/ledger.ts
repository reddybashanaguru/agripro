import { api } from "../api-client.js";
import type { ToolDefinition } from "./index.js";

export interface LedgerBalance {
  total_debit: string;
  total_credit: string;
  is_balanced: boolean;
  entry_count: number;
  transaction_count: number;
}

export const getLedgerBalanceTool: ToolDefinition = {
  name: "get_ledger_balance",
  description:
    "Fetch the global double-entry ledger balance. Returns total debits, total credits, whether they are equal (is_balanced), journal entry count, and completed transaction count. A healthy platform always has is_balanced=true.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async (_args: Record<string, unknown>) => {
    const balance = await api.get<LedgerBalance>("/api/v1/ledger/balance");

    const entryMultipleOf8 = balance.entry_count % 8 === 0;
    const integrityChecks = [
      { rule: "total_debit == total_credit", pass: balance.is_balanced },
      { rule: "entry_count is multiple of 8 (4 debits + 4 credits per txn)", pass: entryMultipleOf8 },
      { rule: "at least one completed transaction on record", pass: balance.transaction_count > 0 },
    ];

    const allPass = integrityChecks.every((c) => c.pass);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: allPass ? "LEDGER_INTEGRITY_VERIFIED" : "LEDGER_INTEGRITY_FAILED",
            balance,
            integrity_checks: integrityChecks,
            math_laws: {
              farmer_payment: "50%",
              platform_fee: "25%",
              agent_commission: "5%",
              reserve_fund: "20%",
            },
          }, null, 2),
        },
      ],
    };
  },
};
