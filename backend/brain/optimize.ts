import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { jobs } from "~encore/clients";
import { brainDB } from "./db";
import { v4 as uuidv4 } from 'uuid';

export interface GlobalOptimizationRequest {
  optimizationGoal: 'maximize_total_profit' | 'maximize_market_share';
}

// Runs a global optimization across all products and strategies.
export const optimizeGlobal = api<GlobalOptimizationRequest, { jobId: string }>(
  { auth: true, expose: true, method: "POST", path: "/brain/optimize/global" },
  async (req) => {
    const optimizationId = uuidv4();
    
    const job = await jobs.scheduleJob({
      jobType: 'global_optimization',
      priority: 'high',
      payload: {
        optimizationId,
        goal: req.optimizationGoal,
      },
    });

    await brainDB.exec`
      INSERT INTO global_optimizations (id, job_id, optimization_goal, status)
      VALUES (${optimizationId}, ${job.jobId}, ${req.optimizationGoal}, 'queued')
    `;

    return { jobId: job.jobId };
  }
);
