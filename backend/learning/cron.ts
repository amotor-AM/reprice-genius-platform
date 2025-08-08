import { cron } from "encore.dev/cron";
import { learningDB } from "./db";
import { learningTopic } from "../events/topics";

// Cron job to check for completed experiments every hour
export const checkCompletedExperiments = cron("check-experiments", {
  every: "1h",
  handler: async () => {
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
  },
});
