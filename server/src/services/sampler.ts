import path from 'path';
import { promises as fs } from 'fs';
import { getPageCount, extractPages, compressPdf } from './ghostscript.js';
import { getTempDir } from '../utils/tempFiles.js';
import { analyzePdf, PDFAnalysis } from './analyzer.js';

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
  // New analysis data
  analysis?: PDFAnalysis;
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
 * Perform PDF analysis and sample compression to estimate sizes at different quality levels
 */
export async function estimateSizes(
  inputPath: string,
  jobId: string,
  onProgress?: (message: string) => void
): Promise<EstimationResult> {
  const startTime = Date.now();
  const tempDir = getTempDir();
  const originalStats = await fs.stat(inputPath);
  const originalSize = originalStats.size;

  // Run PDF analysis first
  onProgress?.('Analyzing PDF structure...');
  let analysis: PDFAnalysis | undefined;
  try {
    analysis = await analyzePdf(inputPath);
    onProgress?.(`Found ${analysis.images.count} images, ${analysis.fonts.count} fonts`);
  } catch (err) {
    console.error('PDF analysis failed, continuing with basic estimation:', err);
  }

  // Get page count (use analysis result if available)
  const pageCount = analysis?.pageCount ?? await getPageCount(inputPath);
  onProgress?.(`Scanning ${pageCount} pages...`);

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
  onProgress?.('Calculating compression options...');
  for (let i = 0; i < QUALITY_LEVELS.length; i++) {
    const quality = QUALITY_LEVELS[i];
    const compressedSamplePath = path.join(tempDir, `${jobId}_sample_q${quality}.pdf`);

    try {
      onProgress?.(`Testing quality level ${i + 1}/${QUALITY_LEVELS.length}...`);
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
    analysis,
  };
}

/**
 * Find the best quality level to achieve target size based on estimates.
 * Uses linear interpolation between sample points for more precise targeting.
 */
export function findBestQuality(
  estimates: SizeEstimate[],
  targetSizeBytes: number
): { quality: number; estimatedSize: number; achievable: boolean } {
  if (estimates.length === 0) {
    return { quality: 50, estimatedSize: 0, achievable: false };
  }

  // Sort by quality descending (100, 75, 50, 25)
  const sorted = [...estimates].sort((a, b) => b.quality - a.quality);

  // If target is larger than highest quality estimate, use highest quality
  if (targetSizeBytes >= sorted[0].estimatedSize) {
    return {
      quality: sorted[0].quality,
      estimatedSize: sorted[0].estimatedSize,
      achievable: true,
    };
  }

  // If target is smaller than lowest quality estimate, not achievable
  const lowest = sorted[sorted.length - 1];
  if (targetSizeBytes < lowest.estimatedSize) {
    return {
      quality: lowest.quality,
      estimatedSize: lowest.estimatedSize,
      achievable: false,
    };
  }

  // Find the two quality levels that bracket our target and interpolate
  for (let i = 0; i < sorted.length - 1; i++) {
    const higher = sorted[i];     // Higher quality, larger size
    const lower = sorted[i + 1];  // Lower quality, smaller size

    if (targetSizeBytes <= higher.estimatedSize && targetSizeBytes >= lower.estimatedSize) {
      // Linear interpolation between the two quality levels
      const sizeRange = higher.estimatedSize - lower.estimatedSize;
      const qualityRange = higher.quality - lower.quality;

      if (sizeRange === 0) {
        // Same size at both qualities, use lower quality
        return {
          quality: lower.quality,
          estimatedSize: lower.estimatedSize,
          achievable: true,
        };
      }

      // How far between lower and higher size is our target? (0 = at lower, 1 = at higher)
      const sizeRatio = (targetSizeBytes - lower.estimatedSize) / sizeRange;

      // Interpolate quality (higher ratio = higher quality)
      const interpolatedQuality = Math.round(lower.quality + (sizeRatio * qualityRange));

      // Estimate the size at this interpolated quality
      const estimatedSize = Math.round(lower.estimatedSize + (sizeRatio * sizeRange));

      return {
        quality: Math.max(1, Math.min(100, interpolatedQuality)),
        estimatedSize,
        achievable: true,
      };
    }
  }

  // Fallback: use lowest quality
  return {
    quality: lowest.quality,
    estimatedSize: lowest.estimatedSize,
    achievable: false,
  };
}
