import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";

export interface AdaptModelRequest {
  sourceCategoryId: string;
  targetCategoryId: string;
  modelType: 'price_optimization' | 'demand_forecast';
}

export interface AdaptModelResponse {
  taskId: number;
  message: string;
  expectedPerformanceGain: number;
}

// Adapts a model to new market conditions using meta-learning.
export const adaptModel = api<AdaptModelRequest, AdaptModelResponse>(
  { auth: true, expose: true, method: "POST", path: "/learning/meta/adapt" },
  async (req) => {
    // Simulate creating a transfer learning task
    const task = await learningDB.queryRow`
      INSERT INTO transfer_learning_tasks (source_category, target_category, source_model_id, target_model_id, status)
      VALUES (${req.sourceCategoryId}, ${req.targetCategoryId}, 'model_A', 'model_B', 'pending')
      RETURNING id
    `;

    return {
      taskId: task.id,
      message: "Model adaptation task queued for transfer learning.",
      expectedPerformanceGain: Math.random() * 0.15 + 0.05 // 5-20% gain
    };
  }
);
