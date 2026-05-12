import { z } from "zod";
import { api, FinagraAPIError } from "../api-client.js";
import type { ToolDefinition } from "./index.js";

const CheckNDVISchema = z.object({
  plot_id: z.string().uuid("plot_id must be a valid UUID"),
});

const SeedObservationSchema = z.object({
  plot_id: z.string().uuid(),
  source: z.string().default("Sentinel-2"),
  ndvi_mean: z.string().regex(/^-?\d+(\.\d+)?$/),
  ndvi_min: z.string().regex(/^-?\d+(\.\d+)?$/),
  ndvi_max: z.string().regex(/^-?\d+(\.\d+)?$/),
});

export interface SatelliteObservation {
  id: string;
  plot_id: string;
  source: string;
  observed_at: string;
  ndvi_mean: string;
  ndvi_min: string;
  ndvi_max: string;
  created_at: string;
}

const NDVI_THRESHOLD = 0.3;

function ndviLabel(value: number): string {
  if (value >= 0.5) return "HEALTHY_CROP";
  if (value >= NDVI_THRESHOLD) return "SPARSE_VEGETATION";
  return "BARE_SOIL_OR_STRESS";
}

export const checkPlotNDVITool: ToolDefinition = {
  name: "check_plot_ndvi",
  description:
    "Get the latest satellite NDVI (Normalised Difference Vegetation Index) reading for a land plot. Values ≥ 0.30 allow payout; values < 0.30 trigger a payout block. Source: Sentinel-2 / ISRO ResourceSat, updated every 5 days.",
  inputSchema: {
    type: "object" as const,
    properties: {
      plot_id: { type: "string", description: "UUID of the land plot" },
    },
    required: ["plot_id"],
  },
  execute: async (args: Record<string, unknown>) => {
    const { plot_id } = CheckNDVISchema.parse(args);
    try {
      const obs = await api.get<SatelliteObservation>(`/api/v1/land-plots/${plot_id}/satellite`);
      const mean = parseFloat(obs.ndvi_mean);
      const payoutEligible = mean >= NDVI_THRESHOLD;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              plot_id,
              ndvi: {
                mean: mean.toFixed(4),
                min: parseFloat(obs.ndvi_min).toFixed(4),
                max: parseFloat(obs.ndvi_max).toFixed(4),
              },
              label: ndviLabel(mean),
              payout_eligible: payoutEligible,
              payout_status: payoutEligible ? "ALLOWED" : "BLOCKED — NDVI below 0.30 threshold",
              source: obs.source,
              observed_at: obs.observed_at,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      if (err instanceof FinagraAPIError && err.status === 404) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                plot_id,
                payout_eligible: true,
                payout_status: "ALLOWED — no satellite data, fail-open policy",
                note: "No NDVI observation recorded yet. Payout is not blocked.",
              }, null, 2),
            },
          ],
        };
      }
      throw err;
    }
  },
};

export const seedSatelliteObservationTool: ToolDefinition = {
  name: "seed_satellite_observation",
  description:
    "Seed a satellite NDVI observation for a plot (used for testing or staging ingestion). Simulates a Sentinel-2 / ISRO ResourceSat pass with provided NDVI values.",
  inputSchema: {
    type: "object" as const,
    properties: {
      plot_id: { type: "string", description: "UUID of the land plot" },
      source: { type: "string", description: "Satellite source name (default: Sentinel-2)" },
      ndvi_mean: { type: "string", description: "Mean NDVI as numeric string, e.g. '0.72'" },
      ndvi_min: { type: "string", description: "Min NDVI as numeric string" },
      ndvi_max: { type: "string", description: "Max NDVI as numeric string" },
    },
    required: ["plot_id", "ndvi_mean", "ndvi_min", "ndvi_max"],
  },
  execute: async (args: Record<string, unknown>) => {
    const params = SeedObservationSchema.parse(args);
    const obs = await api.post<SatelliteObservation>("/api/v1/satellite/observations", params);
    const mean = parseFloat(obs.ndvi_mean);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "OBSERVATION_SEEDED",
            observation_id: obs.id,
            plot_id: obs.plot_id,
            ndvi_mean: mean.toFixed(4),
            label: ndviLabel(mean),
            payout_eligible: mean >= NDVI_THRESHOLD,
            source: obs.source,
            observed_at: obs.observed_at,
          }, null, 2),
        },
      ],
    };
  },
};
