import { z } from "zod";
import { api } from "../api-client.js";
import type { ToolDefinition } from "./index.js";

export interface PlatformMetrics {
  farmer_count: number;
  plot_count: number;
  transaction_count: number;
  total_disbursed: string;
  total_ndvi_alerts: number;
  total_proof_records: number;
}

export const getPlatformMetricsTool: ToolDefinition = {
  name: "get_platform_metrics",
  description:
    "Retrieve live Finagra Unity platform KPIs: farmer count, land plots, total disbursed amount (INR), NDVI alerts (plots below 0.30 threshold), GPS proof records, and transaction count.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async (_args: Record<string, unknown>) => {
    const metrics = await api.get<PlatformMetrics>("/api/v1/metrics-platform");
    const disbursedINR = (parseInt(metrics.total_disbursed) / 100).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            summary: `Platform has ${metrics.farmer_count.toLocaleString()} farmers, ${metrics.plot_count} plots, ₹${metrics.total_disbursed} disbursed across ${metrics.transaction_count} transactions. ${metrics.total_ndvi_alerts} NDVI alert(s) active.`,
            metrics: {
              ...metrics,
              total_disbursed_formatted: disbursedINR,
              payout_eligibility: metrics.total_ndvi_alerts === 0 ? "ALL_PLOTS_ELIGIBLE" : `${metrics.total_ndvi_alerts}_PLOTS_BLOCKED`,
            },
          }, null, 2),
        },
      ],
    };
  },
};
