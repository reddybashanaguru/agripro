import type { Metadata } from "next";
import { Scale, CheckCircle, AlertTriangle } from "lucide-react";
import { LedgerBalanceWidget } from "@/components/LedgerBalanceWidget";
import { getLedgerBalance } from "@/lib/api";
import { formatINR } from "@/lib/types";

export const metadata: Metadata = { title: "Ledger Audit" };
export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  let balance;
  try {
    balance = await getLedgerBalance();
  } catch {
    balance = null;
  }

  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <Scale className="h-8 w-8 text-brand-600" aria-hidden="true" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ledger Audit</h1>
          <p className="text-gray-600">
            Double-entry integrity — every debit must equal every credit
          </p>
        </div>
      </div>

      {!balance && (
        <div
          className="mb-6 rounded-xl border border-red-200 bg-red-50 p-6"
          role="alert"
        >
          <p className="font-semibold text-red-800">
            Failed to load ledger data
          </p>
          <p className="mt-1 text-sm text-red-600">
            Verify the API at{" "}
            <code className="rounded bg-red-100 px-1">
              {process.env.NEXT_PUBLIC_API_URL}/api/v1/ledger/balance
            </code>
          </p>
        </div>
      )}

      {balance && (
        <>
          {/* Main balance widget */}
          <div className="mb-8 max-w-2xl">
            <LedgerBalanceWidget balance={balance} />
          </div>

          {/* Double-entry rules explanation */}
          <section
            aria-labelledby="rules-heading"
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h2
              id="rules-heading"
              className="mb-4 text-lg font-semibold text-gray-900"
            >
              Double-Entry Laws
            </h2>
            <div className="space-y-3 text-sm text-gray-600">
              <Rule
                ok={balance.is_balanced}
                label={`Total DEBIT (${formatINR(balance.total_debit)}) = Total CREDIT (${formatINR(balance.total_credit)})`}
              />
              <Rule
                ok={balance.entry_count % 8 === 0}
                label={`Entry count (${balance.entry_count}) is a multiple of 8 — each payout creates exactly 4 debits + 4 credits`}
              />
              <Rule
                ok={balance.transaction_count > 0}
                label={`${balance.transaction_count} completed transaction${balance.transaction_count !== 1 ? "s" : ""} on record`}
              />
            </div>

            <div className="mt-6 rounded-lg bg-gray-50 p-4 text-xs text-gray-600">
              <p className="font-semibold mb-1">50/25/5/20 Math Laws (immutable)</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>Farmer Payment: 50% of gross</li>
                <li>Platform Fee: 25% of gross</li>
                <li>Agent Commission: 5% of gross</li>
                <li>Reserve Fund: 20% of gross</li>
              </ul>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600"
          aria-label="Pass"
        />
      ) : (
        <AlertTriangle
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
          aria-label="Fail"
        />
      )}
      <span className={ok ? "text-gray-700" : "font-medium text-red-700"}>
        {label}
      </span>
    </div>
  );
}
