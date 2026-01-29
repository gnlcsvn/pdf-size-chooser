import { Router } from 'express';
import { execSync } from 'child_process';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  let ghostscriptVersion = 'not installed';

  try {
    const output = execSync('gs --version', { encoding: 'utf-8' });
    ghostscriptVersion = output.trim();
  } catch {
    // Ghostscript not available
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ghostscript: ghostscriptVersion,
    uptime: process.uptime(),
  });
});
