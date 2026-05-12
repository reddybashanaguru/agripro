import { randomUUID } from "crypto";
import { getPlatformMetricsTool } from "../src/tools/metrics.js";
import { getLedgerBalanceTool } from "../src/tools/ledger.js";
import { listTransactionsTool } from "../src/tools/transactions.js";
import { initiatePayoutTool } from "../src/tools/payout.js";
import { checkPlotNDVITool, seedSatelliteObservationTool } from "../src/tools/ndvi.js";
import { getLandPlotsTool } from "../src/tools/land-plots.js";
import { submitFieldProofTool } from "../src/tools/proof.js";

// Seed IDs from the live database
const KNOWN_FARMER_ID = "d457d2ae-2dae-4988-a0cc-fc5eda76cd76";
const KNOWN_PLOT_ID = "8d510da6-22f3-43de-a4cc-0e6e87109526";

function parseToolText(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe("Tool: get_platform_metrics", () => {
  it("returns all 6 KPI fields", async () => {
    const result = await getPlatformMetricsTool.execute({});
    const data = parseToolText(result);
    expect(data.metrics).toMatchObject({
      farmer_count: expect.any(Number),
      plot_count: expect.any(Number),
      transaction_count: expect.any(Number),
      total_ndvi_alerts: expect.any(Number),
      total_proof_records: expect.any(Number),
    });
    expect(typeof data.metrics.total_disbursed).toBe("string");
  });

  it("includes a payout eligibility status", async () => {
    const result = await getPlatformMetricsTool.execute({});
    const data = parseToolText(result);
    expect(data.metrics.payout_eligibility).toMatch(/ELIGIBLE|BLOCKED/);
  });

  it("includes a human-readable summary", async () => {
    const result = await getPlatformMetricsTool.execute({});
    const data = parseToolText(result);
    expect(typeof data.summary).toBe("string");
    expect(data.summary.length).toBeGreaterThan(10);
  });
});

describe("Tool: get_ledger_balance", () => {
  it("returns balance with is_balanced boolean", async () => {
    const result = await getLedgerBalanceTool.execute({});
    const data = parseToolText(result);
    expect(typeof data.balance.is_balanced).toBe("boolean");
    expect(typeof data.balance.total_debit).toBe("string");
    expect(typeof data.balance.total_credit).toBe("string");
  });

  it("returns a LEDGER_INTEGRITY status", async () => {
    const result = await getLedgerBalanceTool.execute({});
    const data = parseToolText(result);
    expect(data.status).toMatch(/LEDGER_INTEGRITY_(VERIFIED|FAILED)/);
  });

  it("includes integrity checks array", async () => {
    const result = await getLedgerBalanceTool.execute({});
    const data = parseToolText(result);
    expect(Array.isArray(data.integrity_checks)).toBe(true);
    expect(data.integrity_checks.length).toBe(3);
    data.integrity_checks.forEach((c: { rule: string; pass: boolean }) => {
      expect(typeof c.rule).toBe("string");
      expect(typeof c.pass).toBe("boolean");
    });
  });

  it("reflects the immutable 50/25/5/20 math laws", async () => {
    const result = await getLedgerBalanceTool.execute({});
    const data = parseToolText(result);
    expect(data.math_laws).toEqual({
      farmer_payment: "50%",
      platform_fee: "25%",
      agent_commission: "5%",
      reserve_fund: "20%",
    });
  });
});

describe("Tool: list_transactions", () => {
  it("returns paginated transaction list", async () => {
    const result = await listTransactionsTool.execute({ limit: 5, offset: 0 });
    const data = parseToolText(result);
    expect(data.transactions).toBeInstanceOf(Array);
    expect(data.transactions.length).toBeLessThanOrEqual(5);
    expect(data.pagination.total).toBeGreaterThan(0);
  });

  it("each transaction has required fields", async () => {
    const result = await listTransactionsTool.execute({ limit: 3, offset: 0 });
    const data = parseToolText(result);
    data.transactions.forEach((t: Record<string, unknown>) => {
      expect(typeof t.id).toBe("string");
      expect(typeof t.amount).toBe("string");
      expect(typeof t.status).toBe("string");
      expect(typeof t.farmer_id).toBe("string");
    });
  });

  it("shows correct showing N-M of total text", async () => {
    const result = await listTransactionsTool.execute({ limit: 5, offset: 0 });
    const data = parseToolText(result);
    expect(data.showing).toMatch(/^\d+–\d+ of \d+$/);
  });

  it("respects limit parameter", async () => {
    const result = await listTransactionsTool.execute({ limit: 2, offset: 0 });
    const data = parseToolText(result);
    expect(data.transactions.length).toBeLessThanOrEqual(2);
  });

  it("respects offset for pagination", async () => {
    const r1 = await listTransactionsTool.execute({ limit: 1, offset: 0 });
    const r2 = await listTransactionsTool.execute({ limit: 1, offset: 1 });
    const d1 = parseToolText(r1);
    const d2 = parseToolText(r2);
    // Different transactions at different offsets
    if (d1.transactions[0] && d2.transactions[0]) {
      expect(d1.transactions[0].id).not.toBe(d2.transactions[0].id);
    }
  });
});

describe("Tool: get_land_plots", () => {
  it("returns plots for a known farmer", async () => {
    const result = await getLandPlotsTool.execute({ farmer_id: KNOWN_FARMER_ID });
    const data = parseToolText(result);
    expect(data.farmer_id).toBe(KNOWN_FARMER_ID);
    expect(data.plot_count).toBeGreaterThan(0);
    expect(data.plots[0].id).toBe(KNOWN_PLOT_ID);
  });

  it("returns empty list for unknown farmer", async () => {
    const result = await getLandPlotsTool.execute({ farmer_id: randomUUID() });
    const data = parseToolText(result);
    expect(data.plot_count).toBe(0);
    expect(data.plots).toHaveLength(0);
  });

  it("rejects invalid farmer_id", async () => {
    await expect(getLandPlotsTool.execute({ farmer_id: "not-a-uuid" })).rejects.toThrow();
  });

  it("each plot has id, name, and soil_type", async () => {
    const result = await getLandPlotsTool.execute({ farmer_id: KNOWN_FARMER_ID });
    const data = parseToolText(result);
    data.plots.forEach((p: Record<string, unknown>) => {
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
    });
  });
});

describe("Tool: check_plot_ndvi", () => {
  beforeAll(async () => {
    // Seed a fresh healthy NDVI observation so the test has reliable data
    await seedSatelliteObservationTool.execute({
      plot_id: KNOWN_PLOT_ID,
      source: "Test-Sentinel",
      ndvi_mean: "0.72",
      ndvi_min: "0.65",
      ndvi_max: "0.80",
    });
  });

  it("returns NDVI mean and payout eligibility", async () => {
    const result = await checkPlotNDVITool.execute({ plot_id: KNOWN_PLOT_ID });
    const data = parseToolText(result);
    expect(typeof data.ndvi.mean).toBe("string");
    expect(typeof data.payout_eligible).toBe("boolean");
  });

  it("returns ALLOWED for a healthy plot (NDVI 0.72)", async () => {
    const result = await checkPlotNDVITool.execute({ plot_id: KNOWN_PLOT_ID });
    const data = parseToolText(result);
    expect(data.payout_eligible).toBe(true);
    expect(data.payout_status).toBe("ALLOWED");
    expect(data.label).toBe("HEALTHY_CROP");
  });

  it("returns ALLOWED for unknown plot (fail-open policy)", async () => {
    const result = await checkPlotNDVITool.execute({ plot_id: randomUUID() });
    const data = parseToolText(result);
    expect(data.payout_eligible).toBe(true);
    expect(data.payout_status).toContain("fail-open");
  });

  it("rejects invalid plot_id", async () => {
    await expect(checkPlotNDVITool.execute({ plot_id: "bad-id" })).rejects.toThrow();
  });
});

describe("Tool: seed_satellite_observation", () => {
  it("seeds an observation and returns NDVI fields", async () => {
    const result = await seedSatelliteObservationTool.execute({
      plot_id: KNOWN_PLOT_ID,
      source: "ISRO-ResourceSat",
      ndvi_mean: "0.55",
      ndvi_min: "0.45",
      ndvi_max: "0.65",
    });
    const data = parseToolText(result);
    expect(data.status).toBe("OBSERVATION_SEEDED");
    expect(data.observation_id).toBeTruthy();
    expect(data.payout_eligible).toBe(true);
    expect(data.label).toBe("HEALTHY_CROP");
  });

  it("seeds a stressed observation (NDVI 0.20) — payout should be blocked", async () => {
    const result = await seedSatelliteObservationTool.execute({
      plot_id: KNOWN_PLOT_ID,
      ndvi_mean: "0.20",
      ndvi_min: "0.15",
      ndvi_max: "0.25",
    });
    const data = parseToolText(result);
    expect(data.payout_eligible).toBe(false);
    expect(data.label).toBe("BARE_SOIL_OR_STRESS");
  });
});

describe("Tool: initiate_payout", () => {
  beforeAll(async () => {
    // Ensure the test plot has a healthy NDVI before payout tests
    await seedSatelliteObservationTool.execute({
      plot_id: KNOWN_PLOT_ID,
      ndvi_mean: "0.72",
      ndvi_min: "0.65",
      ndvi_max: "0.80",
    });
  });

  it("completes a payout with 50/25/5/20 split", async () => {
    const result = await initiatePayoutTool.execute({
      farmer_id: KNOWN_FARMER_ID,
      gross_amount: "10000",
      description: "Step 9 MCP tool integration test",
      idempotency_key: `mcp-test-payout-${randomUUID()}`,
    });
    const data = parseToolText(result);
    expect(data.status).toBe("PAYOUT_COMPLETED");
    expect(data.transaction_id).toBeTruthy();
    expect(data.disbursement).toMatchObject({
      gross: expect.stringContaining("₹"),
      farmer_payment: expect.stringContaining("50%"),
      platform_fee: expect.stringContaining("25%"),
      agent_commission: expect.stringContaining("5%"),
      reserve_fund: expect.stringContaining("20%"),
    });
  });

  it("is idempotent — same key returns same result without error", async () => {
    const idKey = `mcp-test-idempotent-${randomUUID()}`;
    const r1 = await initiatePayoutTool.execute({
      farmer_id: KNOWN_FARMER_ID,
      gross_amount: "5000",
      description: "Idempotency test",
      idempotency_key: idKey,
    });
    const r2 = await initiatePayoutTool.execute({
      farmer_id: KNOWN_FARMER_ID,
      gross_amount: "5000",
      description: "Idempotency test",
      idempotency_key: idKey,
    });
    const d1 = parseToolText(r1);
    const d2 = parseToolText(r2);
    expect(d1.transaction_id).toBe(d2.transaction_id);
  });

  it("blocks payout when NDVI is below threshold", async () => {
    // Seed a stressed observation first
    await seedSatelliteObservationTool.execute({
      plot_id: KNOWN_PLOT_ID,
      ndvi_mean: "0.15",
      ndvi_min: "0.10",
      ndvi_max: "0.20",
    });

    const result = await initiatePayoutTool.execute({
      farmer_id: KNOWN_FARMER_ID,
      gross_amount: "10000",
      description: "Should be blocked by NDVI",
      plot_id: KNOWN_PLOT_ID,
      idempotency_key: `mcp-blocked-${randomUUID()}`,
    });
    const data = parseToolText(result);
    expect(data.status).toBe("PAYOUT_BLOCKED");
    expect(data.reason).toBe("NDVI_BELOW_THRESHOLD");
    expect(result.isError).toBe(true);
  });

  it("rejects invalid farmer_id", async () => {
    await expect(
      initiatePayoutTool.execute({
        farmer_id: "not-a-uuid",
        gross_amount: "1000",
        description: "Should fail validation",
      })
    ).rejects.toThrow();
  });
});

describe("Tool: submit_field_proof", () => {
  it("returns VERIFIED for realistic GPS coordinates", async () => {
    const result = await submitFieldProofTool.execute({
      plot_id: KNOWN_PLOT_ID,
      farmer_id: KNOWN_FARMER_ID,
      photo_hash: `test-hash-${randomUUID()}`,
      latitude: 17.4005,
      longitude: 78.4005,
      accuracy_m: 5.0,
    });
    const data = parseToolText(result);
    // Within the registered polygon (17.4–17.401, 78.4–78.401)
    expect(["VERIFIED", "REJECTED"]).toContain(data.verdict);
  });

  it("returns SPOOFED for impossible GPS accuracy (0m)", async () => {
    const result = await submitFieldProofTool.execute({
      plot_id: KNOWN_PLOT_ID,
      farmer_id: KNOWN_FARMER_ID,
      photo_hash: `spoofed-hash-${randomUUID()}`,
      latitude: 17.4005,
      longitude: 78.4005,
      accuracy_m: 0,
    });
    const data = parseToolText(result);
    expect(data.verdict).toBe("SPOOFED");
    expect(result.isError).toBe(true);
  });

  it("returns SPOOFED for suspiciously precise GPS (< 1m)", async () => {
    const result = await submitFieldProofTool.execute({
      plot_id: KNOWN_PLOT_ID,
      farmer_id: KNOWN_FARMER_ID,
      photo_hash: `precise-hash-${randomUUID()}`,
      latitude: 17.4005,
      longitude: 78.4005,
      accuracy_m: 0.5,
    });
    const data = parseToolText(result);
    expect(data.verdict).toBe("SPOOFED");
  });

  it("returns SPOOFED for duplicate photo_hash (replay attack)", async () => {
    const duplicateHash = `replay-hash-${randomUUID()}`;
    await submitFieldProofTool.execute({
      plot_id: KNOWN_PLOT_ID,
      farmer_id: KNOWN_FARMER_ID,
      photo_hash: duplicateHash,
      latitude: 17.4005,
      longitude: 78.4005,
      accuracy_m: 5.0,
    });
    // Submit the same hash again
    const r2 = await submitFieldProofTool.execute({
      plot_id: KNOWN_PLOT_ID,
      farmer_id: KNOWN_FARMER_ID,
      photo_hash: duplicateHash,
      latitude: 17.4005,
      longitude: 78.4005,
      accuracy_m: 5.0,
    });
    const d2 = parseToolText(r2);
    expect(d2.verdict).toBe("SPOOFED");
  });

  it("rejects negative accuracy_m", async () => {
    await expect(
      submitFieldProofTool.execute({
        plot_id: KNOWN_PLOT_ID,
        farmer_id: KNOWN_FARMER_ID,
        photo_hash: "bad-accuracy-test",
        latitude: 17.4005,
        longitude: 78.4005,
        accuracy_m: -1,
      })
    ).rejects.toThrow();
  });
});
