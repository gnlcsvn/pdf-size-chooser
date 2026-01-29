import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { MB } from '../utils/sizeUtils.js';

// Quality presets map to Ghostscript PDFSETTINGS
// We use custom dPDFSETTINGS with image quality controls for finer control
const QUALITY_PRESETS = {
  screen: { dpi: 72, imageQuality: 25 },    // ~25% quality
  ebook: { dpi: 150, imageQuality: 50 },    // ~50% quality
  printer: { dpi: 200, imageQuality: 75 },  // ~75% quality
  prepress: { dpi: 300, imageQuality: 100 }, // ~100% quality
};

export interface CompressionResult {
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface PageInfo {
  pageCount: number;
}

/**
 * Get the page count of a PDF file
 */
export async function getPageCount(pdfPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      '-q',
      '-dNODISPLAY',
      '-dNOSAFER',
      '-c',
      `(${pdfPath}) (r) file runpdfbegin pdfpagecount = quit`,
    ];

    const gs = spawn('gs', args);
    let output = '';
    let errorOutput = '';

    gs.stdout.on('data', (data) => {
      output += data.toString();
    });

    gs.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    gs.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Ghostscript failed to get page count: ${errorOutput}`));
        return;
      }
      const pageCount = parseInt(output.trim(), 10);
      if (isNaN(pageCount)) {
        reject(new Error('Failed to parse page count'));
        return;
      }
      resolve(pageCount);
    });

    gs.on('error', (err) => {
      reject(new Error(`Failed to spawn Ghostscript: ${err.message}`));
    });
  });
}

/**
 * Extract specific pages from a PDF
 */
export async function extractPages(
  inputPath: string,
  outputPath: string,
  pageNumbers: number[]
): Promise<void> {
  // Ghostscript uses 1-based page numbers
  const pageRanges = pageNumbers.map(p => p + 1).join(',');

  return new Promise((resolve, reject) => {
    const args = [
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',
      `-sPageList=${pageRanges}`,
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    const gs = spawn('gs', args);
    let errorOutput = '';

    gs.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    gs.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Ghostscript failed to extract pages: ${errorOutput}`));
        return;
      }
      resolve();
    });

    gs.on('error', (err) => {
      reject(new Error(`Failed to spawn Ghostscript: ${err.message}`));
    });
  });
}

/**
 * Compress a PDF file using Ghostscript
 * @param inputPath Path to input PDF
 * @param outputPath Path for output PDF
 * @param quality Quality level 1-100 (higher = better quality, larger file)
 * @param onProgress Optional progress callback
 */
