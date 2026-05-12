import type { Metadata } from "next";
import { Radio } from "lucide-react";
import { EventFeed } from "@/components/EventFeed";

export const metadata: Metadata = {
  title: "Live Activity",
};

// Activity page is client-driven (SSE) — no server revalidation needed
export const dynamic = "force-dynamic";

export default function ActivityPage() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-2.5">
          <Radio className="h-6 w-6 text-brand-600" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Activity</h1>
          <p className="mt-1 text-sm text-gray-600">
            Real-time domain events streamed from the platform via NATS + Server-Sent Events.
            Events appear instantly as payouts complete, GPS proofs are submitted, and NDVI
            alerts fire.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div
        className="rounded-lg border border-gray-200 bg-white px-4 py-3"
        aria-label="Event type legend"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Event Types
        </p>
        <ul className="flex flex-wrap gap-3 text-xs" role="list">
          {[
            { label: "Payout Completed", color: "bg-emerald-100 text-emerald-800" },
            { label: "GPS Proof Verdict", color: "bg-blue-100 text-blue-800" },
            { label: "NDVI Alert",        color: "bg-yellow-100 text-yellow-800" },
            { label: "Mobile Sync",       color: "bg-purple-100 text-purple-800" },
          ].map(({ label, color }) => (
            <li key={label}>
              <span className={`rounded-full px-2.5 py-1 font-medium ${color}`}>{label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Live event feed (client component with SSE) */}
      <EventFeed />
    </main>
  );
}
