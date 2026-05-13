import type { Metadata } from "next";
import { Smartphone } from "lucide-react";
import { MobileSimulator } from "./MobileSimulator";

export const metadata: Metadata = {
  title: "Field Agent App Demo",
};

export const dynamic = "force-dynamic";

const DEMO_STEPS = [
  {
    step: "01",
    tab: "Home",
    icon: "🏠",
    title: "Dashboard Overview",
    desc: "Live platform metrics: farmers, plots, total disbursed, NDVI alerts, GPS proofs. Pull-to-refresh syncs from backend.",
    color: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-800",
  },
  {
    step: "02",
    tab: "Farmers",
    icon: "👨‍🌾",
    title: "Register a Farmer",
    desc: "Tap the green + FAB. Enter name, phone (+91), set KYC status. Submits via POST /sync/push — the WatermelonDB offline-first flow.",
    color: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-800",
  },
  {
    step: "03",
    tab: "Farmers",
    icon: "💸",
    title: "Create a Payout",
    desc: "Tap a VERIFIED farmer → Create Payout. Enter ₹10,000 and watch the 50/25/5/20 split preview live. Confirm — 8 journal entries in one DB transaction.",
    color: "bg-emerald-50 border-emerald-200",
    badge: "bg-emerald-100 text-emerald-800",
  },
  {
    step: "04",
    tab: "GPS",
    icon: "📍",
    title: "Submit GPS Proof",
    desc: "Enter Farmer ID and Plot ID from the seed data panel. GPS animation runs, then PostGIS ST_Contains checks the point. Result: VERIFIED ✅ or SPOOFED 🚨.",
    color: "bg-violet-50 border-violet-200",
    badge: "bg-violet-100 text-violet-800",
  },
  {
    step: "05",
    tab: "Events",
    icon: "📡",
    title: "Live Event Stream",
    desc: "SSE stream from NATS via /events/stream. Every payout, GPS proof, and NDVI alert appears in real-time — color-coded with structured payload.",
    color: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-800",
  },
  {
    step: "06",
    tab: "Sync",
    icon: "🔄",
    title: "Offline-First Sync",
    desc: "Health dashboard shows PostgreSQL, Redis, NATS status. WatermelonDB delta sync: push mutations offline, pull server delta on reconnect.",
    color: "bg-rose-50 border-rose-200",
    badge: "bg-rose-100 text-rose-800",
  },
];

export default function MobileDemoPage() {
  return (
    <div id="main-content" className="space-y-8">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-brand-50 p-3">
          <Smartphone className="h-7 w-7 text-brand-600" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Field Agent Mobile App</h1>
          <p className="mt-1 text-sm text-gray-600">
            Interactive simulator — React Native 0.76 · WatermelonDB · PostGIS · NATS · Real HTTP calls to :8888
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 bg-brand-50 border border-brand-200 text-brand-700 text-xs px-3 py-1.5 rounded-full font-medium">
          <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
          Live Demo
        </span>
      </div>

      {/* Main layout: phone + guide */}
      <div className="flex flex-col xl:flex-row gap-12 items-start">
        {/* Phone simulator */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3 mx-auto xl:mx-0">
          <MobileSimulator />
          <p className="text-xs text-gray-500 text-center max-w-xs">
            All interactions make real HTTP calls to the Go backend on port 8888
          </p>
        </div>

        {/* Demo walkthrough guide */}
        <div className="flex-1 min-w-0 space-y-4">
          <div>
            <p className="text-sm text-gray-600">
              Follow these 6 steps to walk through the complete field agent workflow.
            </p>
          </div>

          {DEMO_STEPS.map(({ step, tab, icon, title, desc, color, badge }) => (
            <div
              key={step}
              className={`rounded-xl border p-4 ${color}`}
            >
              <div className="flex items-start gap-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${badge}`}>
                  {step}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-base">{icon}</span>
                    <span className="text-sm font-bold text-gray-900">{title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
                      {tab} tab
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">{desc}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Architecture features */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Production-Grade Architecture</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: "⚖️", label: "Double-Entry Ledger", desc: "8 journal entries per payout, DB trigger enforces balance" },
                { icon: "🔑", label: "Idempotency", desc: "Redis X-Idempotency-Key prevents duplicate payouts" },
                { icon: "🌍", label: "PostGIS Spatial", desc: "ST_Contains for GPS boundary, GIST index on geometry" },
                { icon: "📴", label: "Offline-First", desc: "WatermelonDB SQLite writes locally, delta sync on reconnect" },
                { icon: "🛡️", label: "Anti-Spoofing", desc: "accuracy_m &lt; 1.0 or duplicate photo_hash → SPOOFED" },
                { icon: "📊", label: "50/25/5/20 Law", desc: "Farmer/Platform/Agent/Reserve — Math Lockdown CI gate" },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex gap-2">
                  <span className="text-lg flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500 leading-relaxed" dangerouslySetInnerHTML={{ __html: desc }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Seed IDs */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Seed IDs for GPS Proof Demo
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500">Farmer ID</p>
                <code className="text-xs text-brand-700 font-mono break-all bg-white border border-gray-200 px-2 py-1 rounded block mt-0.5">
                  d457d2ae-2dae-4988-a0cc-fc5eda76cd76
                </code>
              </div>
              <div>
                <p className="text-xs text-gray-500">Plot ID</p>
                <code className="text-xs text-brand-700 font-mono break-all bg-white border border-gray-200 px-2 py-1 rounded block mt-0.5">
                  8d510da6-22f3-43de-a4cc-0e6e87109526
                </code>
              </div>
              <div>
                <p className="text-xs text-gray-500">GPS Coordinates (inside plot boundary)</p>
                <code className="text-xs text-brand-700 font-mono bg-white border border-gray-200 px-2 py-1 rounded block mt-0.5">
                  17.4005°N, 78.4005°E · Accuracy ±4.2m
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
