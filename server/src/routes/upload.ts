import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { createJob } from '../services/jobQueue.js';
import { getTempDir, ensureTempDir } from '../utils/tempFiles.js';
import { MB } from '../utils/sizeUtils.js';

export const uploadRouter = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureTempDir();
    cb(null, getTempDir());
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload_${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 250 * MB, // 250MB max (decimal)
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF files
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

/**
 * POST /api/upload
 * Upload a PDF file and create a new job
 */
uploadRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const job = await createJob(
      req.file.originalname,
      req.file.size,
      req.file.path
    );

    res.status(201).json({
      jobId: job.id,
      status: job.status,
      originalFilename: job.originalFilename,
      originalSize: job.originalSize,
      message: 'Upload successful. Estimating compression sizes...',
    });
  } catch (err) {
    next(err);
  }
});

// Error handling for multer
uploadRouter.use((err: Error, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 250MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message === 'Only PDF files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});
