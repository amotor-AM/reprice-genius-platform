import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { orchestrator } from "~encore/clients";

export interface OrchestrateWorkflowRequest {
  workflowType: 'full_portfolio_reprice' | 'market_analysis';
  payload?: any;
}

// Runs a complex, system-wide workflow.
export const orchestrate = api<OrchestrateWorkflowRequest, { correlationId: string }>(
  { auth: true, expose: true, method: "POST", path: "/brain/orchestrate" },
  async (req) => {
    switch (req.workflowType) {
      case 'full_portfolio_reprice':
        return orchestrator.repriceAll(req.payload || {});
      case 'market_analysis':
        return orchestrator.marketAnalysis();
      default:
        throw new Error(`Unsupported workflow type: ${req.workflowType}`);
    }
  }
);
