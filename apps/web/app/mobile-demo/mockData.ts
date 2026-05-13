// Demo-mode mock responses — activated when NEXT_PUBLIC_API_URL is not set (Vercel preview/prod without backend).
// All data is realistic and matches the actual Go API contracts.

const SEED_FARMER_ID = "d457d2ae-2dae-4988-a0cc-fc5eda76cd76";
const SEED_PLOT_ID   = "8d510da6-22f3-43de-a4cc-0e6e87109526";

const MOCK_FARMERS = [
  { id: SEED_FARMER_ID, name: "Ravi Kumar",    phone: "+919876543210", kyc_status: "VERIFIED",  created_at: Date.now() - 86400000 * 7 },
  { id: "b1c2d3e4-0000-4000-8000-aabbccddeeff", name: "Sunita Devi",    phone: "+919876543211", kyc_status: "PENDING",   created_at: Date.now() - 86400000 * 3 },
  { id: "c3d4e5f6-1111-4000-8000-aabbccddeeff", name: "Manoj Patel",    phone: "+919876543212", kyc_status: "VERIFIED",  created_at: Date.now() - 86400000 * 14 },
];

const MOCK_PLOTS = [
  { id: SEED_PLOT_ID, farmer_id: SEED_FARMER_ID, plot_name: "North Field",   area_acres: 2.5,  district: "Ranga Reddy", state: "Telangana" },
  { id: "a1b2c3d4-2222-4000-8000-aabbccddeeff", farmer_id: SEED_FARMER_ID, plot_name: "South Field",  area_acres: 1.8,  district: "Ranga Reddy", state: "Telangana" },
];

const MOCK_TRANSACTIONS = [
  { id: "txn-001", gross_amount: "50000.00", status: "COMPLETED", farmer_id: SEED_FARMER_ID, description: "Kharif season payout", created_at: new Date(Date.now() - 3600000 * 2).toISOString() },
  { id: "txn-002", gross_amount: "25000.00", status: "COMPLETED", farmer_id: "c3d4e5f6-1111-4000-8000-aabbccddeeff", description: "Rabi crop disbursement", created_at: new Date(Date.now() - 3600000 * 24).toISOString() },
  { id: "txn-003", gross_amount: "10000.00", status: "COMPLETED", farmer_id: SEED_FARMER_ID, description: "Micro-insurance payout", created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
];

const MOCK_METRICS = {
  farmer_count: 247,
  plot_count: 389,
  transaction_count: 1_024,
  total_disbursed: "12500000.00",
  total_ndvi_alerts: 18,
  total_proof_records: 892,
};

let mockFarmerStore = [...MOCK_FARMERS];
let mockPlotStore   = [...MOCK_PLOTS];
let mockTxnStore    = [...MOCK_TRANSACTIONS];

export function resetMockStore() {
  mockFarmerStore = [...MOCK_FARMERS];
  mockPlotStore   = [...MOCK_PLOTS];
  mockTxnStore    = [...MOCK_TRANSACTIONS];
}

export async function mockApiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  await delay(300 + Math.random() * 200);

  const method = opts?.method?.toUpperCase() ?? "GET";
  const body   = opts?.body ? JSON.parse(opts.body as string) : null;

  // ── GET /metrics-platform ───────────────────────────────────────────────────
  if (method === "GET" && path === "/metrics-platform") {
    return { ...MOCK_METRICS, farmer_count: mockFarmerStore.length + 244 } as T;
  }

  // ── GET /transactions ───────────────────────────────────────────────────────
  if (method === "GET" && path.startsWith("/transactions")) {
    return { transactions: mockTxnStore } as T;
  }

  // ── POST /sync/push  (farmer / plot registration) ───────────────────────────
  if (method === "POST" && path === "/sync/push") {
    const changes = body?.changes ?? {};

    // New farmers
    for (const f of changes.farmers?.created ?? []) {
      if (!mockFarmerStore.find((x) => x.id === f.id)) {
        mockFarmerStore.unshift({
          id: f.id,
          name: f.name ?? "Unknown",
          phone: f.phone ?? "",
          kyc_status: f.kyc_status ?? "PENDING",
          created_at: Date.now(),
        });
      }
    }

    // KYC updates
    for (const u of changes.farmers?.updated ?? []) {
      const idx = mockFarmerStore.findIndex((x) => x.id === u.id || x.id === u.server_id);
      if (idx !== -1) mockFarmerStore[idx] = { ...mockFarmerStore[idx], ...u };
    }

    // New plots
    for (const p of changes.land_plots?.created ?? []) {
      if (!mockPlotStore.find((x) => x.id === p.id)) {
        mockPlotStore.unshift({
          id: p.id,
          farmer_id: p.farmer_id,
          plot_name: p.plot_name ?? "New Plot",
          area_acres: p.area_acres ?? 1.0,
          district: p.district ?? "Unknown",
          state: p.state ?? "India",
        });
      }
    }

    return { success: true, server_timestamp: Date.now() } as T;
  }

  // ── GET /sync/pull ──────────────────────────────────────────────────────────
  if (method === "GET" && path.startsWith("/sync/pull")) {
    return {
      changes: {
        farmers:    { created: mockFarmerStore, updated: [], deleted: [] },
        land_plots: { created: mockPlotStore,   updated: [], deleted: [] },
      },
      server_timestamp: Date.now(),
    } as T;
  }

  // ── GET /land-plots?farmer_id=... ───────────────────────────────────────────
  if (method === "GET" && path.startsWith("/land-plots")) {
    const farmerId = new URLSearchParams(path.split("?")[1] ?? "").get("farmer_id");
    const plots = farmerId ? mockPlotStore.filter((p) => p.farmer_id === farmerId) : mockPlotStore;
    return { plots } as T;
  }

  // ── POST /land-plots  (direct create — fallback path) ───────────────────────
  if (method === "POST" && path === "/land-plots") {
    const newPlot = {
      id: generateId(),
      farmer_id: body?.farmer_id ?? "",
      plot_name: body?.plot_name ?? "New Plot",
      area_acres: body?.area_acres ?? 1.0,
      district: body?.district ?? "Unknown",
      state: body?.state ?? "India",
    };
    mockPlotStore.unshift(newPlot);
    return { id: newPlot.id, area_acres: newPlot.area_acres } as T;
  }

  // ── POST /payouts ────────────────────────────────────────────────────────────
  if (method === "POST" && path === "/payouts") {
    const gross  = parseFloat(body?.gross_amount ?? "10000");
    const newTxn = {
      id: generateId(),
      gross_amount: gross.toFixed(2),
      status: "COMPLETED",
      farmer_id: body?.farmer_id ?? SEED_FARMER_ID,
      description: body?.description ?? "Field agent payout",
      created_at: new Date().toISOString(),
    };
    mockTxnStore.unshift(newTxn);
    return {
      id:              newTxn.id,
      gross_amount:    newTxn.gross_amount,
      farmer_payment:  (gross * 0.50).toFixed(2),
      platform_fee:    (gross * 0.25).toFixed(2),
      agent_commission:(gross * 0.05).toFixed(2),
      reserve_fund:    (gross * 0.20).toFixed(2),
      status:          "COMPLETED",
    } as T;
  }

  // ── POST /land-plots/:id/proof-of-action ────────────────────────────────────
  const proofMatch = path.match(/^\/land-plots\/([^/]+)\/proof-of-action$/);
  if (method === "POST" && proofMatch) {
    const accuracyM = body?.accuracy_m ?? 4.2;
    const spoofed   = accuracyM < 1.0 || accuracyM <= 0;
    return {
      verdict: spoofed ? "SPOOFED" : "VERIFIED",
      distance_to_boundary_m: spoofed ? null : 12.4,
      spoof_reason: spoofed ? "accuracy_m below threshold" : undefined,
    } as T;
  }

  // ── GET /health/ready  |  /health/live ──────────────────────────────────────
  if (method === "GET" && (path === "/health/ready" || path === "/health/live")) {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      checks: { postgres: "ok", redis: "ok" },
    } as T;
  }

  throw new Error(`[demo] unhandled mock: ${method} ${path}`);
}

