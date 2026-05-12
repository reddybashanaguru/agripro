export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

export { getPlatformMetricsTool } from "./metrics.js";
export { getLedgerBalanceTool } from "./ledger.js";
export { listTransactionsTool } from "./transactions.js";
export { initiatePayoutTool } from "./payout.js";
export { checkPlotNDVITool, seedSatelliteObservationTool } from "./ndvi.js";
export { getLandPlotsTool } from "./land-plots.js";
export { submitFieldProofTool } from "./proof.js";

import { getPlatformMetricsTool } from "./metrics.js";
import { getLedgerBalanceTool } from "./ledger.js";
import { listTransactionsTool } from "./transactions.js";
import { initiatePayoutTool } from "./payout.js";
import { checkPlotNDVITool, seedSatelliteObservationTool } from "./ndvi.js";
import { getLandPlotsTool } from "./land-plots.js";
import { submitFieldProofTool } from "./proof.js";

export const allTools: ToolDefinition[] = [
  getPlatformMetricsTool,
  getLedgerBalanceTool,
  listTransactionsTool,
  initiatePayoutTool,
  checkPlotNDVITool,
  seedSatelliteObservationTool,
  getLandPlotsTool,
  submitFieldProofTool,
];
