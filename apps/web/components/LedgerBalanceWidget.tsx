import { CheckCircle, AlertTriangle, Scale } from "lucide-react";
import { type LedgerBalance, formatINR } from "@/lib/types";

interface Props {
  balance: LedgerBalance;
}

export function LedgerBalanceWidget({ balance }: Props) {
  const balanced = balance.is_balanced;

  return (
    <section
      className="rounded-xl border-2 bg-white p-6 shadow-sm"
      aria-labelledby="ledger-balance-heading"
      style={{ borderColor: balanced ? "#bbf7d0" : "#fecaca" }}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-gray-500" aria-hidden="true" />
          <h2
            id="ledger-balance-heading"
            className="text-lg font-semibold text-gray-900"
          >
            Global Ledger Balance
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
            balanced
              ? "bg-brand-100 text-brand-800"
              : "bg-red-100 text-red-800"
          }`}
          aria-live="polite"
        >
          {balanced ? (
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          )}
          {balanced ? "BALANCED" : "IMBALANCED"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="text-xs font-medium text-blue-800 uppercase tracking-wider">
            Total Debit
          </p>
          <p className="mt-1 text-2xl font-bold text-blue-900 tabular-nums">
            {formatINR(balance.total_debit)}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-4">
          <p className="text-xs font-medium text-emerald-800 uppercase tracking-wider">
            Total Credit
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-900 tabular-nums">
            {formatINR(balance.total_credit)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <span>
          <strong className="text-gray-900 tabular-nums">
            {balance.entry_count.toLocaleString("en-IN")}
          </strong>{" "}
          journal entries
        </span>
        <span>
          <strong className="text-gray-900 tabular-nums">
            {balance.transaction_count.toLocaleString("en-IN")}
          </strong>{" "}
          transactions
        </span>
      </div>
    </section>
  );
}
