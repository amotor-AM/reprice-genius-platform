import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { jobsDB } from "./db";
import { 
  criticalJobQueue, 
  highJobQueue, 
  mediumJobQueue, 
  lowJobQueue 
} from "./queues";
import { v4 as uuidv4 } from 'uuid';

export interface ScheduleJobRequest {
  jobType: string;
  payload?: any;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  runAt?: Date;
}

export interface ScheduleJobResponse {
  jobId: string;
  status: string;
}

export interface JobStatusResponse {
  id: string;
  jobType: string;
  status: string;
  priority: string;
  payload: any;
  runAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  errorLog?: string;
}

async function scheduleJobLogic(req: ScheduleJobRequest): Promise<ScheduleJobResponse> {
  const jobId = uuidv4();
  const priority = req.priority || 'medium';
  const runAt = req.runAt || new Date();

  // Store job in database
  await jobsDB.exec`
    INSERT INTO jobs (id, job_type, priority, payload, run_at)
    VALUES (${jobId}, ${req.jobType}, ${priority}, ${JSON.stringify(req.payload || {})}, ${runAt})
  `;

  // Publish to the appropriate queue
  const jobPayload = { jobId, jobType: req.jobType, payload: req.payload || {} };
  switch (priority) {
    case 'critical':
      await criticalJobQueue.publish(jobPayload);
      break;
    case 'high':
      await highJobQueue.publish(jobPayload);
      break;
    case 'medium':
      await mediumJobQueue.publish(jobPayload);
      break;
    case 'low':
      await lowJobQueue.publish(jobPayload);
      break;
  }

  return { jobId, status: 'queued' };
}

// Schedules a new background job.
export const scheduleJob = api<ScheduleJobRequest, ScheduleJobResponse>(
  { method: "POST", path: "/jobs/schedule" },
  scheduleJobLogic
);

// Gets the status of a specific job.
export const getJobStatus = api<{ jobId: string }, JobStatusResponse>(
  { auth: true, expose: true, method: "GET", path: "/jobs/status/:jobId" },
  async ({ jobId }) => {
    const job = await jobsDB.queryRow`
      SELECT * FROM jobs WHERE id = ${jobId}
    `;

    if (!job) {
      throw APIError.notFound("Job not found");
    }

    return {
      id: job.id,
      jobType: job.job_type,
      status: job.status,
      priority: job.priority,
      payload: job.payload,
      runAt: job.run_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      retryCount: job.retry_count,
      errorLog: job.error_log,
    };
  }
);

// Cancels a pending job.
export const cancelJob = api<{ jobId: string }, { success: boolean }>(
  { auth: true, expose: true, method: "POST", path: "/jobs/cancel/:jobId" },
  async ({ jobId }) => {
    const result = await jobsDB.queryRow`
      UPDATE jobs 
      SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${jobId} AND status = 'pending'
      RETURNING id
    `;

    if (!result) {
      throw APIError.failedPrecondition("Job not found or already running");
    }

    return { success: true };
  }
);

// Gets job history for the user.
export const getJobHistory = api<{ limit?: number; offset?: number }, { jobs: JobStatusResponse[]; total: number }>(
  { auth: true, expose: true, method: "GET", path: "/jobs/history" },
  async (req) => {
    const limit = req.limit || 20;
    const offset = req.offset || 0;

    // In a multi-tenant app, you'd filter by user_id
    const jobs = await jobsDB.queryAll`
      SELECT * FROM jobs
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalResult = await jobsDB.queryRow`
      SELECT COUNT(*) as total FROM jobs
    `;

    return {
      jobs: jobs.map(job => ({
        id: job.id,
        jobType: job.job_type,
        status: job.status,
        priority: job.priority,
        payload: job.payload,
        runAt: job.run_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        retryCount: job.retry_count,
        errorLog: job.error_log,
      })),
      total: totalResult?.total || 0,
    };
  }
);
