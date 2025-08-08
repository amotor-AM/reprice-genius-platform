import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";
import { createExperiment } from "./experiment_manager";

export interface AutoRunExperimentRequest {
  hypothesisId: string;
}

export interface AutoRunExperimentResponse {
  experimentId: string;
  message: string;
}

// Runs an autonomous experiment based on a generated hypothesis.
export const autoRunExperiment = api<AutoRunExperimentRequest, AutoRunExperimentResponse>(
  { auth: true, expose: true, method: "POST", path: "/learning/experiment/auto-run" },
  async (req) => {
    const auth = getAuthData()!;

    const hypothesis = await learningDB.queryRow`
      SELECT * FROM hypotheses WHERE id = ${req.hypothesisId} AND user_id = ${auth.userID}
    `;

    if (!hypothesis) {
      throw APIError.notFound("Hypothesis not found.");
    }

    // Translate hypothesis into an experiment config (simplified)
    const experimentConfig = {
      name: `Auto-Experiment for: ${hypothesis.description.substring(0, 50)}`,
      experimentType: 'ab_test',
      strategies: [
        // Control group
        { id: 'control', name: 'Control (No Change)', description: 'Maintain current strategy', config: {} },
        // Test group
        { id: 'test_group', name: 'Hypothesis Test Strategy', description: hypothesis.testableAction, config: {} }
      ],
      successMetric: 'revenue',
      maxDurationDays: 14,
    };

    const experimentResponse = await createExperiment.call(experimentConfig);

    // Mark hypothesis as being tested
    await learningDB.exec`
      UPDATE hypotheses SET status = 'testing' WHERE id = ${req.hypothesisId}
    `;
    await learningDB.exec`
      INSERT INTO hypothesis_tests (hypothesis_id, experiment_id)
      VALUES (${req.hypothesisId}, ${experimentResponse.experimentId})
    `;

    return {
      experimentId: experimentResponse.experimentId,
      message: "Autonomous experiment created and will start shortly."
    };
  }
);
