import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { brainDB } from "./db";
import { makeMasterDecision, gatherInputs } from "./decision_engine";
import { v4 as uuidv4 } from 'uuid';

export interface MakeDecisionRequest {
  listingId: string;
  context: {
    currentPrice: number;
    businessGoal: 'revenue' | 'profit' | 'volume';
  };
}

export interface MakeDecisionResponse {
  decisionId: string;
  decision: any;
}

// Makes a master decision by coordinating all AI services.
export const decide = api<MakeDecisionRequest, MakeDecisionResponse>(
  { auth: true, expose: true, method: "POST", path: "/brain/decide" },
  async (req) => {
    const decisionId = uuidv4();
    
    const inputs = await gatherInputs(req.listingId);
    const decision = makeMasterDecision(inputs, req.context);

    // Store the decision and inputs for audit and explainability
    await brainDB.exec`
      INSERT INTO master_decisions (id, listing_id, decision_type, decision_payload, inputs, confidence, explanation)
      VALUES (${decisionId}, ${req.listingId}, ${decision.decisionType}, ${JSON.stringify(decision.payload)}, ${JSON.stringify(inputs)}, ${decision.confidence}, ${decision.reasoning.join('\n')})
    `;
    
    return {
      decisionId,
      decision,
    };
  }
);
