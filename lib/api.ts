const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

interface ApiOptions {
  method?: string;
  body?: FormData | string;
  headers?: Record<string, string>;
}

async function apiFetch<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };

  // Add API key if configured
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  // Add Content-Type for JSON bodies
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Types
export interface UploadResponse {
  jobId: string;
  status: string;
  originalFilename: string;
  originalSize: number;
  message: string;
}

export interface SizeEstimate {
  quality: number;
  estimatedSizeBytes: number;
  estimatedSizeMB: number;
}

export interface PDFAnalysis {
  images: {
    count: number;
    totalSizeMB: number;
  };
  fonts: {
    count: number;
    embeddedCount: number;
  };
  metadata: {
    title: string | null;
    hasBookmarks: boolean;
    hasAnnotations: boolean;
    hasForms: boolean;
  };
  compressibleContentMB: number;
  fixedOverheadMB: number;
  minimumAchievableSizeMB: number;
  analysisTimeMs: number;
}

export interface EstimateResponse {
  status: string;
  originalSize: number;
  originalSizeMB: number;
  pageCount: number;
  sampledPages: number;
  samplingTimeMs: number;
  estimates: SizeEstimate[];
  analysis?: PDFAnalysis;
  message?: string;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'estimating' | 'ready' | 'compressing' | 'done' | 'failed';
  originalFilename: string;
  originalSize: number;
  progress?: number;
  progressMessage?: string;
  error?: string;
  compressionResult?: {
    compressedSize: number;
    quality: number;
    compressionRatio: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CompressResponse {
  message: string;
  jobId: string;
  quality: number;
  targetSizeMB?: number;
}

/**
 * Upload a PDF file and start the job
 */
export async function uploadPdf(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  return apiFetch<UploadResponse>('/api/upload', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Get the current status of a job
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return apiFetch<JobStatus>(`/api/job/${jobId}/status`);
}

/**
 * Get size estimates for a job
 */
export async function getEstimates(jobId: string): Promise<EstimateResponse> {
  return apiFetch<EstimateResponse>(`/api/job/${jobId}/estimate`);
}

/**
 * Start compression with a specific quality level
 */
export async function compressWithQuality(
  jobId: string,
  quality: number
): Promise<CompressResponse> {
  return apiFetch<CompressResponse>(`/api/job/${jobId}/compress`, {
    method: 'POST',
    body: JSON.stringify({ quality }),
  });
}

/**
 * Start compression targeting a specific file size
 */
export async function compressToSize(
  jobId: string,
  targetSizeMB: number,
  maxQuality?: number
): Promise<CompressResponse> {
  return apiFetch<CompressResponse>(`/api/job/${jobId}/compress`, {
    method: 'POST',
    body: JSON.stringify({ targetSizeMB, quality: maxQuality }),
  });
}

/**
 * Get the download URL for a completed job
 */
export function getDownloadUrl(jobId: string): string {
  const params = API_KEY ? `?apiKey=${encodeURIComponent(API_KEY)}` : '';
  return `${API_URL}/api/job/${jobId}/download${params}`;
}

/**
 * Download the compressed PDF
 */
export async function downloadPdf(jobId: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const response = await fetch(`${API_URL}/api/job/${jobId}/download`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(error.error || 'Download failed');
  }

  // Create a blob and download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Delete a job and clean up files
 */
export async function deleteJob(jobId: string): Promise<void> {
  await apiFetch(`/api/job/${jobId}`, {
    method: 'DELETE',
  });
}

/**
 * Poll job status until it reaches a target state or fails
 */
export async function pollJobStatus(
  jobId: string,
  targetStatuses: JobStatus['status'][],
  options: {
    interval?: number;
    timeout?: number;
    onProgress?: (status: JobStatus) => void;
  } = {}
): Promise<JobStatus> {
  const { interval = 1000, timeout = 300000, onProgress } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getJobStatus(jobId);
    onProgress?.(status);

    if (targetStatuses.includes(status.status) || status.status === 'failed') {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Polling timeout');
}

/**
 * Poll for estimates to be ready
 */
export async function pollEstimates(
  jobId: string,
  options: {
    interval?: number;
    timeout?: number;
    onProgress?: (status: JobStatus) => void;
  } = {}
): Promise<EstimateResponse> {
  const { interval = 500, timeout = 30000, onProgress } = options;

  // First wait for status to be 'ready'
  await pollJobStatus(jobId, ['ready', 'compressing', 'done'], {
    interval,
    timeout,
    onProgress,
  });

  // Then get estimates
  return getEstimates(jobId);
}

/**
 * Check if the API is healthy
 */
export async function checkHealth(): Promise<{
  status: string;
  ghostscript: string;
}> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error('Backend health check failed');
  }
  return response.json();
}

// ============================================
// Split PDF API
// ============================================

export interface SplitPart {
  partNumber: number;
  startPage: number;
  endPage: number;
  pageCount: number;
  estimatedSizeMB: number;
  actualSizeMB?: number;
}

export interface SplitPlanResponse {
  feasible: boolean;
  error?: string;
  avgPageSizeMB?: number;
  plan?: {
    totalPages: number;
    totalParts: number;
    targetMB: number;
    parts: SplitPart[];
  };
  warnings?: string[];
}

export interface SplitExecuteResponse {
  success: boolean;
  parts: SplitPart[];
  error?: string;
}

/**
 * Calculate a split plan for a PDF
 */
export async function getSplitPlan(
  jobId: string,
  targetMB: number,
  splitAtPage?: number
): Promise<SplitPlanResponse> {
  return apiFetch<SplitPlanResponse>(`/api/split/${jobId}/plan`, {
    method: 'POST',
    body: JSON.stringify({ targetMB, splitAtPage }),
  });
}

/**
 * Execute a split operation
 */
export async function executeSplit(
  jobId: string,
  targetMB: number,
  options: {
    splitAtPage?: number;
    compress?: boolean;
    quality?: number;
  } = {}
): Promise<SplitExecuteResponse> {
  return apiFetch<SplitExecuteResponse>(`/api/split/${jobId}/execute`, {
    method: 'POST',
    body: JSON.stringify({
      targetMB,
      splitAtPage: options.splitAtPage,
      compress: options.compress ?? true,
      quality: options.quality ?? 75,
    }),
  });
}

/**
 * Download a specific split part
 */
export async function downloadSplitPart(
  jobId: string,
  partNumber: number,
  filename: string
): Promise<void> {
  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const response = await fetch(`${API_URL}/api/split/${jobId}/download/${partNumber}`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(error.error || 'Download failed');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Download all split parts as a ZIP
 */
export async function downloadAllSplitParts(
  jobId: string,
  filename: string
): Promise<void> {
  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const response = await fetch(`${API_URL}/api/split/${jobId}/download-all`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(error.error || 'Download failed');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