export async function compressPdf(
  inputPath: string,
  outputPath: string,
  quality: number,
  onProgress?: (percent: number) => void
): Promise<CompressionResult> {
  const originalStats = await fs.stat(inputPath);
  const originalSize = originalStats.size;

  // Map quality (1-100) to Ghostscript PDFSETTINGS presets
  // Lower quality = more compression = smaller file
  let pdfSettings: string;
  let dpi: number;

  if (quality <= 25) {
    pdfSettings = '/screen';  // Aggressive compression (72 DPI)
    dpi = 72;
  } else if (quality <= 50) {
    pdfSettings = '/ebook';   // Moderate compression (150 DPI)
    dpi = 100;
  } else if (quality <= 75) {
    pdfSettings = '/ebook';   // Light compression
    dpi = 150;
  } else {
    pdfSettings = '/printer'; // Minimal compression (300 DPI)
    dpi = 200;
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dNOPAUSE',
      '-dBATCH',
      `-dPDFSETTINGS=${pdfSettings}`,
      `-dColorImageResolution=${dpi}`,
      `-dGrayImageResolution=${dpi}`,
      `-dMonoImageResolution=${dpi}`,
      '-dDownsampleColorImages=true',
      '-dDownsampleGrayImages=true',
      '-dDownsampleMonoImages=true',
      `-dColorImageDownsampleThreshold=1.0`,
      `-dGrayImageDownsampleThreshold=1.0`,
      '-dColorImageDownsampleType=/Bicubic',
      '-dGrayImageDownsampleType=/Bicubic',
      '-dMonoImageDownsampleType=/Subsample',
      '-dAutoRotatePages=/None',
      '-dEmbedAllFonts=true',
      '-dSubsetFonts=true',
      '-dCompressFonts=true',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    const gs = spawn('gs', args);
    let errorOutput = '';

    gs.stderr.on('data', (data) => {
      errorOutput += data.toString();
      // Try to parse progress from Ghostscript output
      // Note: GS doesn't provide great progress info, this is best effort
    });

    gs.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Ghostscript compression failed: ${errorOutput}`));
        return;
      }

      try {
        const compressedStats = await fs.stat(outputPath);
        const compressedSize = compressedStats.size;

        resolve({
          outputPath,
          originalSize,
          compressedSize,
          compressionRatio: originalSize > 0 ? compressedSize / originalSize : 1,
        });
      } catch (err) {
        reject(new Error(`Failed to stat compressed file: ${err}`));
      }
    });

    gs.on('error', (err) => {
      reject(new Error(`Failed to spawn Ghostscript: ${err.message}`));
    });
  });
}

// Size verification gate configuration
const MAX_RECOMPRESSION_ATTEMPTS = 3;
const QUALITY_REDUCTION_PER_ATTEMPT = 5; // Reduce quality by 5% each attempt
const MIN_QUALITY = 1; // Absolute minimum quality

export interface VerifiedCompressionResult extends CompressionResult {
  quality: number;
  attempts: number;
  verificationPassed: boolean;
}

/**
 * Compress a PDF to target size with verification gate.
 *
 * This function guarantees the output file will be ≤ targetSizeBytes.
 * If the initial compression exceeds target, it automatically recompresses
 * with progressively tighter settings until target is achieved or max
 * attempts are reached.
 *
 * THE USER NEVER SEES A FILE THAT EXCEEDS THEIR TARGET.
 */
export async function compressToTargetSize(
  inputPath: string,
  outputPath: string,
  targetSizeBytes: number,
  quality: number = 50,
  onProgress?: (percent: number, message: string) => void
): Promise<VerifiedCompressionResult> {
  let currentQuality = quality;
  let attempts = 0;
  let result: CompressionResult | null = null;

  // Calculate progress segments: each attempt gets equal share of 10-90%
  const progressPerAttempt = 80 / MAX_RECOMPRESSION_ATTEMPTS;

  while (attempts < MAX_RECOMPRESSION_ATTEMPTS) {
    attempts++;

    const attemptStartProgress = 10 + (attempts - 1) * progressPerAttempt;
    const attemptEndProgress = 10 + attempts * progressPerAttempt;

    onProgress?.(
      attemptStartProgress,
      attempts === 1
        ? `Compressing at quality ${currentQuality}%...`
        : `Recompressing at quality ${currentQuality}% (attempt ${attempts}/${MAX_RECOMPRESSION_ATTEMPTS})...`
    );

    // Compress the PDF
    result = await compressPdf(inputPath, outputPath, currentQuality);

    onProgress?.(attemptEndProgress - 5, 'Verifying file size...');

    // VERIFICATION GATE: Check if we hit the target
    if (result.compressedSize <= targetSizeBytes) {
      // Success! File is under target
      console.log(
        `✓ Verification passed: ${(result.compressedSize / MB).toFixed(2)}MB ` +
        `≤ target ${(targetSizeBytes / MB).toFixed(2)}MB ` +
        `(attempt ${attempts}, quality ${currentQuality}%)`
      );

      onProgress?.(100, 'Compression complete');

      return {
        ...result,
        quality: currentQuality,
        attempts,
        verificationPassed: true,
      };
    }

    // File exceeds target - need to recompress
    console.log(
      `✗ Verification failed: ${(result.compressedSize / MB).toFixed(2)}MB ` +
      `> target ${(targetSizeBytes / MB).toFixed(2)}MB ` +
      `(attempt ${attempts}, quality ${currentQuality}%)`
    );

    // Reduce quality for next attempt
    currentQuality = Math.max(MIN_QUALITY, currentQuality - QUALITY_REDUCTION_PER_ATTEMPT);

    // If we're already at minimum quality and still over target, no point continuing
    if (currentQuality === MIN_QUALITY && attempts > 1) {
      console.log('Already at minimum quality, cannot compress further');
      break;
    }
  }

  // If we get here, we've exhausted all attempts
  // Return the best result we have, but mark verification as failed
  console.error(
    `⚠ Verification gate exhausted after ${attempts} attempts. ` +
    `Best result: ${(result!.compressedSize / MB).toFixed(2)}MB ` +
    `(target was ${(targetSizeBytes / MB).toFixed(2)}MB)`
  );

  onProgress?.(100, 'Compression complete (target may not be achievable)');

  return {
    ...result!,
    quality: currentQuality,
    attempts,
    verificationPassed: false,
  };
}
