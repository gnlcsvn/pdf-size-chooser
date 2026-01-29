import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware: 10 requests per minute per IP
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 10 : 100, // 10 in prod, 100 in dev
  message: {
    error: 'Too many requests',
    message: 'Please wait before making more requests. Limit: 10 requests per minute.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers

  // Use IP from X-Forwarded-For header if behind proxy
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           req.ip ||
           'unknown';
  },

  // Skip rate limiting for health checks
  skip: (req) => req.path === '/health',
});
