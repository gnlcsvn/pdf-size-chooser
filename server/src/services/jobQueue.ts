import Bull from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { compressPdf, compressToTargetSize } from './ghostscript.js';
import { estimateSizes, EstimationResult, findBestQuality } from './sampler.js';
import { getJobPath, cleanupJob, ensureTempDir } from '../utils/tempFiles.js';
import { PDFAnalysis } from './analyzer.js';

export interface Job {
  id: string;
  status: 'pending' | 'estimating' | 'ready' | 'compressing' | 'done' | 'failed';
  originalFilename: string;
  originalSize: number;
  uploadPath: string;
  estimates?: EstimationResult;
  compressionResult?: {
    outputPath: string;
    compressedSize: number;
    quality: number;
  };
  error?: string;
  progress?: number;
  progressMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory job storage (for MVP - consider Redis for production persistence)
const jobs = new Map<string, Job>();

// Bull queue for compression jobs
let compressionQueue: Bull.Queue | null = null;

/**
 * Initialize the job queue
 */
export function initJobQueue(): void {
  const redisUrl = process.env.REDIS_URL;

  // Only use Bull queue if REDIS_URL is explicitly set
  if (!redisUrl) {
    console.log('REDIS_URL not set - running in direct mode (no job queue)');
    return;
  }

  try {
    compressionQueue = new Bull('pdf-compression', redisUrl, {
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    compressionQueue.process(1, async (bullJob) => {
      const { jobId, quality, targetSizeBytes } = bullJob.data;
      const job = jobs.get(jobId);

      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      updateJob(jobId, { status: 'compressing', progress: 0 });

      const outputPath = getJobPath(jobId, 'compressed.pdf');

      try {
        let result;
        let finalQuality = quality || 75;

        if (targetSizeBytes) {
          // Calculate optimal quality from estimates
          if (job.estimates?.estimates) {
            const bestQuality = findBestQuality(job.estimates.estimates, targetSizeBytes);
            finalQuality = bestQuality.quality;
            console.log(`Target: ${(targetSizeBytes / 1024 / 1024).toFixed(2)}MB, using quality ${finalQuality}%`);
          }

          // Single-pass compression at calculated quality
          result = await compressToTargetSize(
            job.uploadPath,
            outputPath,
            targetSizeBytes,
            finalQuality,
            (progress, message) => {
              updateJob(jobId, { progress, progressMessage: message });
              bullJob.progress(progress);
            }
          );
        } else {
          // Compress at specific quality
          result = await compressPdf(job.uploadPath, outputPath, finalQuality);
        }

        updateJob(jobId, {
          status: 'done',
          progress: 100,
          compressionResult: {
            outputPath: result.outputPath,
            compressedSize: result.compressedSize,
            quality: 'quality' in result ? result.quality : finalQuality,
          },
        });

        return result;
      } catch (err) {
        updateJob(jobId, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Compression failed',
        });
        throw err;
      }
    });

    compressionQueue.on('error', (err) => {
      console.error('Queue error:', err);
    });

    compressionQueue.on('failed', (bullJob, err) => {
      console.error(`Job ${bullJob.data.jobId} failed:`, err);
    });

    console.log('Job queue initialized successfully');
  } catch (err) {
    console.error('Failed to initialize job queue, running without Redis:', err);
    compressionQueue = null;
  }
}

/**
 * Create a new job
 */
export async function createJob(
  originalFilename: string,
  originalSize: number,
  uploadPath: string
): Promise<Job> {
  await ensureTempDir();

  const job: Job = {
    id: uuidv4(),
    status: 'pending',
    originalFilename,
    originalSize,
    uploadPath,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jobs.set(job.id, job);

  // Start estimation in background
  startEstimation(job.id);

  return job;
}

/**
 * Get a job by ID
 */
export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

/**
 * Update a job
 */
export function updateJob(jobId: string, updates: Partial<Job>): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  const updated = {
    ...job,
    ...updates,
    updatedAt: new Date(),
  };
  jobs.set(jobId, updated);
  return updated;
}

/**
 * Start size estimation for a job
 */
async function startEstimation(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  updateJob(jobId, { status: 'estimating', progress: 0 });

  try {
    const estimates = await estimateSizes(job.uploadPath, jobId, (message) => {
      // Update progress message during estimation
      updateJob(jobId, { progressMessage: message });
    });
    updateJob(jobId, {
      status: 'ready',
      estimates,
      progress: 100,
      progressMessage: 'Analysis complete',
    });
  } catch (err) {
    console.error(`Estimation failed for job ${jobId}:`, err);
    updateJob(jobId, {
      status: 'ready', // Still allow compression even if estimation fails
      error: 'Estimation failed, but you can still compress',
    });
  }
}

/**
 * Queue a compression job
 */
export async function queueCompression(
  jobId: string,
  options: { quality?: number; targetSizeBytes?: number }
): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status === 'compressing') {
    throw new Error('Compression already in progress');
  }

  if (compressionQueue) {
    // Use Bull queue
    await compressionQueue.add({
      jobId,
      quality: options.quality || 75,
      targetSizeBytes: options.targetSizeBytes,
    });
  } else {
    // Fallback: run compression directly (no Redis)
    updateJob(jobId, { status: 'compressing', progress: 0 });

    const outputPath = getJobPath(jobId, 'compressed.pdf');

    try {
      let result;
      let finalQuality = options.quality || 75;

      if (options.targetSizeBytes) {
        // Calculate optimal quality from estimates
        if (job.estimates?.estimates) {
          const bestQuality = findBestQuality(job.estimates.estimates, options.targetSizeBytes);
          finalQuality = bestQuality.quality;
          console.log(`Target: ${(options.targetSizeBytes / 1024 / 1024).toFixed(2)}MB, using quality ${finalQuality}%`);
        }

        // Single-pass compression at calculated quality
        result = await compressToTargetSize(
          job.uploadPath,
          outputPath,
          options.targetSizeBytes,
          finalQuality,
          (progress, message) => {
            updateJob(jobId, { progress, progressMessage: message });
          }
        );
      } else {
        result = await compressPdf(job.uploadPath, outputPath, finalQuality);
      }

      updateJob(jobId, {
        status: 'done',
        progress: 100,
        compressionResult: {
          outputPath: result.outputPath,
          compressedSize: result.compressedSize,
          quality: 'quality' in result ? (result as { quality: number }).quality : finalQuality,
        },
      });
    } catch (err) {
      updateJob(jobId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Compression failed',
      });
    }
  }
}

/**
 * Delete a job and clean up its files
 */
export async function deleteJob(jobId: string): Promise<void> {
  await cleanupJob(jobId);
  jobs.delete(jobId);
}

/**
 * Get queue stats
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
} | null> {
  if (!compressionQueue) return null;

  const [waiting, active, completed, failed] = await Promise.all([
    compressionQueue.getWaitingCount(),
    compressionQueue.getActiveCount(),
    compressionQueue.getCompletedCount(),
    compressionQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}