// SSE mock — returns an async generator of event strings
export async function* mockEventStream(): AsyncGenerator<string> {
  const events = [
    { type: "payout.completed", subject: "finagra.payout.completed",  payload: { farmer_id: SEED_FARMER_ID, gross_amount: "10000.00", farmer_payment: "5000.00", transaction_id: generateId() } },
    { type: "proof.verdict",    subject: "finagra.proof.verdict",      payload: { farmer_id: SEED_FARMER_ID, plot_id: SEED_PLOT_ID, verdict: "VERIFIED", distance_to_boundary_m: 12.4 } },
    { type: "ndvi.alert",       subject: "finagra.ndvi.alert",         payload: { plot_id: SEED_PLOT_ID, ndvi_value: 0.21, threshold: 0.30, alert: "BELOW_THRESHOLD" } },
    { type: "sync.batch",       subject: "finagra.sync.batch",         payload: { records_pushed: 3, farmer_count: 1, plot_count: 2 } },
    { type: "payout.completed", subject: "finagra.payout.completed",   payload: { farmer_id: "c3d4e5f6-1111-4000-8000-aabbccddeeff", gross_amount: "25000.00", farmer_payment: "12500.00", transaction_id: generateId() } },
  ];

  for (const ev of events) {
    await delay(1200 + Math.random() * 800);
    yield `data: ${JSON.stringify({ id: generateId(), ...ev, occurred_at: new Date().toISOString() })}\n\n`;
  }

  // Keep yielding periodic events
  while (true) {
    await delay(4000 + Math.random() * 3000);
    const pick = events[Math.floor(Math.random() * events.length)];
    yield `data: ${JSON.stringify({ id: generateId(), ...pick, occurred_at: new Date().toISOString() })}\n\n`;
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
