import path from 'path';
import { promises as fs } from 'fs';
import { getPageCount, extractPages, compressPdf } from './ghostscript.js';
import { getTempDir } from '../utils/tempFiles.js';

export interface SizeEstimate {
  quality: number;
  estimatedSize: number; // in bytes
  sampleSize: number; // actual sample compressed size
  samplePages: number;
  totalPages: number;
}

export interface EstimationResult {
  originalSize: number;
  pageCount: number;
  estimates: SizeEstimate[];
  samplingTimeMs: number;
}

const QUALITY_LEVELS = [100, 75, 50, 25];
const SAMPLE_PERCENTAGE = 0.25; // 25% for better accuracy
const MIN_SAMPLE_PAGES = 2;
const MAX_SAMPLE_PAGES = 20; // Cap to prevent very long sampling on huge documents

/**
 * Select random page indices for sampling
 */
function selectRandomPages(totalPages: number, sampleCount: number): number[] {
  const pages: number[] = [];
  const available = Array.from({ length: totalPages }, (_, i) => i);

  for (let i = 0; i < sampleCount && available.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * available.length);
    pages.push(available[randomIndex]);
    available.splice(randomIndex, 1);
  }

  return pages.sort((a, b) => a - b);
}

/**
 * Perform 10% page sampling and estimate compression sizes at different quality levels
 */
export async function estimateSizes(
  inputPath: string,
  jobId: string
): Promise<EstimationResult> {
  const startTime = Date.now();
  const tempDir = getTempDir();
  const originalStats = await fs.stat(inputPath);
  const originalSize = originalStats.size;

  // Get page count
  const pageCount = await getPageCount(inputPath);

  // Calculate sample size (10% of pages, min 1, max 10)
  let sampleCount = Math.floor(pageCount * SAMPLE_PERCENTAGE);
  sampleCount = Math.max(MIN_SAMPLE_PAGES, Math.min(MAX_SAMPLE_PAGES, sampleCount));

  // For very small documents, just use the whole thing
  if (pageCount <= 3) {
    sampleCount = pageCount;
  }

  const estimates: SizeEstimate[] = [];

  // Select random pages
  const selectedPages = selectRandomPages(pageCount, sampleCount);

  // Extract sample pages
  const samplePath = path.join(tempDir, `${jobId}_sample.pdf`);

  if (sampleCount === pageCount) {
    // Use original file as sample for small docs
    await fs.copyFile(inputPath, samplePath);
  } else {
    await extractPages(inputPath, samplePath, selectedPages);
  }

  // Get the sample file size (before compression)
  const sampleStats = await fs.stat(samplePath);
  const sampleOriginalSize = sampleStats.size;

  // Compress sample at each quality level and extrapolate using compression ratio
  for (const quality of QUALITY_LEVELS) {
    const compressedSamplePath = path.join(tempDir, `${jobId}_sample_q${quality}.pdf`);

    try {
      const result = await compressPdf(samplePath, compressedSamplePath, quality);

      // Calculate compression ratio from the sample
      // ratio = compressed_size / original_size (e.g., 0.5 means 50% of original)
      const compressionRatio = result.compressedSize / sampleOriginalSize;

      // Apply ratio to full original file size
      // But cap it - compressed can never be larger than original
      const estimatedSize = Math.round(Math.min(originalSize, originalSize * compressionRatio));

      estimates.push({
        quality,
        estimatedSize,
        sampleSize: result.compressedSize,
        samplePages: sampleCount,
        totalPages: pageCount,
      });

      // Clean up compressed sample
      await fs.unlink(compressedSamplePath);
    } catch (err) {
      console.error(`Failed to estimate at quality ${quality}:`, err);
      // Continue with other quality levels
    }
  }

  // Clean up sample file
  try {
    await fs.unlink(samplePath);
  } catch {}

  // Ensure estimates are logically ordered: higher quality = larger file
  // Sort by quality ascending, then ensure each lower quality is <= higher quality
  estimates.sort((a, b) => a.quality - b.quality);
  for (let i = 1; i < estimates.length; i++) {
    // If a lower quality estimate is larger than a higher quality one, cap it
    if (estimates[i].estimatedSize < estimates[i - 1].estimatedSize) {
      estimates[i - 1].estimatedSize = estimates[i].estimatedSize;
    }
  }

  const samplingTimeMs = Date.now() - startTime;

  return {
    originalSize,
    pageCount,
    estimates,
    samplingTimeMs,
  };
}

/**
 * Find the best quality level to achieve target size based on estimates
 */
export function findBestQuality(
  estimates: SizeEstimate[],
  targetSizeBytes: number
): { quality: number; estimatedSize: number; achievable: boolean } {
  // Sort by quality descending (prefer higher quality)
  const sorted = [...estimates].sort((a, b) => b.quality - a.quality);

  // Find highest quality that meets target
  for (const estimate of sorted) {
    if (estimate.estimatedSize <= targetSizeBytes) {
      return {
        quality: estimate.quality,
        estimatedSize: estimate.estimatedSize,
        achievable: true,
      };
    }
  }

  // If no quality level achieves target, return lowest quality
  const lowestQuality = sorted[sorted.length - 1];
  return {
    quality: lowestQuality?.quality || 25,
    estimatedSize: lowestQuality?.estimatedSize || 0,
    achievable: false,
  };
}
