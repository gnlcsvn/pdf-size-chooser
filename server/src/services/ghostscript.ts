import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

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

/**
 * Compress a PDF to approximately target size
 * Uses binary search to find optimal quality level
 */
export async function compressToTargetSize(
  inputPath: string,
  outputPath: string,
  targetSizeBytes: number,
  minQuality: number = 25,
  maxQuality: number = 100,
  onProgress?: (percent: number, message: string) => void
): Promise<CompressionResult & { quality: number }> {
  const tempDir = path.dirname(outputPath);
  let bestResult: CompressionResult | null = null;
  let bestQuality = minQuality;

  // Binary search for optimal quality
  let low = minQuality;
  let high = maxQuality;
  let iterations = 0;
  const maxIterations = 5; // Limit iterations for performance

  while (low <= high && iterations < maxIterations) {
    const mid = Math.floor((low + high) / 2);
    const tempOutput = path.join(tempDir, `temp_${mid}_${Date.now()}.pdf`);

    onProgress?.(
      Math.round((iterations / maxIterations) * 80),
      `Testing quality ${mid}%...`
    );

    try {
      const result = await compressPdf(inputPath, tempOutput, mid);

      if (result.compressedSize <= targetSizeBytes) {
        // This quality works, try higher quality
        if (!bestResult || result.compressedSize > bestResult.compressedSize) {
          // Clean up previous best
          if (bestResult && bestResult.outputPath !== outputPath) {
            try { await fs.unlink(bestResult.outputPath); } catch {}
          }
          bestResult = result;
          bestQuality = mid;
        }
        low = mid + 1;
      } else {
        // Too big, try lower quality
        high = mid - 1;
        // Clean up this attempt
        try { await fs.unlink(tempOutput); } catch {}
      }
    } catch (err) {
      // Clean up on error
      try { await fs.unlink(tempOutput); } catch {}
      throw err;
    }

    iterations++;
  }

  // If no result met target, use lowest quality
  if (!bestResult) {
    onProgress?.(90, `Compressing at minimum quality ${minQuality}%...`);
    bestResult = await compressPdf(inputPath, outputPath, minQuality);
    bestQuality = minQuality;
  } else if (bestResult.outputPath !== outputPath) {
    // Move best result to final output path
    await fs.rename(bestResult.outputPath, outputPath);
    bestResult.outputPath = outputPath;
  }

  onProgress?.(100, 'Compression complete');

  return {
    ...bestResult,
    quality: bestQuality,
  };
}
