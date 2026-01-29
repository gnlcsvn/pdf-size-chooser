import path from 'path';
import { promises as fs } from 'fs';
import { extractPages, compressPdf, getPageCount } from './ghostscript.js';
import { getTempDir } from '../utils/tempFiles.js';

export interface SplitPart {
  partNumber: number;
  startPage: number; // 0-indexed
  endPage: number; // 0-indexed, inclusive
  pageCount: number;
  estimatedSizeMB: number;
  outputPath?: string;
  actualSizeMB?: number;
}

export interface SplitPlan {
  totalPages: number;
  totalParts: number;
  parts: SplitPart[];
  targetMB: number;
}

export interface SplitResult {
  success: boolean;
  parts: SplitPart[];
  error?: string;
}

/**
 * Calculate how to split a PDF to fit within a target size.
 *
 * Strategy: Distribute pages to balance file sizes, not just page count.
 * We use average bytes per page as an approximation.
 */
export async function calculateSplitPlan(
  inputPath: string,
  targetMB: number,
  originalSizeMB: number,
  pageCount: number
): Promise<SplitPlan> {
  // Calculate average size per page
  const avgPageSizeMB = originalSizeMB / pageCount;

  // Leave 10% buffer below target to account for overhead
  const effectiveTargetMB = targetMB * 0.9;

  // Calculate how many pages can fit in each part
  const pagesPerPart = Math.floor(effectiveTargetMB / avgPageSizeMB);

  // Ensure at least 1 page per part
  const safePagesPerPart = Math.max(1, pagesPerPart);

  // Calculate number of parts needed
  const totalParts = Math.ceil(pageCount / safePagesPerPart);

  // Distribute pages across parts
  const parts: SplitPart[] = [];
  let currentPage = 0;

  for (let i = 0; i < totalParts; i++) {
    const isLastPart = i === totalParts - 1;
    const remainingPages = pageCount - currentPage;

    // For the last part, take all remaining pages
    // For other parts, distribute evenly
    const pagesInThisPart = isLastPart
      ? remainingPages
      : Math.ceil(remainingPages / (totalParts - i));

    const startPage = currentPage;
    const endPage = currentPage + pagesInThisPart - 1;

    // Estimate size based on page count ratio
    const estimatedSizeMB = (pagesInThisPart / pageCount) * originalSizeMB;

    parts.push({
      partNumber: i + 1,
      startPage,
      endPage,
      pageCount: pagesInThisPart,
      estimatedSizeMB,
    });

    currentPage += pagesInThisPart;
  }

  return {
    totalPages: pageCount,
    totalParts,
    parts,
    targetMB,
  };
}

/**
 * Calculate split plan for manual split at a specific page.
 */
export async function calculateManualSplitPlan(
  inputPath: string,
  splitAtPage: number, // 1-indexed (user-friendly)
  targetMB: number,
  originalSizeMB: number,
  pageCount: number
): Promise<SplitPlan> {
  // Convert to 0-indexed
  const splitIndex = splitAtPage - 1;

  // Validate split point
  if (splitIndex < 1 || splitIndex >= pageCount) {
    throw new Error(`Invalid split point. Must be between 2 and ${pageCount}.`);
  }

  const part1Pages = splitIndex;
  const part2Pages = pageCount - splitIndex;

  // Estimate sizes proportionally
  const part1SizeMB = (part1Pages / pageCount) * originalSizeMB;
  const part2SizeMB = (part2Pages / pageCount) * originalSizeMB;

  const parts: SplitPart[] = [
    {
      partNumber: 1,
      startPage: 0,
      endPage: splitIndex - 1,
      pageCount: part1Pages,
      estimatedSizeMB: part1SizeMB,
    },
    {
      partNumber: 2,
      startPage: splitIndex,
      endPage: pageCount - 1,
      pageCount: part2Pages,
      estimatedSizeMB: part2SizeMB,
    },
  ];

  return {
    totalPages: pageCount,
    totalParts: 2,
    parts,
    targetMB,
  };
}

/**
 * Execute the split plan - extract pages and optionally compress.
 */
export async function executeSplit(
  inputPath: string,
  jobId: string,
  plan: SplitPlan,
  compress: boolean = true,
  quality: number = 75,
  onProgress?: (message: string, partNumber: number) => void
): Promise<SplitResult> {
  const tempDir = getTempDir();
  const results: SplitPart[] = [];

  try {
    for (const part of plan.parts) {
      onProgress?.(`Processing part ${part.partNumber} of ${plan.totalParts}...`, part.partNumber);

      // Generate page list (0-indexed)
      const pageNumbers = Array.from(
        { length: part.pageCount },
        (_, i) => part.startPage + i
      );

      // Output path
      const outputPath = path.join(tempDir, `${jobId}_part${part.partNumber}.pdf`);

      // Extract pages
      await extractPages(inputPath, outputPath, pageNumbers);

      // Optionally compress the extracted part
      if (compress) {
        const compressedPath = path.join(tempDir, `${jobId}_part${part.partNumber}_compressed.pdf`);
        await compressPdf(outputPath, compressedPath, quality);

        // Replace uncompressed with compressed
        await fs.unlink(outputPath);
        await fs.rename(compressedPath, outputPath);
      }

      // Get actual file size
      const stats = await fs.stat(outputPath);
      const actualSizeMB = stats.size / (1024 * 1024);

      results.push({
        ...part,
        outputPath,
        actualSizeMB,
      });
    }

    return {
      success: true,
      parts: results,
    };
  } catch (err) {
    return {
      success: false,
      parts: results,
      error: err instanceof Error ? err.message : 'Split failed',
    };
  }
}

/**
 * Check if any single page in the PDF exceeds the target size.
 * This is an edge case where even splitting won't help.
 */
export async function checkSinglePageFeasibility(
  inputPath: string,
  targetMB: number,
  originalSizeMB: number,
  pageCount: number
): Promise<{ feasible: boolean; avgPageSizeMB: number }> {
  const avgPageSizeMB = originalSizeMB / pageCount;

  // If average page size exceeds target, splitting won't help
  // (Note: this is an approximation - some pages may be larger)
  const feasible = avgPageSizeMB < targetMB;

  return { feasible, avgPageSizeMB };
}
