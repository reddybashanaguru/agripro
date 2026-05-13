"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
    let msg = body;
    try { msg = JSON.parse(body).message ?? body; } catch {}
    throw new Error(msg || `HTTP ${r.status}`);
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
  created_at: number;
}

interface LandPlot {
  id: string;
  farmer_id: string;
  plot_name: string;
  area_acres: number | string;
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
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
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

function relativeTime(isoOrMs: string | number): string {
  const ms = typeof isoOrMs === "number" ? isoOrMs : new Date(isoOrMs).getTime();
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return formatDate(typeof isoOrMs === "number" ? new Date(isoOrMs).toISOString() : isoOrMs);
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function PhoneStatusBar({ time }: { time: string }) {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-1 text-white text-xs font-semibold" style={{ background: "#16a34a" }}>
      <span>{time}</span>
      <div className="flex items-center gap-1.5"><span>●●●</span><span>WiFi</span><span>🔋</span></div>
    </div>
  );
}

function PhoneHeader({ title, subtitle, online, onRefresh }: {
  title: string; subtitle?: string; online: boolean; onRefresh?: () => void;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#16a34a" }}>
      <div>
        <h2 className="text-white font-bold text-base leading-tight">{title}</h2>
        {subtitle && <p className="text-green-200 text-xs">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${online ? "bg-green-300 animate-pulse" : "bg-red-400"}`} />
        {onRefresh && (
          <button onClick={onRefresh} className="text-white text-xs bg-green-700 rounded px-2 py-0.5">↻</button>
        )}
      </div>
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  const isError = msg.startsWith("❌");
  return (
    <div className={`absolute top-20 left-3 right-3 text-white text-xs rounded-xl px-4 py-3 shadow-xl z-30 ${isError ? "bg-red-700" : "bg-gray-900"}`}>
      {msg}
    </div>
  );
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────

function HomeScreen({ online, onGoToFarmers, onGoToGPS, onGoToEvents, onAddFarmer }: {
  online: boolean;
  onGoToFarmers: () => void;
  onGoToGPS: () => void;
  onGoToEvents: () => void;
  onAddFarmer: () => void;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
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

  const tiles = metrics ? [
    { label: "Farmers", value: metrics.farmer_count.toLocaleString(), icon: "👨‍🌾", color: "text-green-700" },
    { label: "Land Plots", value: metrics.plot_count.toLocaleString(), icon: "🗺️", color: "text-blue-700" },
    { label: "Transactions", value: metrics.transaction_count.toLocaleString(), icon: "📊", color: "text-purple-700" },
    { label: "Disbursed", value: formatINR(metrics.total_disbursed), icon: "💰", color: "text-emerald-700" },
    { label: "NDVI Alerts", value: metrics.total_ndvi_alerts.toLocaleString(), icon: "🌾", color: "text-amber-700" },
    { label: "GPS Proofs", value: metrics.total_proof_records.toLocaleString(), icon: "📍", color: "text-rose-700" },
  ] : [];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <PhoneHeader title="Finagra Unity" subtitle="Field Agent Dashboard" online={online} onRefresh={load} />
      <div className="p-3 space-y-3">

        {loading && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-3 animate-pulse h-16" />
            ))}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">
            ⚠️ Cannot reach backend — make sure the Go server is running on :8888
          </div>
        )}

        {metrics && (
          <div className="grid grid-cols-2 gap-2">
            {tiles.map(({ label, value, icon, color }) => (
              <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                <div className="text-lg mb-0.5">{icon}</div>
                <div className={`text-sm font-bold truncate ${color}`}>{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Register Farmer", icon: "👨‍🌾", action: onAddFarmer, color: "bg-green-50 border-green-200 text-green-800 hover:bg-green-100" },
              { label: "Submit GPS Proof", icon: "📍", action: onGoToGPS, color: "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100" },
              { label: "Live Events", icon: "📡", action: onGoToEvents, color: "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100" },
              { label: "View Farmers", icon: "📋", action: onGoToFarmers, color: "bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100" },
            ].map(({ label, icon, action, color }) => (
              <button key={label} onClick={action}
                className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-xs font-medium transition-colors ${color}`}>
                <span>{icon}</span>{label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent payouts */}
        {txns.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Recent Payouts</p>
            <div className="space-y-0">
              {txns.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{formatINR(t.gross_amount)}</p>
                    <p className="text-xs text-gray-400">{relativeTime(t.created_at)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(t.status)}`}>
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

function FarmersScreen({ online, onSelectFarmer, openAddSheet }: {
  online: boolean;
  onSelectFarmer: (f: Farmer) => void;
  openAddSheet: boolean;
}) {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(openAddSheet);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successFarmer, setSuccessFarmer] = useState<{ name: string; id: string; obj: Farmer } | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        changes: { farmers: { created: Farmer[]; updated: Farmer[] } };
      }>("/sync/pull?since=0");
      const all = [
        ...(data.changes?.farmers?.created ?? []),
        ...(data.changes?.farmers?.updated ?? []),
      ].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      setFarmers(all);
    } catch {
      setFarmers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (openAddSheet) setShowAdd(true); }, [openAddSheet]);

  const filtered = farmers.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) || f.phone.includes(search)
  );

  function validatePhone(v: string) {
    const digits = v.replace(/\D/g, "");
    if (digits.length !== 10) { setPhoneErr("Enter 10-digit mobile number"); return false; }
    setPhoneErr(""); return true;
  }

  async function addFarmer() {
    if (!name.trim()) { setToast("❌ Name is required"); setTimeout(() => setToast(""), 2500); return; }
    if (!validatePhone(phone)) return;
    setSubmitting(true);
    try {
      const localId = uuid7();
      const now = Date.now();
      const fullPhone = "+91" + phone.replace(/\D/g, "");
      const resp = await apiFetch<{
        server_ids: { farmers: Record<string, string> };
        stats: { farmers_created: number };
      }>("/sync/push", {
        method: "POST",
        body: JSON.stringify({
          last_pulled_at: 0,
          changes: {
            farmers: {
              created: [{ id: localId, name: name.trim(), phone: fullPhone, kyc_status: "PENDING", updated_at: now }],
              updated: [], deleted: [],
            },
            land_plots: { created: [], updated: [], deleted: [] },
          },
        }),
      });
      const serverUUID = resp.server_ids?.farmers?.[localId] ?? localId;
      const newFarmer: Farmer = { id: serverUUID, name: name.trim(), phone: fullPhone, kyc_status: "PENDING", created_at: now };
      setSuccessFarmer({ name: name.trim(), id: serverUUID, obj: newFarmer });
      setName(""); setPhone(""); setShowAdd(false);
      await load();
    } catch (e: unknown) {
      setToast(`❌ ${(e as Error).message}`);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 relative">
      <PhoneHeader title="Farmers" subtitle={`${farmers.length} registered`} online={online} onRefresh={load} />

      <div className="p-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
      </div>

      <div className="px-3 space-y-2 pb-20">
        {loading && [1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl h-16 animate-pulse" />
        ))}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-10">
            <p className="text-2xl mb-2">👨‍🌾</p>
            <p className="text-xs font-medium text-gray-700">{search ? "No matches" : "No farmers yet"}</p>
            <p className="text-xs text-gray-400 mt-1">{search ? "Try a different search" : "Tap + to register the first farmer"}</p>
          </div>
        )}
        {filtered.map((f) => (
          <button key={f.id} onClick={() => onSelectFarmer(f)}
            className="w-full bg-white rounded-xl shadow-sm border border-gray-100 px-3 py-3 flex items-center gap-3 hover:bg-green-50 active:scale-[0.99] transition-all text-left">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${f.kyc_status === "VERIFIED" ? "bg-green-600" : f.kyc_status === "REJECTED" ? "bg-red-500" : "bg-amber-500"}`}>
              {initials(f.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{f.name}</p>
              <p className="text-xs text-gray-400">{f.phone} · {relativeTime(f.created_at)}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${kycColor(f.kyc_status)}`}>
              {f.kyc_status}
            </span>
          </button>
        ))}
      </div>

      <button onClick={() => setShowAdd(true)}
        className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-green-600 text-white text-2xl shadow-lg hover:bg-green-700 active:scale-95 flex items-center justify-center transition-transform">
        +
      </button>

      {/* Success state — offer to view the newly created farmer */}
      {successFarmer && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 p-6">
          <div className="bg-white rounded-2xl p-5 w-full space-y-3 shadow-2xl">
            <div className="text-center space-y-1">
              <div className="text-4xl">🎉</div>
              <p className="text-sm font-bold text-gray-900">Farmer Registered!</p>
              <p className="text-xs text-gray-600">{successFarmer.name}</p>
              <p className="text-xs text-gray-400 font-mono">{successFarmer.id.slice(0, 18)}…</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
              <p className="font-semibold mb-1">⚠️ KYC Status: PENDING</p>
              <p>Tap "Verify KYC" to complete verification and unlock payouts and plot registration.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSuccessFarmer(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 text-xs rounded-xl hover:bg-gray-50">
                Later
              </button>
              <button onClick={() => { onSelectFarmer(successFarmer.obj); setSuccessFarmer(null); }}
                className="flex-1 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700">
                Verify KYC →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Farmer sheet */}
      {showAdd && (
        <div className="absolute inset-0 bg-black/40 flex items-end z-10">
          <div className="w-full bg-white rounded-t-2xl p-5 space-y-3">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-1" />
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Register Farmer</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Full Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Suresh Reddy"
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Mobile Number *</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-600 bg-gray-100 px-2 py-2 rounded-l-lg border border-gray-200 border-r-0">+91</span>
                <input value={phone} onChange={(e) => { setPhone(e.target.value); if (phoneErr) validatePhone(e.target.value); }}
                  placeholder="9999999999"
                  maxLength={10}
                  className={`flex-1 px-3 py-2 text-xs rounded-r-lg border focus:outline-none focus:ring-2 focus:ring-green-400 ${phoneErr ? "border-red-300" : "border-gray-200"}`} />
              </div>
              {phoneErr && <p className="text-xs text-red-500 mt-1">{phoneErr}</p>}
            </div>
            <div className="bg-blue-50 rounded-lg p-2.5 text-xs text-blue-800">
              ℹ️ Farmer will be registered with <strong>PENDING</strong> KYC. You can verify it on the next screen.
            </div>
            <button onClick={addFarmer} disabled={submitting || !name || !phone}
              className="w-full py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 hover:bg-green-700 transition-colors">
              {submitting ? "Registering…" : "Register Farmer"}
            </button>
          </div>
        </div>
      )}

      <Toast msg={toast} />
    </div>
  );
}

// ─── KYC WIZARD ──────────────────────────────────────────────────────────────

function KYCWizard({ farmer, onVerified, onClose }: {
  farmer: Farmer;
  onVerified: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"form" | "verifying" | "done">("form");
  const [aadhaar, setAadhaar] = useState("");
  const [consent, setConsent] = useState(false);
  const [aadhaarErr, setAadhaarErr] = useState("");
  const [verifyStep, setVerifyStep] = useState(0);

  const verifySteps = [
    "Validating Aadhaar UID…",
    "Matching name with UIDAI records…",
    "Face liveness check…",
    "Approving KYC status…",
  ];

  async function startVerification() {
    if (aadhaar.replace(/\D/g, "").length !== 4) {
      setAadhaarErr("Enter last 4 digits of Aadhaar"); return;
    }
    if (!consent) { setAadhaarErr("Please confirm consent to proceed"); return; }
    setStep("verifying");
    setVerifyStep(0);

    for (let i = 0; i < verifySteps.length; i++) {
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
      setVerifyStep(i + 1);
    }

    try {
      const now = Date.now();
      await apiFetch("/sync/push", {
        method: "POST",
        body: JSON.stringify({
          last_pulled_at: 0,
          changes: {
            farmers: {
              created: [],
              updated: [{ server_id: farmer.id, name: farmer.name, kyc_status: "VERIFIED", updated_at: now }],
              deleted: [],
            },
            land_plots: { created: [], updated: [], deleted: [] },
          },
        }),
      });
      setStep("done");
    } catch {
      setStep("form");
    }
  }

  return (
    <div className="absolute inset-0 bg-black/50 flex items-end z-30">
      <div className="w-full bg-white rounded-t-2xl shadow-2xl">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1" />

        {step === "form" && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">KYC Verification</h3>
                <p className="text-xs text-gray-500 mt-0.5">{farmer.name}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-xl">🪪</div>
              <div>
                <p className="text-xs font-semibold text-gray-900">Aadhaar-based eKYC</p>
                <p className="text-xs text-gray-500">Verified via UIDAI · Secure · Instant</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">Last 4 digits of Aadhaar *</label>
              <input
                value={aadhaar}
                onChange={(e) => { setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 4)); setAadhaarErr(""); }}
                placeholder="e.g. 5678"
                maxLength={4}
                className={`w-full px-4 py-3 text-lg tracking-widest text-center rounded-xl border-2 font-mono focus:outline-none focus:ring-0 ${aadhaarErr ? "border-red-300" : "border-gray-200 focus:border-green-500"}`}
              />
              {aadhaarErr && <p className="text-xs text-red-500 mt-1">{aadhaarErr}</p>}
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 accent-green-600 flex-shrink-0" />
              <span className="text-xs text-gray-600 leading-relaxed">
                I consent to sharing my Aadhaar details with Finagra for eKYC verification as per UIDAI guidelines.
              </span>
            </label>

            <button onClick={startVerification}
              disabled={aadhaar.length !== 4 || !consent}
              className="w-full py-3 bg-green-600 text-white text-sm font-bold rounded-xl disabled:opacity-40 hover:bg-green-700 transition-colors">
              Verify Identity →
            </button>
          </div>
        )}

        {step === "verifying" && (
          <div className="p-6 space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 border-4 border-green-100 border-t-green-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-900">Verifying Identity</p>
              <p className="text-xs text-gray-500 mt-1">{verifySteps[Math.min(verifyStep, verifySteps.length - 1)]}</p>
            </div>
            <div className="space-y-2.5">
              {verifySteps.map((s, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${i < verifyStep ? "bg-green-500 text-white" : i === verifyStep ? "border-2 border-green-500 animate-pulse" : "border-2 border-gray-200"}`}>
                    {i < verifyStep ? "✓" : i === verifyStep ? "" : ""}
                  </div>
                  <p className={`text-xs ${i < verifyStep ? "text-green-700 font-medium" : i === verifyStep ? "text-gray-900 font-medium" : "text-gray-400"}`}>{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="text-5xl">✅</div>
              <p className="text-base font-black text-green-800">KYC Verified!</p>
              <p className="text-xs text-gray-600">{farmer.name} is now fully verified</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 space-y-1 text-xs">
              {[
                { label: "Aadhaar UID", value: `XXXX XXXX ${aadhaar}` },
                { label: "Status", value: "VERIFIED ✓" },
                { label: "Verified via", value: "UIDAI eKYC" },
                { label: "Valid till", value: "Permanent" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-semibold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
            <button onClick={() => { onVerified(); onClose(); }}
              className="w-full py-3 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700">
              Continue →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FARMER DETAIL SCREEN ────────────────────────────────────────────────────

function FarmerDetailScreen({ farmer: initialFarmer, online, onBack }: {
  farmer: Farmer; online: boolean; onBack: () => void;
}) {
  const [farmer, setFarmer] = useState(initialFarmer);
  const [plots, setPlots] = useState<LandPlot[]>([]);
  const [plotsLoading, setPlotsLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [showPayout, setShowPayout] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showKYC, setShowKYC] = useState(false);
  const [showAddPlot, setShowAddPlot] = useState(false);
  const [result, setResult] = useState<null | { txnId: string; gross: number; split: ReturnType<typeof splitAmount> }>(null);
  const [toast, setToast] = useState("");

  const loadPlots = useCallback(() => {
    setPlotsLoading(true);
    apiFetch<{ plots: LandPlot[] }>(`/land-plots?farmer_id=${farmer.id}`)
      .then((d) => setPlots(d.plots ?? []))
      .catch(() => setPlots([]))
      .finally(() => setPlotsLoading(false));
  }, [farmer.id]);

  useEffect(() => { loadPlots(); }, [loadPlots]);

  async function submitPayout() {
    const gross = parseFloat(amount);
    if (!gross || gross <= 0) return;
    setSubmitting(true);
    try {
      const resp = await apiFetch<{ id: string; status: string }>("/payouts", {
        method: "POST",
        headers: { "X-Idempotency-Key": `demo-payout-${uuid7()}` },
        body: JSON.stringify({ farmer_id: farmer.id, gross_amount: amount, currency: "INR", description: `Field agent payout — ${farmer.name}` }),
      });
      setResult({ txnId: resp.id, gross, split: splitAmount(gross) });
    } catch (e: unknown) {
      setToast(`❌ ${(e as Error).message}`);
      setTimeout(() => setToast(""), 3500);
    } finally {
      setSubmitting(false);
    }
  }

  const gross = parseFloat(amount) || 0;
  const split = gross > 0 ? splitAmount(gross) : null;
  const isVerified = farmer.kyc_status === "VERIFIED";

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 relative">
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#16a34a" }}>
        <button onClick={onBack} className="text-white text-lg font-light">‹</button>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${isVerified ? "bg-green-700" : "bg-amber-600"}`}>
          {initials(farmer.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{farmer.name}</p>
          <p className="text-green-200 text-xs">{farmer.phone}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${kycColor(farmer.kyc_status)}`}>
          {farmer.kyc_status}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* KYC not verified */}
        {!isVerified && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">⚠️</span>
                <p className="text-xs font-bold text-amber-900">KYC Verification Required</p>
              </div>
              <p className="text-xs text-amber-700 mb-3">
                Complete Aadhaar-based eKYC to unlock plot registration and payouts.
              </p>
              <button onClick={() => setShowKYC(true)}
                className="w-full py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 flex items-center justify-center gap-2">
                <span>🪪</span> Start KYC Verification
              </button>
            </div>
            <div className="bg-amber-100 px-3 py-1.5 flex items-center gap-2">
              {["📄 Document Check", "🤳 Face Match", "✅ Instant Approval"].map((s) => (
                <span key={s} className="text-xs text-amber-700">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Payout trigger */}
        {isVerified && !showPayout && !result && (
          <button onClick={() => setShowPayout(true)}
            className="w-full py-3 bg-green-600 text-white text-sm font-bold rounded-xl shadow hover:bg-green-700 flex items-center justify-center gap-2">
            <span>💸</span> Create Payout
          </button>
        )}

        {/* Payout form */}
        {showPayout && !result && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Create Payout</h3>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Gross Amount</label>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-green-400">
                <span className="px-3 py-2 bg-gray-50 text-xs text-gray-500 border-r border-gray-200">₹</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number"
                  placeholder="10000" className="flex-1 px-3 py-2 text-sm focus:outline-none" />
                <span className="px-3 py-2 bg-gray-50 text-xs text-gray-500 border-l border-gray-200">INR</span>
              </div>
            </div>
            {split && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 space-y-2 border border-green-100">
                <p className="text-xs font-bold text-green-800">Live Split Preview</p>
                {[
                  { label: "👨‍🌾 Farmer", pct: "50%", value: split.farmer, highlight: true },
                  { label: "🏢 Platform", pct: "25%", value: split.platform, highlight: false },
                  { label: "🤝 Agent", pct: "5%", value: split.agent, highlight: false },
                  { label: "🏦 Reserve", pct: "20%", value: split.reserve, highlight: false },
                ].map(({ label, pct, value, highlight }) => (
                  <div key={label} className={`flex items-center justify-between ${highlight ? "bg-white rounded-lg px-2 py-1" : ""}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-600">{label}</span>
                      <span className="text-xs text-gray-400">{pct}</span>
                    </div>
                    <span className={`text-xs font-bold ${highlight ? "text-green-700" : "text-gray-700"}`}>{formatINR(value)}</span>
                  </div>
                ))}
                <div className="border-t border-green-200 pt-1.5 flex justify-between">
                  <span className="text-xs font-bold text-gray-900">Total</span>
                  <span className="text-xs font-bold text-gray-900">{formatINR(gross)}</span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowPayout(false); setAmount(""); }}
                className="flex-1 py-2 border border-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={submitPayout}
                disabled={submitting || !amount || parseFloat(amount) <= 0}
                className="flex-1 py-2 bg-green-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-green-700">
                {submitting ? "Processing…" : "Confirm Payout"}
              </button>
            </div>
          </div>
        )}

        {/* Payout receipt */}
        {result && (
          <div className="bg-white rounded-xl border-2 border-green-200 shadow-sm overflow-hidden">
            <div className="bg-green-600 py-4 text-center">
              <div className="text-3xl mb-1">💸</div>
              <p className="text-white font-black text-base">Payout Successful!</p>
              <p className="text-green-200 text-xs mt-0.5">{new Date().toLocaleTimeString("en-IN")} · COMPLETED</p>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-dashed border-gray-200">
                <span className="text-xs text-gray-500">Gross Amount</span>
                <span className="text-sm font-black text-gray-900">{formatINR(result.gross)}</span>
              </div>
              {[
                { label: "👨‍🌾 Farmer receives", value: result.split.farmer, color: "text-green-700" },
                { label: "🏢 Platform fee", value: result.split.platform, color: "text-gray-700" },
                { label: "🤝 Agent commission", value: result.split.agent, color: "text-gray-700" },
                { label: "🏦 Reserve fund", value: result.split.reserve, color: "text-gray-700" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className={`text-xs font-semibold ${color}`}>{formatINR(value)}</span>
                </div>
              ))}
              <p className="text-xs text-gray-400 font-mono text-center pt-1">txn: {result.txnId.slice(0, 8)}…</p>
            </div>
            <div className="px-4 pb-4">
              <button onClick={() => { setResult(null); setShowPayout(false); setAmount(""); }}
                className="w-full py-2 border border-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-50">
                New Payout
              </button>
            </div>
          </div>
        )}

        {/* Land plots */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Land Plots ({plotsLoading ? "…" : plots.length})
            </p>
            {isVerified ? (
              <button onClick={() => setShowAddPlot(true)} className="text-xs text-green-700 font-medium">
                + Add Plot
              </button>
            ) : (
              <span className="text-xs text-gray-400">🔒 KYC required</span>
            )}
          </div>
          {plotsLoading && <div className="h-8 bg-gray-100 rounded animate-pulse" />}
          {!plotsLoading && plots.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              {isVerified ? "No plots registered yet" : "Verify KYC to add plots"}
            </p>
          )}
          {plots.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
              <span className="text-base">🗺️</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900">{p.plot_name || "Unnamed Plot"}</p>
                <p className="text-xs text-gray-400">
                  {p.area_acres ? `${parseFloat(String(p.area_acres)).toFixed(1)} acres` : ""}{p.district ? ` · ${p.district}` : ""}
                </p>
              </div>
              <p className="text-xs text-gray-400 font-mono">{p.id.slice(0, 8)}</p>
            </div>
          ))}
        </div>
      </div>

      <Toast msg={toast} />

      {showKYC && (
        <KYCWizard
          farmer={farmer}
          onVerified={() => setFarmer((f) => ({ ...f, kyc_status: "VERIFIED" }))}
          onClose={() => setShowKYC(false)}
        />
      )}

      {showAddPlot && (
        <AddPlotSheet farmerId={farmer.id}
          onClose={() => setShowAddPlot(false)}
          onSuccess={() => { setShowAddPlot(false); loadPlots(); }}
        />
      )}
    </div>
  );
}

// ─── ADD PLOT SHEET ───────────────────────────────────────────────────────────

function AddPlotSheet({ farmerId, onClose, onSuccess }: {
  farmerId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [plotName, setPlotName] = useState("");
  const [district, setDistrict] = useState("Rangareddy");
  const [state, setState] = useState("Telangana");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ acres: number } | null>(null);
  const [toast, setToast] = useState("");

  async function submit() {
    setSubmitting(true);
    try {
      const baseLon = 73.0 + Math.random() * 7;
      const baseLat = 13.0 + Math.random() * 7;
      const size = 0.004 + Math.random() * 0.006;
      const geometry = {
        type: "Polygon",
        coordinates: [[[baseLon, baseLat], [baseLon + size, baseLat], [baseLon + size, baseLat + size], [baseLon, baseLat + size], [baseLon, baseLat]]],
      };
      const resp = await apiFetch<{ id: string; area_acres: number }>("/land-plots", {
        method: "POST",
        headers: { "X-Idempotency-Key": `demo-plot-${uuid7()}` },
        body: JSON.stringify({ farmer_id: farmerId, plot_name: plotName || "Farm Plot", geometry, soil_type: "Black Cotton", survey_number: `SV${Math.floor(Math.random() * 9000) + 1000}`, district, state }),
      });
      setResult({ acres: resp.area_acres });
    } catch (e: unknown) {
      setToast(`❌ ${(e as Error).message}`);
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/40 flex items-end z-20">
      <div className="w-full bg-white rounded-t-2xl shadow-2xl">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3" />

        {!result ? (
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Add Land Plot</h3>
              <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="bg-blue-50 rounded-lg p-2.5 text-xs text-blue-800">
              📍 GPS coordinates auto-generated to avoid boundary conflicts with existing plots
            </div>
            <input value={plotName} onChange={(e) => setPlotName(e.target.value)}
              placeholder="Plot name (e.g. North Farm)"
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400" />
            <div className="grid grid-cols-2 gap-2">
              <input value={district} onChange={(e) => setDistrict(e.target.value)}
                placeholder="District"
                className="px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400" />
              <input value={state} onChange={(e) => setState(e.target.value)}
                placeholder="State"
                className="px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <button onClick={submit} disabled={submitting}
              className="w-full py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 hover:bg-green-700">
              {submitting ? "Registering…" : "Register Plot"}
            </button>
            {toast && <p className="text-xs text-red-600">{toast}</p>}
          </div>
        ) : (
          <div className="p-6 text-center space-y-3">
            <div className="text-4xl">🗺️</div>
            <p className="text-sm font-bold text-gray-900">Plot Registered!</p>
            <div className="bg-green-50 rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Plot Name</span><span className="font-semibold">{plotName || "Farm Plot"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Area</span><span className="font-semibold text-green-700">{result.acres.toFixed(1)} acres</span></div>
              <div className="flex justify-between"><span className="text-gray-500">District</span><span className="font-semibold">{district}</span></div>
            </div>
            <button onClick={onSuccess} className="w-full py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700">Done →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GPS PROOF SCREEN ────────────────────────────────────────────────────────

function GPSProofScreen({ online }: { online: boolean }) {
  const [step, setStep] = useState<"select" | "acquiring" | "ready" | "submitting" | "result">("select");
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [plots, setPlots] = useState<LandPlot[]>([]);
  const [farmerId, setFarmerId] = useState("d457d2ae-2dae-4988-a0cc-fc5eda76cd76");
  const [plotId, setPlotId] = useState("8d510da6-22f3-43de-a4cc-0e6e87109526");
  const [loadingPlots, setLoadingPlots] = useState(false);
  const [result, setResult] = useState<{ verdict: string; distance: number | null; reason?: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const COORDS = { lat: 17.4005, lon: 78.4005, accuracy: 4.2 };

  useEffect(() => {
    apiFetch<{ changes: { farmers: { created: Farmer[] } } }>("/sync/pull?since=0")
      .then((d) => {
        const list = d.changes?.farmers?.created ?? [];
        setFarmers(list.filter((f) => f.kyc_status === "VERIFIED").slice(0, 20));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!farmerId) { setPlots([]); setPlotId(""); return; }
    setLoadingPlots(true);
    apiFetch<{ plots: LandPlot[] }>(`/land-plots?farmer_id=${farmerId}`)
      .then((d) => {
        const ps = d.plots ?? [];
        setPlots(ps);
        if (ps.length > 0 && farmerId !== "d457d2ae-2dae-4988-a0cc-fc5eda76cd76") {
          setPlotId(ps[0].id);
        }
      })
      .catch(() => setPlots([]))
      .finally(() => setLoadingPlots(false));
  }, [farmerId]);

  async function submit() {
    setStep("submitting");
    try {
      const hash = `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const resp = await apiFetch<{ verdict: string; distance_to_boundary_m: number | null; spoof_reason?: string }>(
        `/land-plots/${plotId}/proof-of-action`,
        {
          method: "POST",
          body: JSON.stringify({ farmer_id: farmerId, longitude: COORDS.lon, latitude: COORDS.lat, accuracy_m: COORDS.accuracy, photo_hash: hash }),
        }
      );
      setResult({ verdict: resp.verdict, distance: resp.distance_to_boundary_m, reason: resp.spoof_reason });
      setStep("result");
    } catch (e: unknown) {
      setResult({ verdict: "ERROR", distance: null, reason: (e as Error).message });
      setStep("result");
    }
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const selectedFarmer = farmers.find((f) => f.id === farmerId);
  const selectedPlot = plots.find((p) => p.id === plotId);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <PhoneHeader title="GPS Proof" subtitle="Anti-spoofing field verification" online={online} />
      <div className="p-3 space-y-3">

        {step === "select" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Select Farmer</p>
              <select value={farmerId} onChange={(e) => { setFarmerId(e.target.value); setPlotId(""); }}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="d457d2ae-2dae-4988-a0cc-fc5eda76cd76">Seed Farmer (demo)</option>
                {farmers.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} · {f.phone.slice(-4)}</option>
                ))}
              </select>

              <p className="text-xs font-semibold text-gray-700">Select Plot</p>
              {loadingPlots ? (
                <div className="h-8 bg-gray-100 rounded animate-pulse" />
              ) : (
                <select value={plotId} onChange={(e) => setPlotId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                  disabled={!farmerId || plots.length === 0}>
                  {farmerId === "d457d2ae-2dae-4988-a0cc-fc5eda76cd76" && (
                    <option value="8d510da6-22f3-43de-a4cc-0e6e87109526">Seed Plot (demo) · 1 acre</option>
                  )}
                  {plots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.plot_name || "Unnamed"} · {p.area_acres ? parseFloat(String(p.area_acres)).toFixed(1) : "?"} acres
                    </option>
                  ))}
                  {plots.length === 0 && farmerId !== "d457d2ae-2dae-4988-a0cc-fc5eda76cd76" && (
                    <option disabled>No plots found for this farmer</option>
                  )}
                </select>
              )}
            </div>

            {/* GPS info card */}
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-900 space-y-1.5 border border-blue-100">
              <div className="flex items-center gap-1.5 font-semibold"><span>📍</span> GPS Signal (Simulated)</div>
              <div className="grid grid-cols-2 gap-1">
                {[["Latitude", `${COORDS.lat}°N`], ["Longitude", `${COORDS.lon}°E`], ["Accuracy", `±${COORDS.accuracy}m`], ["Satellites", "12 locked"]].map(([k, v]) => (
                  <div key={k} className="bg-white rounded p-1.5">
                    <p className="text-gray-400 text-xs">{k}</p>
                    <p className="font-semibold text-gray-800 text-xs">{v}</p>
                  </div>
                ))}
              </div>
              <p className="text-blue-600 text-xs">This GPS point lies inside the seed plot polygon — will return VERIFIED.</p>
            </div>

            <button
              onClick={() => {
                if (!farmerId || !plotId) return;
                setStep("acquiring");
                timerRef.current = setTimeout(() => setStep("ready"), 2200);
              }}
              disabled={!farmerId || !plotId}
              className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 text-sm disabled:opacity-40">
              📡 Acquire GPS Signal
            </button>
          </>
        )}

        {step === "acquiring" && (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="relative w-28 h-28">
              <div className="absolute inset-0 rounded-full border-4 border-green-200 animate-ping" />
              <div className="absolute inset-2 rounded-full border-4 border-green-400 animate-pulse" />
              <div className="absolute inset-4 rounded-full bg-green-50 border-4 border-green-600 flex items-center justify-center text-2xl">📍</div>
            </div>
            <p className="text-sm font-bold text-gray-700">Locking satellite signal…</p>
            <p className="text-xs text-gray-400">Connecting to GPS constellation</p>
          </div>
        )}

        {step === "ready" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-green-800">GPS Signal Locked</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[["Latitude", `${COORDS.lat}°N`], ["Longitude", `${COORDS.lon}°E`], ["Accuracy", `±${COORDS.accuracy}m`], ["Status", "✅ Valid"]].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">{k}</p>
                    <p className="text-xs font-semibold text-gray-900">{v}</p>
                  </div>
                ))}
              </div>
              {selectedFarmer && (
                <div className="border-t border-gray-100 pt-2 space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Farmer</span>
                    <span className="font-medium text-gray-900">{selectedFarmer.name}</span>
                  </div>
                  {selectedPlot && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Plot</span>
                      <span className="font-medium text-gray-900">{selectedPlot.plot_name || "Unnamed"}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={submit}
              className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 text-sm">
              Submit Proof of Action
            </button>
          </>
        )}

        {step === "submitting" && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <div className="w-12 h-12 border-4 border-green-100 border-t-green-600 rounded-full animate-spin" />
            <p className="text-sm font-bold text-gray-700">Running PostGIS ST_Contains…</p>
            <p className="text-xs text-gray-400">Checking if GPS point is inside plot polygon</p>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-3">
            <div className={`rounded-xl p-5 text-center border-2 ${result.verdict === "VERIFIED" ? "bg-emerald-50 border-emerald-400" : result.verdict === "SPOOFED" ? "bg-red-50 border-red-400" : "bg-gray-50 border-gray-300"}`}>
              <div className="text-4xl mb-2">
                {result.verdict === "VERIFIED" ? "✅" : result.verdict === "SPOOFED" ? "🚨" : "⚠️"}
              </div>
              <p className={`text-xl font-black ${result.verdict === "VERIFIED" ? "text-emerald-800" : result.verdict === "SPOOFED" ? "text-red-800" : "text-gray-700"}`}>
                {result.verdict}
              </p>
              {result.verdict === "VERIFIED" && result.distance != null && (
                <p className="text-xs text-gray-600 mt-1">{result.distance.toFixed(1)}m from boundary · Inside plot ✓</p>
              )}
              {result.reason && <p className="text-xs text-red-600 mt-1">{result.reason}</p>}
              {result.verdict === "VERIFIED" && (
                <p className="text-xs text-emerald-600 mt-2 font-medium">📡 NATS event published → check Live Events tab</p>
              )}
            </div>
            <button onClick={() => { setStep("select"); setResult(null); }}
              className="w-full py-2.5 border border-gray-200 text-gray-700 text-sm rounded-xl hover:bg-gray-50">
              New Proof
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EVENTS SCREEN ────────────────────────────────────────────────────────────

function EventsScreen({ online, onEventCount }: { online: boolean; onEventCount: (n: number) => void }) {
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [connStatus, setConnStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [firing, setFiring] = useState(false);
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
                setEvents((prev) => { const next = [ev, ...prev].slice(0, 30); onEventCount(next.length); return next; });
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
  }, [onEventCount]);

  useEffect(() => { connect(); return () => { abortRef.current?.abort(); }; }, [connect]);

  async function fireTestEvent() {
    setFiring(true);
    try {
      await apiFetch("/payouts", {
        method: "POST",
        headers: { "X-Idempotency-Key": `events-demo-${uuid7()}` },
        body: JSON.stringify({ farmer_id: "d457d2ae-2dae-4988-a0cc-fc5eda76cd76", gross_amount: "1000", currency: "INR", description: "Demo event trigger" }),
      });
    } catch {}
    setFiring(false);
  }

  const statusBadge = { connecting: "bg-amber-100 text-amber-800", connected: "bg-emerald-100 text-emerald-800", disconnected: "bg-red-100 text-red-800" }[connStatus];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <PhoneHeader title="Live Events" subtitle="NATS → SSE real-time stream" online={online} />
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge}`}>
            {connStatus === "connecting" && "⏳ Connecting…"}
            {connStatus === "connected" && `● Live · ${events.length} events`}
            {connStatus === "disconnected" && "● Disconnected"}
          </span>
          <div className="flex items-center gap-2">
            {events.length > 0 && (
              <button onClick={() => { setEvents([]); onEventCount(0); }}
                className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">Clear</button>
            )}
            <button onClick={connect} className="text-xs text-green-700 font-medium bg-green-50 px-2 py-1 rounded-lg">↻</button>
          </div>
        </div>

        {/* Fire test event */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Trigger Demo Event</p>
          <button onClick={fireTestEvent} disabled={firing || connStatus !== "connected"}
            className="w-full py-2 bg-green-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-green-700 flex items-center justify-center gap-2">
            {firing ? <><span className="animate-spin">↻</span> Sending…</> : <><span>💸</span> Fire Payout Event (₹1,000)</>}
          </button>
          <p className="text-xs text-gray-400 text-center mt-1.5">Creates a real payout to the seed farmer → NATS → SSE</p>
        </div>

        {events.length === 0 && (
          <div className="bg-white rounded-xl p-5 text-center shadow-sm border border-gray-100">
            <p className="text-xl mb-1">📡</p>
            <p className="text-xs font-medium text-gray-700">Waiting for events</p>
            <p className="text-xs text-gray-400 mt-1">
              {connStatus === "connected"
                ? "Tap 'Fire Payout Event' above, or create a payout in Farmers tab"
                : "Connect to start receiving events"}
            </p>
          </div>
        )}

        {events.map((ev, i) => (
          <div key={ev.id ?? i} className={`bg-white rounded-xl border-l-4 shadow-sm p-3 ${eventColor(ev.type)}`}>
            <div className="flex items-start gap-2">
              <span className="text-base flex-shrink-0">{eventIcon(ev.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-bold text-gray-900">{ev.type}</p>
                  <span className="text-xs text-gray-400 flex-shrink-0">{ev.occurred_at ? relativeTime(ev.occurred_at) : ""}</span>
                </div>
                <p className="text-xs text-gray-400 font-mono truncate">{ev.subject}</p>
                <div className="mt-1 space-y-0.5">
                  {(ev.payload as Record<string, unknown>).gross_amount && (
                    <p className="text-xs text-gray-700">💰 {formatINR(String((ev.payload as Record<string, unknown>).gross_amount))}</p>
                  )}
                  {(ev.payload as Record<string, unknown>).verdict && (
                    <p className="text-xs text-gray-700">Verdict: <span className="font-semibold">{String((ev.payload as Record<string, unknown>).verdict)}</span></p>
                  )}
                  {(ev.payload as Record<string, unknown>).ndvi_mean && (
                    <p className="text-xs text-gray-700">NDVI: {String((ev.payload as Record<string, unknown>).ndvi_mean)}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SYNC SCREEN ─────────────────────────────────────────────────────────────

interface HealthData { status: string; checks: { postgres?: string; redis?: string; nats?: string } }

function SyncScreen({ online }: { online: boolean }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncStats, setSyncStats] = useState<{ farmers: number; plots: number } | null>(null);

  const checkHealth = useCallback(() => {
    fetch("http://localhost:8888/health/ready")
      .then((r) => r.json())
      .then((h: HealthData) => setHealth(h))
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  async function sync() {
    setSyncing(true);
    try {
      const data = await apiFetch<{ changes: { farmers: { created: unknown[] }; land_plots: { created: unknown[] } } }>("/sync/pull?since=0");
      setSyncStats({ farmers: data.changes?.farmers?.created?.length ?? 0, plots: data.changes?.land_plots?.created?.length ?? 0 });
      setLastSync(new Date());
    } catch {}
    setSyncing(false);
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <PhoneHeader title="Sync & Offline" subtitle="WatermelonDB offline-first" online={online} />
      <div className="p-3 space-y-3">

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Backend Health</p>
            <button onClick={checkHealth} className="text-xs text-green-700">↻ Refresh</button>
          </div>
          {health ? (
            <div className="space-y-1.5">
              {[
                { label: "API Server", value: health.status, icon: "🌐" },
                { label: "PostgreSQL", value: health.checks?.postgres ?? "unknown", icon: "🗄️" },
                { label: "Redis", value: health.checks?.redis ?? "unknown", icon: "⚡" },
                { label: "NATS", value: "via SSE", icon: "📡" },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-center justify-between py-1">
                  <span className="text-xs text-gray-600">{icon} {label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${value === "ok" || value === "ready" || value === "via SSE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                    {value === "ok" || value === "ready" ? "✅ OK" : value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-xs text-red-600">⚠️ Cannot reach :8888</p>
              <button onClick={checkHealth} className="text-xs text-green-700 mt-1">Retry</button>
            </div>
          )}
        </div>

        <button onClick={sync} disabled={syncing}
          className="w-full py-3 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 hover:bg-green-700 flex items-center justify-center gap-2 text-sm">
          <span className={syncing ? "animate-spin inline-block" : "inline-block"}>↻</span>
          {syncing ? "Pulling delta from server…" : "Sync Now"}
        </button>

        {lastSync && syncStats && (
          <div className="bg-green-50 rounded-xl border border-green-100 p-3">
            <p className="text-xs font-semibold text-green-800 mb-1">Last Sync — {lastSync.toLocaleTimeString("en-IN")}</p>
            <div className="flex gap-4 text-xs text-green-700">
              <span>👨‍🌾 {syncStats.farmers} farmers</span>
              <span>🗺️ {syncStats.plots} plots</span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Offline-First Architecture</p>
          <div className="space-y-2.5">
            {[
              { icon: "📱", title: "Write Locally First", desc: "All writes go to local SQLite (WatermelonDB) instantly — no network needed" },
              { icon: "📤", title: "Push Changes", desc: "POST /sync/push sends offline mutations with last_pulled_at conflict key" },
              { icon: "📥", title: "Pull Delta", desc: "GET /sync/pull?since=<ts> fetches only records changed since last sync" },
              { icon: "🏆", title: "Server Wins", desc: "updated_at comparison resolves conflicts — financial records are append-only" },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-3 pb-2.5 border-b border-gray-50 last:border-0">
                <span className="text-base flex-shrink-0">{icon}</span>
                <div>
                  <p className="text-xs font-semibold text-gray-900">{title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-green-50 rounded-xl border border-green-100 p-3">
          <p className="text-xs font-semibold text-green-800 mb-2">Tech Stack</p>
          <div className="flex flex-wrap gap-1">
            {["WatermelonDB", "SQLite/JSI", "React Native 0.76", "Delta Sync", "NATS", "PostGIS 17"].map((tag) => (
              <span key={tag} className="text-xs bg-white border border-green-200 text-green-800 px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────

type Tab = "home" | "farmers" | "gps" | "events" | "sync";

function TabBar({ active, onChange, eventBadge }: { active: Tab; onChange: (t: Tab) => void; eventBadge: number }) {
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "farmers", icon: "👨‍🌾", label: "Farmers" },
    { id: "gps", icon: "📍", label: "GPS" },
    { id: "events", icon: "📡", label: "Events" },
    { id: "sync", icon: "🔄", label: "Sync" },
  ];
  return (
    <div className="border-t border-gray-100 bg-white flex items-center justify-around py-1.5 px-1">
      {tabs.map(({ id, icon, label }) => (
        <button key={id} onClick={() => onChange(id)}
          className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${active === id ? "text-green-700" : "text-gray-400"}`}>
          <span className="text-base">{icon}</span>
          <span className={`text-xs font-medium ${active === id ? "text-green-700" : "text-gray-400"}`}>{label}</span>
          {active === id && <span className="w-1 h-1 rounded-full bg-green-600" />}
          {id === "events" && eventBadge > 0 && active !== "events" && (
            <span className="absolute -top-0.5 right-0 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold" style={{ fontSize: 9 }}>
              {eventBadge > 9 ? "9+" : eventBadge}
            </span>
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
  const [openAddFarmer, setOpenAddFarmer] = useState(false);
  const [online, setOnline] = useState(true);
  const [time, setTime] = useState("");
  const [eventBadge, setEventBadge] = useState(0);

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("http://localhost:8888/health/live")
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  function goToTab(t: Tab) { setSelectedFarmer(null); setOpenAddFarmer(false); setTab(t); }

  return (
    <div className="relative" style={{ width: 393, height: 852 }}>
      {/* Phone chrome */}
      <div className="absolute inset-0 rounded-[47px] shadow-2xl"
        style={{ background: "#1a1a1a", boxShadow: "0 0 0 2px #3a3a3a, 0 0 0 4px #2a2a2a, 0 25px 60px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.3)" }} />

      {/* Screen */}
      <div className="absolute overflow-hidden bg-gray-50 flex flex-col" style={{ inset: "12px", borderRadius: "38px" }}>
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-black rounded-full" style={{ width: 126, height: 36 }} />

        <div style={{ paddingTop: 48 }}>
          <PhoneStatusBar time={time} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {tab === "home" && (
            <HomeScreen online={online}
              onGoToFarmers={() => goToTab("farmers")}
              onGoToGPS={() => goToTab("gps")}
              onGoToEvents={() => { setEventBadge(0); goToTab("events"); }}
              onAddFarmer={() => { goToTab("farmers"); setOpenAddFarmer(true); }}
            />
          )}
          {tab === "farmers" && !selectedFarmer && (
            <FarmersScreen online={online} onSelectFarmer={setSelectedFarmer} openAddSheet={openAddFarmer} />
          )}
          {tab === "farmers" && selectedFarmer && (
            <FarmerDetailScreen farmer={selectedFarmer} online={online} onBack={() => setSelectedFarmer(null)} />
          )}
          {tab === "gps" && <GPSProofScreen online={online} />}
          {tab === "events" && (
            <EventsScreen online={online} onEventCount={(n) => { if (tab !== "events") setEventBadge(n); }} />
          )}
          {tab === "sync" && <SyncScreen online={online} />}
        </div>

        <TabBar active={tab} eventBadge={eventBadge}
          onChange={(t) => { setSelectedFarmer(null); setOpenAddFarmer(false); if (t === "events") setEventBadge(0); setTab(t); }} />

        <div className="flex justify-center pb-2 pt-1 bg-white">
          <div className="w-28 h-1 bg-gray-300 rounded-full" />
        </div>
      </div>

      {/* Side buttons */}
      <div className="absolute rounded-r-sm bg-gray-600" style={{ right: -3, top: 160, width: 4, height: 32 }} />
      <div className="absolute rounded-l-sm bg-gray-600" style={{ left: -3, top: 120, width: 4, height: 28 }} />
      <div className="absolute rounded-l-sm bg-gray-600" style={{ left: -3, top: 168, width: 4, height: 52 }} />
      <div className="absolute rounded-l-sm bg-gray-600" style={{ left: -3, top: 230, width: 4, height: 52 }} />
    </div>
  );
}
