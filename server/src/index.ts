import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { healthRouter } from './routes/health.js';
import { uploadRouter } from './routes/upload.js';
import { jobRouter } from './routes/job.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { initJobQueue } from './services/jobQueue.js';
import { cleanupOldFiles } from './utils/tempFiles.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// Health check (no auth required)
app.use('/health', healthRouter);

// Apply rate limiting and auth to API routes
app.use('/api', rateLimitMiddleware);
app.use('/api', authMiddleware);

// API routes
app.use('/api/upload', uploadRouter);
app.use('/api/job', jobRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize job queue
initJobQueue();

// Start cleanup interval (every 10 minutes)
setInterval(() => {
  cleanupOldFiles(60); // Clean files older than 60 minutes
}, 10 * 60 * 1000);

// Initial cleanup on startup
cleanupOldFiles(60);

app.listen(PORT, () => {
  console.log(`PDF Size Chooser API running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});

export default app;
