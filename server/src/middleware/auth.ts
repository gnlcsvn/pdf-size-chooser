import { Request, Response, NextFunction } from 'express';

const API_KEY = process.env.API_KEY;

/**
 * Middleware to validate API key from X-API-Key header
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth if no API key is configured (development mode)
  if (!API_KEY) {
    console.warn('Warning: No API_KEY configured. Running in development mode without authentication.');
    next();
    return;
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  if (providedKey !== API_KEY) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  next();
}
