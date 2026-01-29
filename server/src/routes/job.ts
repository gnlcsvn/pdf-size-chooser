import { Router } from 'express';
import { promises as fs } from 'fs';
import { getJob, queueCompression, deleteJob, getQueueStats } from '../services/jobQueue.js';
import { findBestQuality } from '../services/sampler.js';

export const jobRouter = Router();

/**
 * GET /api/job/:id/status
 * Get the current status of a job
 */
jobRouter.get('/:id/status', async (req, res) => {
  const job = getJob(req.params.id);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json({
    id: job.id,
    status: job.status,
    originalFilename: job.originalFilename,
    originalSize: job.originalSize,
    progress: job.progress,
    progressMessage: job.progressMessage,
    error: job.error,
    compressionResult: job.compressionResult
      ? {
          compressedSize: job.compressionResult.compressedSize,
          quality: job.compressionResult.quality,
          compressionRatio: job.compressionResult.compressedSize / job.originalSize,
        }
      : undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

/**
 * GET /api/job/:id/estimate
 * Get size estimates for a job (after sampling is complete)
 */
jobRouter.get('/:id/estimate', async (req, res) => {
  const job = getJob(req.params.id);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status === 'pending' || job.status === 'estimating') {
    res.status(202).json({
      status: job.status,
      message: 'Estimation in progress. Please poll again.',
    });
    return;
  }

  if (!job.estimates) {
    res.status(200).json({
      status: job.status,
      originalSize: job.originalSize,
      message: 'No estimates available',
      estimates: [],
    });
    return;
  }

  // Format estimates for frontend
  const formattedEstimates = job.estimates.estimates.map((e) => ({
    quality: e.quality,
    estimatedSizeBytes: e.estimatedSize,
    estimatedSizeMB: Number((e.estimatedSize / (1024 * 1024)).toFixed(2)),
  }));

  res.json({
    status: job.status,
    originalSize: job.originalSize,
    originalSizeMB: Number((job.originalSize / (1024 * 1024)).toFixed(2)),
    pageCount: job.estimates.pageCount,
    sampledPages: job.estimates.estimates[0]?.samplePages || 0,
    samplingTimeMs: job.estimates.samplingTimeMs,
    estimates: formattedEstimates,
  });
});

/**
 * POST /api/job/:id/compress
 * Start compression with specified quality or target size
 */
jobRouter.post('/:id/compress', async (req, res) => {
  const job = getJob(req.params.id);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status === 'compressing') {
    res.status(409).json({ error: 'Compression already in progress' });
    return;
  }

  if (job.status === 'done') {
    res.status(409).json({ error: 'Job already completed. Use download endpoint.' });
    return;
  }

  const { quality, targetSizeMB } = req.body;

  // Validate input
  if (!quality && !targetSizeMB) {
    res.status(400).json({ error: 'Either quality or targetSizeMB must be provided' });
    return;
  }

  // Validate quality range
  if (quality !== undefined) {
    const qualityNum = Number(quality);
    if (isNaN(qualityNum) || qualityNum < 1 || qualityNum > 100) {
      res.status(400).json({ error: 'Quality must be a number between 1 and 100' });
      return;
    }
  }

  // Validate targetSizeMB
  if (targetSizeMB !== undefined) {
    const targetNum = Number(targetSizeMB);
    if (isNaN(targetNum) || targetNum <= 0) {
      res.status(400).json({ error: 'targetSizeMB must be a positive number' });
      return;
    }
  }

  let compressionQuality = quality
  let targetSizeBytes: number | undefined;

  if (targetSizeMB) {
    targetSizeBytes = targetSizeMB * 1024 * 1024;

    // If estimates are available, find best quality for target
    if (job.estimates) {
      const best = findBestQuality(job.estimates.estimates, targetSizeBytes);
      if (!best.achievable) {
        // Warn user but still allow compression
        console.log(`Target ${targetSizeMB}MB may not be achievable for job ${job.id}`);
      }
      // Use the recommended quality as starting point
      compressionQuality = best.quality;
    }
  }

  try {
    await queueCompression(job.id, {
      quality: compressionQuality,
      targetSizeBytes,
    });

    res.json({
      message: 'Compression started',
      jobId: job.id,
      quality: compressionQuality,
      targetSizeMB,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to start compression',
    });
  }
});

/**
 * GET /api/job/:id/download
 * Download the compressed PDF
 */
jobRouter.get('/:id/download', async (req, res) => {
  const job = getJob(req.params.id);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status !== 'done' || !job.compressionResult) {
    res.status(400).json({
      error: 'Compression not complete',
      status: job.status,
    });
    return;
  }

  const { outputPath, compressedSize } = job.compressionResult;

  try {
    // Check file exists
    await fs.access(outputPath);

    // Generate download filename
    const originalName = job.originalFilename.replace(/\.pdf$/i, '');
    const downloadName = `${originalName}_compressed.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', compressedSize);

    // Stream the file
    const fileStream = require('fs').createReadStream(outputPath);
    fileStream.pipe(res);
  } catch (err) {
    res.status(404).json({ error: 'Compressed file not found' });
  }
});

/**
 * DELETE /api/job/:id
 * Delete a job and clean up files
 */
jobRouter.delete('/:id', async (req, res) => {
  const job = getJob(req.params.id);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  try {
    await deleteJob(req.params.id);
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to delete job',
    });
  }
});

/**
 * GET /api/job/queue/stats
 * Get queue statistics (admin endpoint)
 */
jobRouter.get('/queue/stats', async (req, res) => {
  const stats = await getQueueStats();

  if (!stats) {
    res.json({
      message: 'Queue not available (running in direct mode)',
      queueEnabled: false,
    });
    return;
  }

  res.json({
    queueEnabled: true,
    ...stats,
  });
});
