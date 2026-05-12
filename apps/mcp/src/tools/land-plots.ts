import { z } from "zod";
import { api } from "../api-client.js";
import type { ToolDefinition } from "./index.js";

const GetLandPlotsSchema = z.object({
  farmer_id: z.string().uuid("farmer_id must be a valid UUID"),
});

export interface LandPlot {
  id: string;
  farmer_id: string;
  plot_name: string;
  soil_type: string;
  area_sqm: number;
  geometry: Record<string, unknown>;
  created_at: string;
}

export const getLandPlotsTool: ToolDefinition = {
  name: "get_land_plots",
  description:
    "List all registered land plots for a farmer, including plot name, soil type, area, and GeoJSON geometry (PostGIS polygon). Used to discover plot IDs before checking NDVI or initiating payouts.",
  inputSchema: {
    type: "object" as const,
    properties: {
      farmer_id: { type: "string", description: "UUID of the farmer" },
    },
    required: ["farmer_id"],
  },
  execute: async (args: Record<string, unknown>) => {
    const { farmer_id } = GetLandPlotsSchema.parse(args);
    const data = await api.get<{ plots: LandPlot[]; count: number }>(
      `/api/v1/land-plots?farmer_id=${farmer_id}`
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            farmer_id,
            plot_count: data.count,
            plots: data.plots.map((p) => ({
              id: p.id,
              name: p.plot_name,
              soil_type: p.soil_type,
              area_sqm: p.area_sqm,
              has_geometry: !!p.geometry,
            })),
          }, null, 2),
        },
      ],
    };
  },
};
