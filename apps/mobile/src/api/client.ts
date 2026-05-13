const BASE = 'http://localhost:8888/api/v1';

function idemKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function request<T>(method: string, path: string, body?: object, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json as T;
}

// --- Types ---
export type KYCStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type Verdict = 'VERIFIED' | 'SPOOFED' | 'REJECTED';

export interface SyncPushResult {
  server_ids: { farmers: Record<string, string>; land_plots: Record<string, string> };
  stats: { farmers_created: number; plots_created: number; farmers_updated: number; plots_updated: number };
}

export interface LandPlot {
  id: string; farmer_id: string; plot_name: string;
  area_acres: number; district: string; state: string; created_at: string;
}

export interface Transaction {
  id: string; gross_amount: string; currency: string;
  status: string; description: string; created_at: string;
}

export interface ProofResult {
  id: string; verdict: Verdict; is_inside: boolean;
  accuracy_m: number; spoof_reason?: string; submitted_at: string;
}

export interface NDVIObservation {
  id: string; ndvi_mean: string; source: string; observed_at: string;
}

export interface PlatformMetrics {
  farmer_count: number; plot_count: number; transaction_count: number;
  total_proof_records: number; total_ndvi_alerts: number; total_disbursed: string;
}

export interface PlatformEvent {
  id: string; type: string; timestamp: string; data: Record<string, any>;
}

// --- API Methods ---
export const api = {
  health: () => request<{ status: string; checks: { postgres: string; redis: string } }>('GET', '/health/ready' /* strip /api/v1 */),

  metrics: () => request<PlatformMetrics>('GET', '/metrics-platform'),

  sync: {
    push: (payload: object) =>
      request<SyncPushResult>('POST', '/sync/push', payload, { 'X-Idempotency-Key': idemKey('sync') }),
    pull: (since = 0) => request<any>('GET', `/sync/pull?since=${since}`),
  },

  landPlots: {
    create: (data: { farmer_id: string; plot_name: string; district: string; state: string; geojson: object }) =>
      request<LandPlot>('POST', '/land-plots', data, { 'X-Idempotency-Key': idemKey('plot') }),
    listByFarmer: (farmerId: string) => request<{ plots: LandPlot[] }>('GET', `/land-plots?farmer_id=${farmerId}`),
    getById: (id: string) => request<LandPlot>('GET', `/land-plots/${id}`),
  },

  proof: {
    submit: (plotId: string, data: { farmer_id: string; longitude: number; latitude: number; accuracy_m: number; photo_hash: string }) =>
      request<ProofResult>('POST', `/land-plots/${plotId}/proof-of-action`, data, { 'X-Idempotency-Key': idemKey('proof') }),
  },

  satellite: {
    getLatest: (plotId: string) => request<NDVIObservation>('GET', `/land-plots/${plotId}/satellite`),
    seed: (data: object) =>
      request<NDVIObservation>('POST', '/satellite/observations', data, { 'X-Idempotency-Key': idemKey('ndvi') }),
  },

  payouts: {
    create: (data: { farmer_id: string; gross_amount: string; currency: string; description: string; plot_id?: string }) =>
      request<Transaction>('POST', '/payouts', data, { 'X-Idempotency-Key': idemKey('payout') }),
    entries: (txnId: string) => request<{ count: number; entries: any[] }>('GET', `/payouts/${txnId}/entries`),
    list: (limit = 20) => request<{ transactions: Transaction[] }>('GET', `/transactions?limit=${limit}`),
  },
};

// Health check hits a different path
export async function checkHealth() {
  try {
    const res = await fetch('http://localhost:8888/health/ready', { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    return json.status === 'ok';
  } catch {
    return false;
  }
}

// Farmer creation via sync/push
export async function createFarmerViaSync(localId: string, name: string, phone: string, kycStatus: KYCStatus) {
  return api.sync.push({
    last_pulled_at: 0,
    changes: {
      farmers: {
        created: [{ id: localId, name, phone, kyc_status: kycStatus }],
        updated: [], deleted: [],
      },
      land_plots: { created: [], updated: [], deleted: [] },
    },
  });
}

export function formatINR(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₹—';
  return '₹' + num.toLocaleString('en-IN');
}
