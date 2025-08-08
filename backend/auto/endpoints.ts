import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { autoDB } from "./db";
import { v4 as uuidv4 } from 'uuid';
import { runOptimizationJob } from "./optimization_runner";
import { runAutonomousExperiment } from "./experiment_runner";
import { runHealingTask } from "./healing_runner";

export interface StartOptimizationRequest {
  optimizationType: 'automl' | 'hyperparam_tuning' | 'feature_engineering';
  targetModel: string;
  config?: any;
}

export interface StartOptimizationResponse {
  jobId: string;
  status: string;
}

// Starts an autonomous optimization job.
export const startOptimization = api<StartOptimizationRequest, StartOptimizationResponse>(
  { auth: true, expose: true, method: "POST", path: "/auto/optimize/start" },
  async (req) => {
    const jobId = uuidv4();
    await autoDB.exec`
      INSERT INTO auto_optimization_jobs (id, job_type, status, config)
      VALUES (${jobId}, ${req.optimizationType}, 'pending', ${JSON.stringify(req.config || {})})
    `;

    // Trigger async job
    runOptimizationJob(jobId, req.optimizationType, req.targetModel, req.config)
      .catch(err => console.error(`Optimization job ${jobId} failed:`, err));

    return { jobId, status: 'pending' };
  }
);

export interface RunningExperiment {
  id: string;
  hypothesis: string;
  status: string;
  progress: number;
  startedAt: Date;
}

// Gets currently running autonomous experiments.
export const getRunningExperiments = api<void, { experiments: RunningExperiment[] }>(
  { auth: true, expose: true, method: "GET", path: "/auto/experiments/running" },
  async () => {
    const experiments = await autoDB.queryAll`
      SELECT * FROM auto_experiments WHERE status = 'running'
    `;
    return {
      experiments: experiments.map(e => ({
        id: e.id,
        hypothesis: e.hypothesis,
        status: e.status,
        progress: Math.random() * 100, // Simulated progress
        startedAt: e.created_at,
      })),
    };
  }
);

export interface DiagnoseIssueRequest {
  issueDescription: string;
  context?: any;
}

// Diagnoses a performance issue and suggests a fix.
export const diagnoseIssue = api<DiagnoseIssueRequest, { taskId: string; status: string }>(
  { auth: true, expose: true, method: "POST", path: "/auto/heal/diagnose" },
  async (req) => {
    const taskId = uuidv4();
    await autoDB.exec`
      INSERT INTO auto_healing_tasks (id, issue_description, status, diagnosis)
      VALUES (${taskId}, ${req.issueDescription}, 'diagnosing', ${JSON.stringify(req.context || {})})
    `;

    // Trigger async healing task
    runHealingTask(taskId, req.issueDescription, req.context)
      .catch(err => console.error(`Healing task ${taskId} failed:`, err));

    return { taskId, status: 'diagnosing' };
  }
);

export interface ImprovementSuggestion {
  suggestionId: string;
  title: string;
  description: string;
  expectedImpact: string;
  confidence: number;
  actionableCommand?: any;
}

// Gets AI-generated suggestions for continuous improvement.
export const getImprovementSuggestions = api<void, { suggestions: ImprovementSuggestion[] }>(
  { auth: true, expose: true, method: "POST", path: "/auto/improve/suggest" },
  async () => {
    // This would use AI to analyze performance data and generate suggestions.
    // For now, returning mock data.
    return {
      suggestions: [
        {
          suggestionId: uuidv4(),
          title: "Automate Hyperparameter Tuning for Profit Model",
          description: "The profit maximization model could see a 5-10% performance boost by tuning its hyperparameters.",
          expectedImpact: "+7% profit margin",
          confidence: 0.85,
          actionableCommand: {
            endpoint: '/auto/optimize/start',
            payload: {
              optimizationType: 'hyperparam_tuning',
              targetModel: 'profit_maximization_v1.2',
            },
          },
        },
      ],
    };
  }
);

export interface PerformanceReport {
  reportId: string;
  reportType: string;
  generatedAt: Date;
  summary: any;
  details: any;
}

// Gets the latest autonomous optimization performance report.
export const getPerformanceReport = api<{ reportType?: 'daily' | 'weekly' }, { report: PerformanceReport }>(
  { auth: true, expose: true, method: "GET", path: "/auto/performance/report" },
  async (req) => {
    const reportType = req.reportType || 'daily';
    const report = await autoDB.queryRow`
      SELECT * FROM auto_performance_reports 
      WHERE report_type = ${reportType}
      ORDER BY generated_at DESC
      LIMIT 1
    `;

    if (!report) {
      throw APIError.notFound("No performance report found.");
    }

    return {
      report: {
        reportId: report.id,
        reportType: report.report_type,
        generatedAt: report.generated_at,
        summary: report.summary,
        details: report.details,
      },
    };
  }
);
