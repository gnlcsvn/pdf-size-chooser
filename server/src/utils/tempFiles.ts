import { promises as fs } from 'fs';
import path from 'path';

const TEMP_DIR = process.env.TEMP_DIR || '/tmp/pdf-jobs';

/**
 * Ensure temp directory exists
 */
export async function ensureTempDir(): Promise<void> {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }
}

/**
 * Get the temp directory path
 */
export function getTempDir(): string {
  return TEMP_DIR;
}

/**
 * Get path for a job's files
 */
export function getJobPath(jobId: string, filename: string): string {
  return path.join(TEMP_DIR, `${jobId}_${filename}`);
}

/**
 * Clean up all files for a specific job
 */
export async function cleanupJob(jobId: string): Promise<void> {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const jobFiles = files.filter(f => f.startsWith(`${jobId}_`));

    for (const file of jobFiles) {
      try {
        await fs.unlink(path.join(TEMP_DIR, file));
      } catch {}
    }
  } catch (err) {
    console.error(`Failed to cleanup job ${jobId}:`, err);
  }
}

/**
 * Clean up files older than specified minutes
 */
export async function cleanupOldFiles(maxAgeMinutes: number): Promise<void> {
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      } catch {}
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old temp files`);
    }
  } catch (err) {
    console.error('Failed to cleanup old files:', err);
  }
}

/**
 * Get file size if it exists
 */
export async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return null;
  }
}
