/**
 * Size utility functions using DECIMAL (SI) units.
 *
 * IMPORTANT: We use decimal units (1 MB = 1,000,000 bytes) to match what
 * operating systems display. This ensures the size we show matches what
 * users see in Finder/Explorer.
 *
 * Platform attachment limits (Gmail 25MB, Slack 25MB, etc.) also use decimal.
 */

// Decimal unit multipliers (SI units - what OS and platforms use)
export const KB = 1000;
export const MB = 1000 * 1000;
export const GB = 1000 * 1000 * 1000;

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

/**
 * Format bytes to MB with specified decimal places.
 */
export function formatBytesToMB(bytes: number, decimals: number = 2): number {
  return Number((bytes / MB).toFixed(decimals));
}
