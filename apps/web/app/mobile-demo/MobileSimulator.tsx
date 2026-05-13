"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  Fragment,
} from "react";
import { formatINR, formatDate } from "@/lib/types";

// ─── API ──────────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8888/api/v1";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(body || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

interface Metrics {
  farmer_count: number;
  plot_count: number;
  transaction_count: number;
  total_disbursed: string;
  total_ndvi_alerts: number;
  total_proof_records: number;
}

interface Farmer {
  id: string;
  name: string;
  phone: string;
  kyc_status: "PENDING" | "VERIFIED" | "REJECTED";
  created_at: string;
}

interface LandPlot {
  id: string;
  farmer_id: string;
  plot_name: string;
  area_acres: string;
  district: string;
  state: string;
}

interface Txn {
  id: string;
  gross_amount: string;
  status: string;
  farmer_id: string;
  description: string;
  created_at: string;
}

interface PlatformEvent {
  id: string;
  type: string;
  subject: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kycColor(s: string) {
  if (s === "VERIFIED") return "bg-emerald-100 text-emerald-800";
  if (s === "REJECTED") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

function statusColor(s: string) {
  if (s === "COMPLETED") return "bg-emerald-100 text-emerald-800";
  if (s === "FAILED" || s === "REVERSED") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

function eventColor(type: string) {
  if (type === "payout.completed") return "border-emerald-500 bg-emerald-50";
  if (type === "proof.verdict") return "border-blue-500 bg-blue-50";
  if (type === "ndvi.alert") return "border-amber-500 bg-amber-50";
  return "border-gray-400 bg-gray-50";
}

function eventIcon(type: string) {
  if (type === "payout.completed") return "💸";
  if (type === "proof.verdict") return "📍";
  if (type === "ndvi.alert") return "🌾";
  if (type === "sync.batch") return "🔄";
  return "📡";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function splitAmount(gross: number) {
  const farmer = (gross * 0.5).toFixed(2);
  const platform = (gross * 0.25).toFixed(2);
  const agent = (gross * 0.05).toFixed(2);
  const reserve = (gross * 0.2).toFixed(2);
  return { farmer, platform, agent, reserve };
}

function uuid7() {
  return "xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhoneStatusBar({ time }: { time: string }) {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-1 text-white text-xs font-semibold" style={{ background: "#16a34a" }}>
      <span>{time}</span>
      <div className="flex items-center gap-1.5">
        <span>●●●</span>
        <span>WiFi</span>
        <span>🔋</span>
      </div>
    </div>
  );
}

function PhoneHeader({
  title,
  subtitle,
  online,
  onRefresh,
}: {
  title: string;
  subtitle?: string;
  online: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div
      className="px-4 py-3 flex items-center justify-between"
      style={{ background: "#16a34a" }}
    >
      <div>
        <h2 className="text-white font-bold text-base leading-tight">{title}</h2>
        {subtitle && <p className="text-green-200 text-xs">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${online ? "bg-green-300 animate-pulse" : "bg-red-400"}`}
        />
        {onRefresh && (
          <button onClick={onRefresh} className="text-white text-xs bg-green-700 rounded px-2 py-0.5">
            ↻
          </button>
        )}
      </div>
    </div>
  );
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────

function HomeScreen({
  online,
  onGoToFarmers,
  onGoToGPS,
  onGoToEvents,
}: {
  online: boolean;
  onGoToFarmers: () => void;
  onGoToGPS: () => void;
  onGoToEvents: () => void;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, t] = await Promise.all([
        apiFetch<Metrics>("/metrics-platform"),
        apiFetch<{ transactions: Txn[] }>("/transactions?limit=5&offset=0"),
      ]);
      setMetrics(m);
      setTxns(t.transactions ?? []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tiles = metrics
    ? [
        { label: "Farmers", value: metrics.farmer_count, icon: "👨‍🌾" },
        { label: "Land Plots", value: metrics.plot_count, icon: "🗺️" },
        { label: "Transactions", value: metrics.transaction_count, icon: "📊" },
        {
          label: "Disbursed",
          value: formatINR(metrics.total_disbursed),
          icon: "💰",
        },
        { label: "NDVI Alerts", value: metrics.total_ndvi_alerts, icon: "🌾" },
        { label: "GPS Proofs", value: metrics.total_proof_records, icon: "📍" },
      ]
    : [];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <PhoneHeader title="Finagra Unity" subtitle="Field Agent Dashboard" online={online} onRefresh={load} />

      <div className="p-3 space-y-3">
        {/* Metrics grid */}
        {loading && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-3 animate-pulse h-16" />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">
            ⚠️ Cannot reach backend: {error}
          </div>
        )}

        {metrics && (
          <div className="grid grid-cols-2 gap-2">
            {tiles.map(({ label, value, icon }) => (
              <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                <div className="text-xl mb-0.5">{icon}</div>
                <div className="text-sm font-bold text-gray-900 truncate">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
            Quick Actions
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Add Farmer", icon: "👨‍🌾", action: onGoToFarmers },
              { label: "GPS Proof", icon: "📍", action: onGoToGPS },
              { label: "Live Events", icon: "📡", action: onGoToEvents },
              { label: "Refresh", icon: "↻", action: load },
            ].map(({ label, icon, action }) => (
              <button
                key={label}
                onClick={action}
                className="flex items-center gap-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-3 py-2 text-xs font-medium text-green-800 transition-colors"
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        {txns.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Recent Payouts
            </p>
            <div className="space-y-2">
              {txns.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
                >
                  <div>
                    <p className="text-xs font-medium text-gray-900">
                      {formatINR(t.gross_amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(t.created_at)}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(t.status)}`}
                  >
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FARMERS SCREEN ──────────────────────────────────────────────────────────

function FarmersScreen({
  online,
  onSelectFarmer,
}: {
  online: boolean;
  onSelectFarmer: (f: Farmer) => void;
}) {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kyc, setKyc] = useState<"PENDING" | "VERIFIED" | "REJECTED">("PENDING");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        changes: { farmers: { created: Farmer[]; updated: Farmer[]; deleted: Farmer[] } };
      }>("/sync/pull?since=0");
      const all = [
        ...(data.changes?.farmers?.created ?? []),
        ...(data.changes?.farmers?.updated ?? []),
      ];
      setFarmers(all);
    } catch {
      setFarmers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = farmers.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.phone.includes(search)
  );

  async function addFarmer() {
    if (!name || !phone) return;
    setSubmitting(true);
    try {
      const localId = uuid7();
      const now = Date.now();
      const resp = await apiFetch<{
        server_ids: { farmers: Record<string, string> };
        stats: { farmers_created: number };
      }>("/sync/push", {
        method: "POST",
        body: JSON.stringify({
          last_pulled_at: 0,
          changes: {
            farmers: {
              created: [
                {
                  id: localId,
                  name,
                  phone: phone.startsWith("+91") ? phone : `+91${phone}`,
                  kyc_status: kyc,
                  updated_at: now,
                },
              ],
              updated: [],
              deleted: [],
            },
            land_plots: { created: [], updated: [], deleted: [] },
          },
        }),
      });
      const serverUUID = resp.server_ids?.farmers?.[localId];
      setToast(`✅ Farmer "${name}" registered! ID: ${(serverUUID ?? "").slice(0, 8)}…`);
      setName("");
      setPhone("");
      setKyc("PENDING");
      setShowAdd(false);
      await load();
    } catch (e: unknown) {
      setToast(`❌ Error: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
      setTimeout(() => setToast(""), 3500);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 relative">
      <PhoneHeader title="Farmers" subtitle={`${farmers.length} registered`} online={online} onRefresh={load} />

      {/* Search */}
      <div className="p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>

      {/* List */}
      <div className="px-3 space-y-2 pb-20">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl h-16 animate-pulse" />
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center text-xs text-gray-400 py-8">
            No farmers found. Tap + to register one.
          </div>
        )}
        {filtered.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelectFarmer(f)}
            className="w-full bg-white rounded-xl shadow-sm border border-gray-100 px-3 py-3 flex items-center gap-3 hover:bg-green-50 transition-colors text-left"
          >
            <div
              className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            >
              {initials(f.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">
                {f.name}
              </p>
              <p className="text-xs text-gray-500">{f.phone}</p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${kycColor(f.kyc_status)}`}
            >
              {f.kyc_status}
            </span>
          </button>
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-green-600 text-white text-2xl shadow-lg hover:bg-green-700 flex items-center justify-center"
      >
        +
      </button>

      {/* Add Farmer sheet */}
      {showAdd && (
        <div className="absolute inset-0 bg-black/40 flex items-end z-10">
          <div className="w-full bg-white rounded-t-2xl p-5 space-y-3 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Register Farmer</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 text-lg">✕</button>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name *"
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-2 rounded-l-lg border border-gray-200 border-r-0">+91</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9999999999 *"
                className="flex-1 px-3 py-2 text-xs rounded-r-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">KYC Status</p>
              <div className="flex gap-2">
                {(["PENDING", "VERIFIED", "REJECTED"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setKyc(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${kyc === s ? kycColor(s) + " border-transparent" : "border-gray-200 text-gray-500"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={addFarmer}
              disabled={submitting || !name || !phone}
              className="w-full py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 hover:bg-green-700 transition-colors"
            >
              {submitting ? "Registering…" : "Register Farmer"}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute top-20 left-3 right-3 bg-gray-900 text-white text-xs rounded-xl px-4 py-3 shadow-xl z-20">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── FARMER DETAIL SCREEN ────────────────────────────────────────────────────

function FarmerDetailScreen({
  farmer,
  online,
  onBack,
}: {
  farmer: Farmer;
  online: boolean;
  onBack: () => void;
}) {
  const [plots, setPlots] = useState<LandPlot[]>([]);
  const [amount, setAmount] = useState("");
  const [showPayout, setShowPayout] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { txnId: string; split: ReturnType<typeof splitAmount> }>(null);
  const [toast, setToast] = useState("");
  const [showAddPlot, setShowAddPlot] = useState(false);

  useEffect(() => {
    apiFetch<{ plots: LandPlot[] }>(`/land-plots?farmer_id=${farmer.id}`)
      .then((d) => setPlots(d.plots ?? []))
      .catch(() => setPlots([]));
  }, [farmer.id]);

  async function submitPayout() {
    const gross = parseFloat(amount);
    if (!gross || gross <= 0) return;
    setSubmitting(true);
    try {
      const iKey = `demo-payout-${uuid7()}`;
      const resp = await apiFetch<{ id: string; status: string }>("/payouts", {
        method: "POST",
        headers: { "X-Idempotency-Key": iKey },
        body: JSON.stringify({
          farmer_id: farmer.id,
          gross_amount: amount,
          currency: "INR",
          description: `Mobile demo payout for ${farmer.name}`,
        }),
      });
      setResult({ txnId: resp.id, split: splitAmount(gross) });
    } catch (e: unknown) {
      setToast(`❌ ${(e as Error).message}`);
      setTimeout(() => setToast(""), 3500);
    } finally {
      setSubmitting(false);
    }
  }

  const gross = parseFloat(amount) || 0;
  const split = gross > 0 ? splitAmount(gross) : null;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 relative">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#16a34a" }}>
        <button onClick={onBack} className="text-white text-lg">‹</button>
        <div className="w-9 h-9 rounded-full bg-green-700 flex items-center justify-center text-white text-xs font-bold">
          {initials(farmer.name)}
        </div>
        <div className="flex-1">
          <p className="text-white font-bold text-sm">{farmer.name}</p>
          <p className="text-green-200 text-xs">{farmer.phone}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kycColor(farmer.kyc_status)}`}>
          {farmer.kyc_status}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Payout button */}
        {farmer.kyc_status === "VERIFIED" && !showPayout && (
          <button
            onClick={() => setShowPayout(true)}
            className="w-full py-3 bg-green-600 text-white text-sm font-bold rounded-xl shadow hover:bg-green-700 transition-colors"
          >
            💸 Create Payout
          </button>
        )}

        {farmer.kyc_status !== "VERIFIED" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            ⚠️ KYC must be VERIFIED before creating payouts
          </div>
        )}

        {/* Payout form */}
        {showPayout && !result && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Create Payout</h3>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Gross Amount (INR)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                placeholder="e.g. 10000"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>

            {split && (
              <div className="bg-green-50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-green-800 mb-2">50/25/5/20 Split Preview</p>
                {[
                  { label: "👨‍🌾 Farmer (50%)", value: split.farmer },
                  { label: "🏢 Platform (25%)", value: split.platform },
                  { label: "🤝 Agent (5%)", value: split.agent },
                  { label: "🏦 Reserve (20%)", value: split.reserve },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-xs text-gray-700">{label}</span>
                    <span className="text-xs font-bold text-green-900">
                      {formatINR(value)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-green-200 pt-1 flex justify-between">
                  <span className="text-xs font-bold text-gray-900">Total</span>
                  <span className="text-xs font-bold text-gray-900">
                    {formatINR(gross)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowPayout(false)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitPayout}
                disabled={submitting || !amount || parseFloat(amount) <= 0}
                className="flex-1 py-2 bg-green-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-green-700"
              >
                {submitting ? "Processing…" : "Confirm Payout"}
              </button>
            </div>
          </div>
        )}

        {/* Payout success */}
        {result && (
          <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4 space-y-3">
            <div className="text-center">
              <div className="text-3xl mb-1">✅</div>
              <p className="text-sm font-bold text-green-800">Payout Completed!</p>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                {result.txnId.slice(0, 18)}…
              </p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 space-y-1">
              {[
                { label: "👨‍🌾 Farmer", value: result.split.farmer },
                { label: "🏢 Platform", value: result.split.platform },
                { label: "🤝 Agent", value: result.split.agent },
                { label: "🏦 Reserve", value: result.split.reserve },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-gray-700">{label}</span>
                  <span className="font-bold text-green-900">{formatINR(value)}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setResult(null); setShowPayout(false); setAmount(""); }}
              className="w-full py-2 border border-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-50"
            >
              New Payout
            </button>
          </div>
        )}

        {/* Land plots */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Land Plots ({plots.length})
            </p>
            <button
              onClick={() => setShowAddPlot(true)}
              className="text-xs text-green-700 font-medium"
            >
              + Add Plot
            </button>
          </div>
          {plots.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No plots registered</p>
          )}
          {plots.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0"
            >
              <span className="text-base">🗺️</span>
              <div>
                <p className="text-xs font-medium text-gray-900">{p.plot_name || "Unnamed Plot"}</p>
                <p className="text-xs text-gray-500">
                  {p.area_acres ? `${parseFloat(p.area_acres).toFixed(2)} acres` : ""}{" "}
                  {p.district ? `· ${p.district}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className="absolute top-20 left-3 right-3 bg-gray-900 text-white text-xs rounded-xl px-4 py-3 shadow-xl z-20">
          {toast}
        </div>
      )}

      {showAddPlot && (
        <AddPlotSheet
          farmerId={farmer.id}
          onClose={() => setShowAddPlot(false)}
          onSuccess={() => {
            setShowAddPlot(false);
            apiFetch<{ plots: LandPlot[] }>(`/land-plots?farmer_id=${farmer.id}`)
              .then((d) => setPlots(d.plots ?? []))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── ADD PLOT SHEET ───────────────────────────────────────────────────────────

function AddPlotSheet({
  farmerId,
  onClose,
  onSuccess,
}: {
  farmerId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [plotName, setPlotName] = useState("");
  const [district, setDistrict] = useState("Rangareddy");
  const [state, setState] = useState("Telangana");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  async function submit() {
    setSubmitting(true);
    try {
      // Use a random offset so each plot has unique non-overlapping coordinates
      const baseLon = 77.0 + Math.random() * 2;
      const baseLat = 15.0 + Math.random() * 3;
      const size = 0.005 + Math.random() * 0.005;
      const geometry = {
        type: "Polygon",
        coordinates: [
          [
            [baseLon, baseLat],
            [baseLon + size, baseLat],
            [baseLon + size, baseLat + size],
            [baseLon, baseLat + size],
            [baseLon, baseLat],
          ],
        ],
      };
      const resp = await apiFetch<{ id: string; area_acres: number }>("/land-plots", {
        method: "POST",
        headers: { "X-Idempotency-Key": `demo-plot-${uuid7()}` },
        body: JSON.stringify({
          farmer_id: farmerId,
          plot_name: plotName || "Demo Plot",
          geometry,
          soil_type: "Black Cotton",
          survey_number: `SV${Math.floor(Math.random() * 9000) + 1000}`,
          district,
          state,
        }),
      });
      setToast(`✅ Plot added! ${resp.area_acres?.toFixed(1) ?? "?"} acres`);
      setTimeout(() => { setToast(""); onSuccess(); }, 1500);
    } catch (e: unknown) {
      setToast(`❌ ${(e as Error).message}`);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/40 flex items-end z-20">
      <div className="w-full bg-white rounded-t-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Add Land Plot</h3>
          <button onClick={onClose} className="text-gray-400 text-lg">✕</button>
        </div>
        <div className="bg-amber-50 rounded-lg p-2 text-xs text-amber-800">
          📍 Random unique coordinates generated per plot to avoid boundary conflicts
        </div>
        <input
          value={plotName}
          onChange={(e) => setPlotName(e.target.value)}
          placeholder="Plot name (optional)"
          className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <input
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          placeholder="District"
          className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <input
          value={state}
          onChange={(e) => setState(e.target.value)}
          placeholder="State"
          className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 hover:bg-green-700"
        >
          {submitting ? "Adding…" : "Add Plot"}
        </button>
        {toast && <p className="text-xs text-red-600">{toast}</p>}
      </div>
    </div>
  );
}

// ─── GPS PROOF SCREEN ────────────────────────────────────────────────────────

function GPSProofScreen({ online }: { online: boolean }) {
  const [step, setStep] = useState<"input" | "acquiring" | "ready" | "submitting" | "result">("input");
  const [farmerId, setFarmerId] = useState("");
  const [plotId, setPlotId] = useState("");
  const [result, setResult] = useState<{ verdict: string; distance: number | null; reason?: string } | null>(null);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const COORDS = { lat: 17.4005, lon: 78.4005, accuracy: 4.2 };

  function acquire() {
    if (!farmerId || !plotId) { setError("Please enter Farmer ID and Plot ID"); return; }
    setError("");
    setStep("acquiring");
    timerRef.current = setTimeout(() => setStep("ready"), 2000);
  }

  async function submit() {
    setStep("submitting");
    try {
      const hash = `mobile_demo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const resp = await apiFetch<{
        verdict: string;
        distance_to_boundary_m: number | null;
        spoof_reason?: string;
      }>("/proof-of-action", {
        method: "POST",
        body: JSON.stringify({
          farmer_id: farmerId,
          plot_id: plotId,
          longitude: COORDS.lon,
          latitude: COORDS.lat,
          accuracy_m: COORDS.accuracy,
          photo_hash: hash,
          submitted_at: new Date().toISOString(),
        }),
      });
      setResult({
        verdict: resp.verdict,
        distance: resp.distance_to_boundary_m,
        reason: resp.spoof_reason,
      });
      setStep("result");
    } catch (e: unknown) {
      setResult({ verdict: "ERROR", distance: null, reason: (e as Error).message });
      setStep("result");
    }
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <PhoneHeader title="GPS Proof" subtitle="Anti-spoofing field verification" online={online} />
      <div className="p-4 space-y-4">
        {step === "input" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
              <input
                value={farmerId}
                onChange={(e) => setFarmerId(e.target.value)}
                placeholder="Farmer ID (UUID)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400 font-mono"
              />
              <input
                value={plotId}
                onChange={(e) => setPlotId(e.target.value)}
                placeholder="Plot ID (UUID)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400 font-mono"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">📍 Demo GPS Coordinates</p>
              <p>Latitude: 17.4005°N</p>
              <p>Longitude: 78.4005°E</p>
              <p>Accuracy: ±4.2m</p>
              <p className="text-blue-600 mt-1">This point is inside the seed plot polygon</p>
            </div>

            <button
              onClick={acquire}
              className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 text-sm"
            >
              📡 Acquire GPS Signal
            </button>
          </>
        )}

        {step === "acquiring" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-green-200 animate-ping absolute inset-0" />
              <div className="w-24 h-24 rounded-full border-4 border-green-400 animate-pulse absolute inset-0" />
              <div className="w-24 h-24 rounded-full bg-green-50 border-4 border-green-600 flex items-center justify-center text-3xl">
                📍
              </div>
            </div>
            <p className="text-sm font-semibold text-gray-700">Acquiring GPS signal…</p>
            <p className="text-xs text-gray-500">Searching for satellites</p>
          </div>
        )}

        {step === "ready" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-semibold text-green-800">GPS Signal Acquired</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { k: "Latitude", v: `${COORDS.lat}°N` },
                  { k: "Longitude", v: `${COORDS.lon}°E` },
                  { k: "Accuracy", v: `±${COORDS.accuracy}m` },
                  { k: "Status", v: "✅ Valid" },
                ].map(({ k, v }) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-500 text-xs">{k}</p>
                    <p className="font-semibold text-gray-900 text-xs">{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={submit}
              className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 text-sm"
            >
              Submit Proof of Action
            </button>
          </>
        )}

        {step === "submitting" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
            <p className="text-sm font-semibold text-gray-700">Verifying on-chain…</p>
            <p className="text-xs text-gray-500">Checking GPS boundary with PostGIS</p>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-3">
            <div
              className={`rounded-xl p-5 text-center border-2 ${
                result.verdict === "VERIFIED"
                  ? "bg-emerald-50 border-emerald-400"
                  : result.verdict === "SPOOFED"
                  ? "bg-red-50 border-red-400"
                  : "bg-gray-50 border-gray-300"
              }`}
            >
              <div className="text-4xl mb-2">
                {result.verdict === "VERIFIED" ? "✅" : result.verdict === "SPOOFED" ? "🚨" : "⚠️"}
              </div>
              <p
                className={`text-lg font-black ${
                  result.verdict === "VERIFIED"
                    ? "text-emerald-800"
                    : result.verdict === "SPOOFED"
                    ? "text-red-800"
                    : "text-gray-700"
                }`}
              >
                {result.verdict}
              </p>
              {result.distance != null && (
                <p className="text-xs text-gray-600 mt-1">
                  {result.distance.toFixed(1)}m from boundary
                </p>
              )}
              {result.reason && (
                <p className="text-xs text-red-600 mt-1">{result.reason}</p>
              )}
            </div>
            <button
              onClick={() => { setStep("input"); setResult(null); setFarmerId(""); setPlotId(""); }}
              className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50"
            >
              New Proof
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EVENTS SCREEN ────────────────────────────────────────────────────────────

function EventsScreen({ online }: { online: boolean }) {
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [connStatus, setConnStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    setConnStatus("connecting");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const resp = await fetch("http://localhost:8888/api/v1/events/stream", {
        signal: ctrl.signal,
        headers: { Accept: "text/event-stream" },
      });
      if (!resp.body) { setConnStatus("disconnected"); return; }
      setConnStatus("connected");
      const reader = resp.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        let dataLine = "";
        for (const line of lines) {
          if (line.startsWith("data:")) {
            dataLine = line.slice(5).trim();
          } else if (line === "" && dataLine) {
            try {
              const ev = JSON.parse(dataLine) as PlatformEvent;
              if (ev.type !== "connected") {
                setEvents((prev) => [ev, ...prev].slice(0, 30));
              }
            } catch {}
            dataLine = "";
          }
        }
      }
      setConnStatus("disconnected");
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setConnStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    connect();
    return () => { abortRef.current?.abort(); };
  }, [connect]);

  const statusBadge = {
    connecting: "bg-amber-100 text-amber-800",
    connected: "bg-emerald-100 text-emerald-800",
    disconnected: "bg-red-100 text-red-800",
  }[connStatus];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <PhoneHeader title="Live Events" subtitle="NATS → SSE real-time stream" online={online} />
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge}`}>
            {connStatus === "connecting" && "● Connecting…"}
            {connStatus === "connected" && "● Live"}
            {connStatus === "disconnected" && "● Disconnected"}
          </span>
          <button
            onClick={connect}
            className="text-xs text-green-700 font-medium bg-green-50 px-2 py-1 rounded-lg"
          >
            ↻ Reconnect
          </button>
        </div>

        {events.length === 0 && (
          <div className="bg-white rounded-xl p-6 text-center text-xs text-gray-400 shadow-sm border border-gray-100">
            {connStatus === "connected"
              ? "Waiting for events… Try creating a payout or submitting a GPS proof."
              : "Not connected to event stream."}
          </div>
        )}

        {events.map((ev, i) => (
          <div
            key={ev.id ?? i}
            className={`bg-white rounded-xl border-l-4 shadow-sm p-3 ${eventColor(ev.type)}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">{eventIcon(ev.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">{ev.type}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                  {ev.subject}
                </p>
                {ev.payload && typeof ev.payload === "object" && (
                  <div className="mt-1 space-y-0.5">
                    {(ev.payload as Record<string, unknown>).gross_amount && (
                      <p className="text-xs text-gray-700">
                        Amount: {formatINR(String((ev.payload as Record<string, unknown>).gross_amount))}
                      </p>
                    )}
                    {(ev.payload as Record<string, unknown>).verdict && (
                      <p className="text-xs text-gray-700">
                        Verdict: <span className="font-semibold">{String((ev.payload as Record<string, unknown>).verdict)}</span>
                      </p>
                    )}
                    {(ev.payload as Record<string, unknown>).ndvi_mean && (
                      <p className="text-xs text-gray-700">
                        NDVI: {String((ev.payload as Record<string, unknown>).ndvi_mean)}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {ev.occurred_at ? formatDate(ev.occurred_at) : ""}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SYNC SCREEN ─────────────────────────────────────────────────────────────

interface HealthData {
  status: string;
  checks: { postgres?: string; redis?: string; nats?: string };
}

function SyncScreen({ online }: { online: boolean }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    fetch("http://localhost:8888/health/ready")
      .then((r) => r.json())
      .then((h: HealthData) => setHealth(h))
      .catch(() => setHealth(null));
  }, []);

  async function sync() {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 1500));
    setSyncing(false);
    setLastSync(new Date());
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <PhoneHeader title="Sync & Offline" subtitle="WatermelonDB offline-first" online={online} />
      <div className="p-3 space-y-3">
        {/* Health status */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Backend Health
          </p>
          {health ? (
            <div className="space-y-1.5">
              {[
                { label: "API Server", value: health.status },
                { label: "PostgreSQL", value: health.checks?.postgres ?? "unknown" },
                { label: "Redis", value: health.checks?.redis ?? "unknown" },
                { label: "NATS", value: health.checks?.nats ?? "N/A" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      value === "ok" || value === "ready" || value === "N/A"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {value === "N/A" ? "N/A" : value === "ok" || value === "ready" ? "✅ OK" : `⚠️ ${value}`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-red-600">⚠️ Cannot reach backend at :8888</p>
          )}
        </div>

        {/* Sync button */}
        <button
          onClick={sync}
          disabled={syncing}
          className="w-full py-3 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 hover:bg-green-700 flex items-center justify-center gap-2 text-sm"
        >
          <span className={syncing ? "animate-spin" : ""}>↻</span>
          {syncing ? "Syncing…" : "Sync Now"}
        </button>

        {lastSync && (
          <p className="text-center text-xs text-gray-500">
            Last synced: {lastSync.toLocaleTimeString("en-IN")}
          </p>
        )}

        {/* Offline explainer */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Offline-First Architecture
          </p>
          <div className="space-y-2">
            {[
              { icon: "📱", title: "Write Locally First", desc: "All data writes go to local SQLite (WatermelonDB) instantly — no network needed" },
              { icon: "📤", title: "Push Changes", desc: "POST /sync/push sends local mutations to server with conflict resolution" },
              { icon: "📥", title: "Pull Delta", desc: "GET /sync/pull?since=<ts> fetches only records changed since last sync" },
              { icon: "🏆", title: "Server Wins", desc: "last_synced_at timestamp wins on conflict — financial records are immutable" },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
                <div>
                  <p className="text-xs font-semibold text-gray-900">{title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tech stack */}
        <div className="bg-green-50 rounded-xl border border-green-100 p-3">
          <p className="text-xs font-semibold text-green-800 mb-2">Tech Stack</p>
          <div className="flex flex-wrap gap-1">
            {["WatermelonDB", "SQLite/JSI", "React Native 0.76", "Delta Sync", "NATS Events", "PostGIS"].map(
              (tag) => (
                <span key={tag} className="text-xs bg-white border border-green-200 text-green-800 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────

type Tab = "home" | "farmers" | "gps" | "events" | "sync";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "farmers", icon: "👨‍🌾", label: "Farmers" },
    { id: "gps", icon: "📍", label: "GPS" },
    { id: "events", icon: "📡", label: "Events" },
    { id: "sync", icon: "🔄", label: "Sync" },
  ];
  return (
    <div className="border-t border-gray-100 bg-white flex items-center justify-around py-2 px-1">
      {tabs.map(({ id, icon, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
            active === id ? "text-green-700" : "text-gray-400"
          }`}
        >
          <span className="text-base">{icon}</span>
          <span
            className={`text-xs font-medium ${active === id ? "text-green-700" : "text-gray-400"}`}
          >
            {label}
          </span>
          {active === id && (
            <span className="w-1 h-1 rounded-full bg-green-600" />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── MAIN SIMULATOR ───────────────────────────────────────────────────────────

export function MobileSimulator() {
  const [tab, setTab] = useState<Tab>("home");
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [online, setOnline] = useState(true);
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () =>
      setTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("http://localhost:8888/health/live")
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  function navigateTo(t: Tab) {
    setSelectedFarmer(null);
    setTab(t);
  }

  function handleFarmerSelect(f: Farmer) {
    setSelectedFarmer(f);
  }

  function handleBackFromDetail() {
    setSelectedFarmer(null);
  }

  return (
    <div className="relative" style={{ width: 393, height: 852 }}>
      {/* Phone hardware chrome */}
      <div
        className="absolute inset-0 rounded-[47px] shadow-2xl"
        style={{
          background: "#1a1a1a",
          boxShadow:
            "0 0 0 2px #3a3a3a, 0 0 0 4px #2a2a2a, 0 25px 60px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.3)",
        }}
      />

      {/* Screen area */}
      <div
        className="absolute overflow-hidden bg-gray-50 flex flex-col"
        style={{
          inset: "12px",
          borderRadius: "38px",
        }}
      >
        {/* Dynamic Island */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-black rounded-full"
          style={{ width: 126, height: 36 }}
        />

        {/* Status bar (below island) */}
        <div style={{ paddingTop: 48 }}>
          <PhoneStatusBar time={time} />
        </div>

        {/* Screen content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {tab === "home" && (
            <HomeScreen
              online={online}
              onGoToFarmers={() => navigateTo("farmers")}
              onGoToGPS={() => navigateTo("gps")}
              onGoToEvents={() => navigateTo("events")}
            />
          )}
          {tab === "farmers" &&
            (selectedFarmer ? (
              <FarmerDetailScreen
                farmer={selectedFarmer}
                online={online}
                onBack={handleBackFromDetail}
              />
            ) : (
              <FarmersScreen online={online} onSelectFarmer={handleFarmerSelect} />
            ))}
          {tab === "gps" && <GPSProofScreen online={online} />}
          {tab === "events" && <EventsScreen online={online} />}
          {tab === "sync" && <SyncScreen online={online} />}
        </div>

        {/* Tab bar */}
        <TabBar
          active={tab}
          onChange={(t) => {
            setSelectedFarmer(null);
            setTab(t);
          }}
        />

        {/* Home indicator */}
        <div className="flex justify-center pb-2 pt-1 bg-white">
          <div className="w-28 h-1 bg-gray-300 rounded-full" />
        </div>
      </div>

      {/* Side buttons */}
      <div
        className="absolute rounded-r-sm bg-gray-600"
        style={{ right: -3, top: 160, width: 4, height: 32 }}
      />
      <div
        className="absolute rounded-l-sm bg-gray-600"
        style={{ left: -3, top: 120, width: 4, height: 28 }}
      />
      <div
        className="absolute rounded-l-sm bg-gray-600"
        style={{ left: -3, top: 168, width: 4, height: 52 }}
      />
      <div
        className="absolute rounded-l-sm bg-gray-600"
        style={{ left: -3, top: 230, width: 4, height: 52 }}
      />
    </div>
  );
}
