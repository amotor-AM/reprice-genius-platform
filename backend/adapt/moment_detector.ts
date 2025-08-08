import { api } from "encore.dev/api";
import { adaptDB } from "./db";

export interface MicroOpportunity {
  id: number;
  type: string;
  entityId: string;
  description: string;
  expiresAt: Date;
  confidence: number;
}

// Gets current micro-opportunities.
export const getMomentOpportunities = api<void, { opportunities: MicroOpportunity[] }>(
  { expose: true, method: "GET", path: "/adapt/moment/opportunities" },
  async () => {
    const opportunities = await adaptDB.queryAll`
      SELECT id, opportunity_type, entity_id, description, expires_at, confidence
      FROM micro_opportunities
      WHERE expires_at > NOW()
      ORDER BY confidence DESC, expires_at ASC
      LIMIT 20
    `;

    return {
      opportunities: opportunities.map(opp => ({
        id: opp.id,
        type: opp.opportunity_type,
        entityId: opp.entity_id,
        description: opp.description,
        expiresAt: opp.expires_at,
        confidence: opp.confidence,
      })),
    };
  }
);
