import { api } from "encore.dev/api";
import { learningDB } from "./db";
import { learningTopic } from "../events/topics";

// Internal API to check for completed experiments
export const checkCompletedExperiments = api<void, { completed: number }>(
  { method: "POST", path: "/learning/internal/check-experiments" },
  async () => {
    const completedExperiments = await learningDB.queryAll`
      UPDATE pricing_experiments
      SET status = 'completed'
      WHERE status = 'active' AND end_date <= NOW()
      RETURNING id, user_id, results
    `;

    for (const exp of completedExperiments) {
      const results = exp.results as any;
      await learningTopic.publish({
        experimentId: exp.id,
        userId: exp.user_id,
        outcome: results?.significantDifference ? 'conclusive' : 'inconclusive',
        winningStrategyId: results?.leadingStrategy,
        timestamp: new Date(),
      });
    }
    return { completed: completedExperiments.length };
  },
);
