import { type Transaction, formatINR, formatDate, statusToVariant } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  transactions: Transaction[];
  caption?: string;
}

export function TransactionTable({
  transactions,
  caption = "Recent payout transactions",
}: Props) {
  if (transactions.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center"
        role="status"
        aria-label="No transactions found"
      >
        <p className="text-gray-600">No transactions yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm" tabIndex={0}>
      <table className="w-full text-sm" aria-label={caption}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-gray-50 text-left">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider"
            >
              Transaction ID
            </th>
            <th
              scope="col"
              className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider"
            >
              Amount
            </th>
            <th
              scope="col"
              className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider"
            >
              Description
            </th>
            <th
              scope="col"
              className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider"
            >
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {transactions.map((txn) => (
            <tr
              key={txn.id}
              className="hover:bg-gray-50 transition-colors focus-within:bg-blue-50"
            >
              <td className="px-4 py-3">
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">
                  {txn.id.slice(0, 8)}…
                </code>
              </td>
              <td className="px-4 py-3 font-semibold tabular-nums text-gray-900">
                {formatINR(txn.gross_amount)}
                <span className="ml-1 text-xs text-gray-600">
                  {txn.currency}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={txn.status}
                  variant={statusToVariant(txn.status)}
                />
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                {txn.description || "—"}
              </td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                {formatDate(txn.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
