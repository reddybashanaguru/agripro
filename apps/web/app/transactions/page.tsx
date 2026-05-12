import type { Metadata } from "next";
import { ArrowRightLeft } from "lucide-react";
import { TransactionTable } from "@/components/TransactionTable";
import { getTransactions } from "@/lib/api";

export const metadata: Metadata = { title: "Transactions" };
export const revalidate = 15;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  let data;
  try {
    data = await getTransactions(limit, offset);
  } catch {
    data = null;
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <ArrowRightLeft
          className="h-8 w-8 text-brand-600"
          aria-hidden="true"
        />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-600">
            Full payout history — ordered by most recent first
          </p>
        </div>
      </div>

      {!data && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6" role="alert">
          <p className="font-semibold text-red-800">Failed to load transactions</p>
        </div>
      )}

      {data && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing{" "}
              <strong className="text-gray-900">
                {offset + 1}–{Math.min(offset + limit, data.total)}
              </strong>{" "}
              of{" "}
              <strong className="text-gray-900">
                {data.total.toLocaleString("en-IN")}
              </strong>{" "}
              transactions
            </p>
          </div>

          <TransactionTable
            transactions={data.transactions}
            caption="Paginated payout transaction history"
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <nav
              className="mt-6 flex items-center justify-center gap-2"
              aria-label="Pagination"
            >
              {page > 1 && (
                <a
                  href={`/transactions?page=${page - 1}`}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  aria-label="Previous page"
                >
                  ← Previous
                </a>
              )}
              <span
                className="px-4 py-2 text-sm text-gray-700"
                aria-current="page"
              >
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <a
                  href={`/transactions?page=${page + 1}`}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  aria-label="Next page"
                >
                  Next →
                </a>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
