import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { getJob, updateJob } from '../services/jobQueue.js';
import {
  calculateSplitPlan,
  calculateManualSplitPlan,
  executeSplit,
  checkSinglePageFeasibility,
  SplitPlan,
  SplitResult,
} from '../services/splitter.js';

export const splitRouter = Router();

// Store split results in memory (in production, would be in job object)
const splitResults = new Map<string, SplitResult>();

/**
 * POST /api/split/:jobId/plan
 * Calculate a split plan for a job
 */
splitRouter.post('/:jobId/plan', async (req, res) => {
  const job = getJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const { targetMB, splitAtPage } = req.body;

  if (!targetMB || targetMB <= 0) {
    res.status(400).json({ error: 'targetMB must be a positive number' });
    return;
  }

  const originalSizeMB = job.originalSize / (1024 * 1024);
  const pageCount = job.estimates?.pageCount;

  if (!pageCount) {
    res.status(400).json({ error: 'Job analysis not complete. Please wait for estimation.' });
    return;
  }

  try {
    // Check if splitting is even feasible
    const feasibility = await checkSinglePageFeasibility(
      job.uploadPath,
      targetMB,
      originalSizeMB,
      pageCount
    );

    if (!feasibility.feasible) {
      res.status(200).json({
        feasible: false,
        error: `Average page size (${feasibility.avgPageSizeMB.toFixed(1)}MB) exceeds target. Consider a larger target size.`,
        avgPageSizeMB: feasibility.avgPageSizeMB,
      });
      return;
    }

    // Calculate split plan
    let plan: SplitPlan;

    if (splitAtPage) {
      // Manual split at specific page
      plan = await calculateManualSplitPlan(
        job.uploadPath,
        splitAtPage,
        targetMB,
        originalSizeMB,
        pageCount
      );
    } else {
      // Automatic optimal split
      plan = await calculateSplitPlan(
        job.uploadPath,
        targetMB,
        originalSizeMB,
        pageCount
      );
    }

    // Check if any part exceeds target
    const partsOverTarget = plan.parts.filter(p => p.estimatedSizeMB > targetMB);

    res.json({
      feasible: true,
      plan: {
        totalPages: plan.totalPages,
        totalParts: plan.totalParts,
        targetMB: plan.targetMB,
        parts: plan.parts.map(p => ({
          partNumber: p.partNumber,
          startPage: p.startPage + 1, // Convert to 1-indexed for frontend
          endPage: p.endPage + 1,
          pageCount: p.pageCount,
          estimatedSizeMB: Number(p.estimatedSizeMB.toFixed(2)),
        })),
      },
      warnings: partsOverTarget.length > 0
        ? [`${partsOverTarget.length} part(s) may still exceed target. Consider splitting further.`]
        : [],
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to calculate split plan',
    });
  }
});

/**
 * POST /api/split/:jobId/execute
 * Execute a split plan
 */
splitRouter.post('/:jobId/execute', async (req, res) => {
  const job = getJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const { targetMB, splitAtPage, compress = true, quality = 75 } = req.body;

  if (!targetMB || targetMB <= 0) {
    res.status(400).json({ error: 'targetMB must be a positive number' });
    return;
  }

  const originalSizeMB = job.originalSize / (1024 * 1024);
  const pageCount = job.estimates?.pageCount;

  if (!pageCount) {
    res.status(400).json({ error: 'Job analysis not complete' });
    return;
  }

  try {
    // Calculate split plan
    let plan: SplitPlan;

    if (splitAtPage) {
      plan = await calculateManualSplitPlan(
        job.uploadPath,
        splitAtPage,
        targetMB,
        originalSizeMB,
        pageCount
      );
    } else {
      plan = await calculateSplitPlan(
        job.uploadPath,
        targetMB,
        originalSizeMB,
        pageCount
      );
    }

    // Execute the split
    updateJob(job.id, {
      status: 'compressing',
      progressMessage: 'Splitting PDF...',
    });

    const result = await executeSplit(
      job.uploadPath,
      job.id,
      plan,
      compress,
      quality,
      (message, partNumber) => {
        updateJob(job.id, { progressMessage: message });
      }
    );

    if (!result.success) {
      updateJob(job.id, { status: 'failed', error: result.error });
      res.status(500).json({ error: result.error });
      return;
    }

    // Store split results
    splitResults.set(job.id, result);

    updateJob(job.id, {
      status: 'done',
      progressMessage: 'Split complete',
    });

    res.json({
      success: true,
      parts: result.parts.map(p => ({
        partNumber: p.partNumber,
        startPage: p.startPage + 1,
        endPage: p.endPage + 1,
        pageCount: p.pageCount,
        estimatedSizeMB: Number(p.estimatedSizeMB.toFixed(2)),
        actualSizeMB: p.actualSizeMB ? Number(p.actualSizeMB.toFixed(2)) : undefined,
      })),
    });
  } catch (err) {
    updateJob(job.id, { status: 'failed', error: 'Split failed' });
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Split failed',
    });
  }
});

/**
 * GET /api/split/:jobId/download/:partNumber
 * Download a specific split part
 */
splitRouter.get('/:jobId/download/:partNumber', async (req, res) => {
  const job = getJob(req.params.jobId);
  const partNumber = parseInt(req.params.partNumber, 10);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const result = splitResults.get(job.id);
  if (!result || !result.success) {
    res.status(400).json({ error: 'Split not complete or failed' });
    return;
  }

  const part = result.parts.find(p => p.partNumber === partNumber);
  if (!part || !part.outputPath) {
    res.status(404).json({ error: 'Part not found' });
    return;
  }

  try {
    await fs.access(part.outputPath);

    const baseName = job.originalFilename.replace(/\.pdf$/i, '');
    const downloadName = `${baseName}_part${partNumber}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    const fileStream = require('fs').createReadStream(part.outputPath);
    fileStream.pipe(res);
  } catch (err) {
    res.status(404).json({ error: 'Part file not found' });
  }
});

/**
 * GET /api/split/:jobId/download-all
 * Download all split parts as a ZIP file
 */
splitRouter.get('/:jobId/download-all', async (req, res) => {
  const job = getJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const result = splitResults.get(job.id);
  if (!result || !result.success) {
    res.status(400).json({ error: 'Split not complete or failed' });
    return;
  }

  try {
    const baseName = job.originalFilename.replace(/\.pdf$/i, '');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}_split.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const part of result.parts) {
      if (part.outputPath) {
        const partName = `${baseName}_part${part.partNumber}.pdf`;
        archive.file(part.outputPath, { name: partName });
      }
    }

    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ZIP' });
  }
});

/**
 * GET /api/split/:jobId/status
 * Get split status and results
 */
splitRouter.get('/:jobId/status', async (req, res) => {
  const job = getJob(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const result = splitResults.get(job.id);

  res.json({
    hasSplitResult: !!result,
    success: result?.success ?? false,
    parts: result?.parts.map(p => ({
      partNumber: p.partNumber,
      startPage: p.startPage + 1,
      endPage: p.endPage + 1,
      pageCount: p.pageCount,
      actualSizeMB: p.actualSizeMB ? Number(p.actualSizeMB.toFixed(2)) : undefined,
    })) ?? [],
  });
});
