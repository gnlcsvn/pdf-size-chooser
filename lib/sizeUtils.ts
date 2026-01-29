/**
 * Size utility functions using DECIMAL (SI) units.
 *
 * IMPORTANT: We use decimal units (1 MB = 1,000,000 bytes) to match what
 * operating systems display. This ensures the size we show matches what
 * users see in Finder/Explorer.
 *
 * Binary units (1 MiB = 1,048,576 bytes) would cause ~5% discrepancy:
 * - A file of 7,500,000 bytes shows as:
 *   - 7.50 MB in macOS Finder (decimal)
 *   - 7.15 MiB using binary units
 *
 * Platform attachment limits (Gmail 25MB, Slack 25MB, etc.) also use decimal.
 */

// Decimal unit multipliers (SI units - what OS and platforms use)
export const KB = 1000;
export const MB = 1000 * 1000;
export const GB = 1000 * 1000 * 1000;

/**
 * Format bytes to human-readable string using decimal units.
 * Matches what users see in their operating system's file manager.
 */
export function formatBytes(bytes: number): string {
  if (bytes < KB) {
    return `${bytes} B`;
  }
  if (bytes < MB) {
    return `${(bytes / KB).toFixed(1)} KB`;
  }
  if (bytes < GB) {
    return `${(bytes / MB).toFixed(2)} MB`;
  }
  return `${(bytes / GB).toFixed(2)} GB`;
}

/**
 * Format megabytes to human-readable string.
 * For values under 1 MB, shows as KB.
 */
export function formatMB(mb: number): string {
  if (mb < 1) {
    return `${(mb * 1000).toFixed(0)} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * Convert megabytes to bytes using decimal units.
 */
export function mbToBytes(mb: number): number {
  return mb * MB;
}

/**
 * Convert bytes to megabytes using decimal units.
 */
export function bytesToMB(bytes: number): number {
  return bytes / MB;
}
