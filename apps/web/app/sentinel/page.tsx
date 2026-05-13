import type { Metadata } from "next";
import { Satellite, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { getPlatformMetrics } from "@/lib/api";

export const metadata: Metadata = { title: "Satellite Sentinel" };
export const dynamic = "force-dynamic";

export default async function SentinelPage() {
  let metrics;
  try {
    metrics = await getPlatformMetrics();
  } catch {
    metrics = null;
  }

  const alertCount = metrics?.total_ndvi_alerts ?? 0;
  const hasAlerts = alertCount > 0;

  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <Satellite className="h-8 w-8 text-brand-600" aria-hidden="true" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Satellite Sentinel
          </h1>
          <p className="text-gray-600">
            NDVI monitoring — plots below 0.3 block payout disbursement
          </p>
        </div>
      </div>

      {/* Alert summary banner */}
      <div
        className={`mb-8 flex items-start gap-3 rounded-xl border-2 p-5 ${
          hasAlerts
            ? "border-yellow-300 bg-yellow-50"
            : "border-brand-200 bg-brand-50"
        }`}
        role="status"
        aria-live="polite"
        aria-label={
          hasAlerts
            ? `${alertCount} plots have NDVI below the payout threshold`
            : "All monitored plots are within healthy NDVI range"
        }
      >
        {hasAlerts ? (
          <AlertTriangle
            className="mt-0.5 h-6 w-6 flex-shrink-0 text-yellow-600"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle
            className="mt-0.5 h-6 w-6 flex-shrink-0 text-brand-600"
            aria-hidden="true"
          />
        )}
        <div>
          <p className={`font-semibold ${hasAlerts ? "text-yellow-800" : "text-brand-800"}`}>
            {hasAlerts
              ? `${alertCount} plot${alertCount !== 1 ? "s" : ""} below NDVI threshold`
              : "All plots within healthy range"}
          </p>
          <p className={`text-sm mt-1 ${hasAlerts ? "text-yellow-700" : "text-brand-700"}`}>
            {hasAlerts
              ? "Payouts for affected plots will be blocked until NDVI recovers above 0.30."
              : "No payout blocks in effect from satellite data."}
          </p>
        </div>
      </div>

      {/* How it works */}
      <section
        aria-labelledby="sentinel-info-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-gray-600" aria-hidden="true" />
          <h2
            id="sentinel-info-heading"
            className="text-lg font-semibold text-gray-900"
          >
            How Satellite Sentinel Works
          </h2>
        </div>

        <ol className="space-y-4 text-sm text-gray-600" role="list">
          {[
            {
              n: "1",
              title: "Satellite Ingestion",
              body: "Sentinel-2 / ISRO ResourceSat passes are ingested every 5 days. NDVI (Normalised Difference Vegetation Index) is computed per registered land plot.",
            },
            {
              n: "2",
              title: "Threshold Gate",
              body: "Before any payout is disbursed, the latest NDVI reading for the associated plot is checked. NDVI < 0.30 indicates bare soil, severe drought, or crop failure.",
            },
            {
              n: "3",
              title: "Payout Block",
              body: "If NDVI is below threshold, the payout API returns HTTP 422 NDVI_BELOW_THRESHOLD with the exact score and observation date — no money moves until the land recovers.",
            },
            {
              n: "4",
              title: "Auto-Clear",
              body: "Once the next satellite pass records NDVI ≥ 0.30, the block lifts automatically. No manual intervention required.",
            },
          ].map(({ n, title, body }) => (
            <li key={n} className="flex gap-4">
              <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800"
                aria-hidden="true"
              >
                {n}
              </span>
              <div>
                <p className="font-semibold text-gray-800">{title}</p>
                <p className="mt-0.5">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-lg bg-gray-50 p-4 text-xs text-gray-600">
          <p className="font-semibold text-gray-700 mb-1">NDVI Scale Reference</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded bg-red-100 p-2 text-center">
              <p className="font-bold text-red-700">0.0 – 0.29</p>
              <p className="text-red-800">Bare soil / stress</p>
              <p className="text-red-800">Payout blocked</p>
            </div>
            <div className="rounded bg-yellow-100 p-2 text-center">
              <p className="font-bold text-yellow-700">0.30 – 0.49</p>
              <p className="text-yellow-800">Sparse vegetation</p>
              <p className="text-yellow-800">Payout allowed</p>
            </div>
            <div className="rounded bg-brand-100 p-2 text-center">
              <p className="font-bold text-brand-700">0.50 – 1.0</p>
              <p className="text-brand-800">Healthy crop</p>
              <p className="text-brand-800">Payout allowed</p>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics summary */}
      {metrics && (
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Registered Plots", value: metrics.plot_count },
            { label: "NDVI Alerts", value: metrics.total_ndvi_alerts },
            { label: "GPS Proofs Recorded", value: metrics.total_proof_records },
            { label: "Total Transactions", value: metrics.transaction_count },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-gray-200 bg-white p-4 text-center"
            >
              <dt className="text-xs font-medium text-gray-600">{label}</dt>
              <dd className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
                {value.toLocaleString("en-IN")}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
