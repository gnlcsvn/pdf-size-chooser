'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import UploadZone from '@/components/UploadZone';
import EstimateDisplay, { CompressionChoice } from '@/components/EstimateDisplay';
import FeasibilityResult from '@/components/FeasibilityResult';
import AlreadyUnderTarget from '@/components/AlreadyUnderTarget';
import AnalyzingOverlay from '@/components/AnalyzingOverlay';
import CompressingOverlay from '@/components/CompressingOverlay';
import {
  uploadPdf,
  getJobStatus,
  getEstimates,
  compressWithQuality,
  compressToSize,
  downloadPdf,
  pollJobStatus,
  EstimateResponse,
  checkHealth,
} from '@/lib/api';
import { formatBytes } from '@/lib/sizeUtils';

type AppStatus =
  | 'idle'
  | 'uploading'
  | 'estimating'
  | 'ready'
  | 'compressing'
  | 'done'
  | 'failed';

type FailureType = 'upload' | 'analysis' | 'compression' | null;

interface Toast {
  type: 'success' | 'error' | 'warning';
  message: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<CompressionChoice | null>(null);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<EstimateResponse | null>(null);
  const [compressionResult, setCompressionResult] = useState<{
    compressedSize: number;
    quality: number;
    originalSize: number;
  } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [compressionProgress, setCompressionProgress] = useState<number | null>(null);
  const [compressionMessage, setCompressionMessage] = useState<string | null>(null);
  const [failureType, setFailureType] = useState<FailureType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs to track active polling and prevent race conditions
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  // Cleanup function for polling intervals only
  const cleanupPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  // Cancel current job completely
  const cancelCurrentJob = useCallback(() => {
    cleanupPolling();
    activeJobIdRef.current = null;
  }, [cleanupPolling]);

  // Check backend health on mount
  useEffect(() => {
    checkHealth()
      .then(() => setBackendConnected(true))
      .catch(() => setBackendConnected(false));

    // Cleanup on unmount
    return () => cancelCurrentJob();
  }, [cancelCurrentJob]);

  const showToast = useCallback((type: Toast['type'], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // Using formatBytes from sizeUtils for consistent decimal (SI) units

  const handleFileSelect = useCallback(
    async (selectedFile: File | null) => {
      // Cancel any existing job first
      cancelCurrentJob();

      // Reset state when file changes
      setFile(selectedFile);
      setJobId(null);
      setEstimates(null);
      setCompressionResult(null);
      setSelectedChoice(null);
      setFailureType(null);
      setErrorMessage(null);
      setStatus('idle');

      if (!selectedFile) return;

      if (backendConnected === false) {
        showToast('error', 'Backend not connected. Please try again later.');
        return;
      }

      // Start upload
      setStatus('uploading');

      try {
        const response = await uploadPdf(selectedFile);
        const currentJobId = response.jobId;

        // Track this as the active job
        activeJobIdRef.current = currentJobId;
        setJobId(currentJobId);
        setStatus('estimating');

        // Poll for estimates
        pollIntervalRef.current = setInterval(async () => {
          // Check if this job is still the active one
          if (activeJobIdRef.current !== currentJobId) {
            return;
          }

          try {
            const jobStatus = await getJobStatus(currentJobId);

            // Double-check we're still the active job before updating state
            if (activeJobIdRef.current !== currentJobId) {
              return;
            }

            // Update progress message if available
            if (jobStatus.progressMessage) {
              setProgressMessage(jobStatus.progressMessage);
            }

            if (jobStatus.status === 'ready' || jobStatus.status === 'done') {
              // Final check - if job was cancelled, don't update state
              if (activeJobIdRef.current !== currentJobId) {
                return;
              }

              cleanupPolling();
              setProgressMessage(null);

              try {
                const estimateData = await getEstimates(currentJobId);
                setEstimates(estimateData);
                setStatus('ready');
              } catch (err) {
                setStatus('failed');
                setFailureType('analysis');
                setErrorMessage('Failed to get size estimates');
                showToast('error', 'Failed to get size estimates');
              }
            } else if (jobStatus.status === 'failed') {
              cleanupPolling();
              setStatus('failed');
              setFailureType('analysis');
              const errMsg = jobStatus.error || 'Failed to analyze PDF';
              setErrorMessage(errMsg);
              showToast('error', errMsg);
            }
          } catch (err) {
            // Continue polling on transient errors
          }
        }, 1000);

        // Timeout after 120 seconds
        pollTimeoutRef.current = setTimeout(() => {
          if (activeJobIdRef.current === currentJobId) {
            cleanupPolling();
            setStatus('failed');
            setFailureType('analysis');
            setErrorMessage('Analysis took too long. Please try again.');
            showToast('error', 'Analysis took too long. Please try again.');
          }
        }, 120000);
      } catch (err) {
        cleanupPolling();
        setStatus('failed');
        setFailureType('upload');
        const errMsg = err instanceof Error ? err.message : 'Upload failed';
        setErrorMessage(errMsg);
        showToast('error', errMsg);
      }
    },
    [backendConnected, showToast, cancelCurrentJob, cleanupPolling]
  );

  const handleCompress = useCallback(async () => {
    if (!jobId || !file || !selectedChoice) return;

    setStatus('compressing');
    setCompressionProgress(0);
    setCompressionMessage('Starting compression...');

    try {
      // Start compression based on choice type
      if (selectedChoice.type === 'target') {
        await compressToSize(jobId, selectedChoice.targetMB);
      } else {
        await compressWithQuality(jobId, selectedChoice.quality);
      }

      // Poll for completion with progress tracking
      const finalStatus = await pollJobStatus(
        jobId,
        ['done'],
        {
          interval: 500,
          timeout: 300000,
          onProgress: (status) => {
            if (typeof status.progress === 'number') {
              setCompressionProgress(status.progress);
            }
            if (status.progressMessage) {
              setCompressionMessage(status.progressMessage);
            }
          },
        }
      );

      if (finalStatus.status === 'done' && finalStatus.compressionResult) {
        setCompressionResult({
          compressedSize: finalStatus.compressionResult.compressedSize,
          quality: finalStatus.compressionResult.quality,
          originalSize: finalStatus.originalSize,
        });
        setCompressionProgress(null);
        setCompressionMessage(null);
        setStatus('done');
        showToast('success', 'Compression complete!');
      } else if (finalStatus.status === 'failed') {
        setCompressionProgress(null);
        setCompressionMessage(null);
        setStatus('failed');
        setFailureType('compression');
        const errMsg = finalStatus.error || 'Compression failed';
        setErrorMessage(errMsg);
        showToast('error', errMsg);
      }
    } catch (err) {
      setCompressionProgress(null);
      setCompressionMessage(null);
      setStatus('failed');
      setFailureType('compression');
      const errMsg = err instanceof Error ? err.message : 'Compression failed';
      setErrorMessage(errMsg);
      showToast('error', errMsg);
    }
  }, [jobId, file, selectedChoice, showToast]);

  const handleDownload = useCallback(async () => {
    if (!jobId || !file) return;

    try {
      const baseName = file.name.replace(/\.pdf$/i, '');
      await downloadPdf(jobId, `${baseName}_compressed.pdf`);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Download failed'
      );
    }
  }, [jobId, file, showToast]);

  const handleReset = useCallback(() => {
    cancelCurrentJob();
    setFile(null);
    setJobId(null);
    setEstimates(null);
    setCompressionResult(null);
    setSelectedChoice(null);
    setProgressMessage(null);
    setCompressionProgress(null);
    setCompressionMessage(null);
    setFailureType(null);
    setErrorMessage(null);
    setStatus('idle');
  }, [cancelCurrentJob]);

  // Retry handler - keeps file, re-attempts the failed operation
  const handleRetry = useCallback(() => {
    if (!file) {
      handleReset();
      return;
    }

    // Clear error state
    setFailureType(null);
    setErrorMessage(null);

    if (failureType === 'upload' || failureType === 'analysis') {
      // Re-upload and re-analyze
      handleFileSelect(file);
    } else if (failureType === 'compression') {
      // Re-attempt compression (file and estimates are still valid)
      if (jobId && selectedChoice) {
        handleCompress();
      } else {
        // Fallback to re-upload if state is inconsistent
        handleFileSelect(file);
      }
    } else {
      // Unknown failure, try re-uploading
      handleFileSelect(file);
    }
  }, [file, failureType, jobId, selectedChoice, handleFileSelect, handleCompress, handleReset]);

  const canCompress = selectedChoice !== null && status === 'ready';
  const isAnalyzing = status === 'uploading' || status === 'estimating';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Analyzing Overlay */}
      {isAnalyzing && file && (
        <AnalyzingOverlay filename={file.name} progressMessage={progressMessage || undefined} />
      )}

      {/* Compressing Overlay */}
      {status === 'compressing' && file && (
        <CompressingOverlay
          filename={file.name}
          progress={compressionProgress ?? undefined}
          progressMessage={compressionMessage ?? undefined}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in ${
            toast.type === 'success'
              ? 'bg-green-100 border border-green-300 text-green-800'
              : toast.type === 'error'
              ? 'bg-red-100 border border-red-300 text-red-800'
              : 'bg-amber-100 border border-amber-300 text-amber-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : toast.type === 'error' ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Backend Status Banner */}
      {backendConnected === false && (
        <div className="bg-red-500 text-white text-center py-2 text-sm">
          Backend not connected. Compression features unavailable.
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            PDF Size Chooser
          </h1>
          <p className="text-gray-600">
            Compress PDFs to your exact target size
          </p>
        </header>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          {/* Step 1: Upload */}
          {status === 'idle' && (
            <UploadZone
              file={file}
              onFileSelect={handleFileSelect}
              disabled={false}
            />
          )}

          {/* Step 2: Choose compression level */}
          {status === 'ready' && estimates && estimates.estimates.length > 0 && (
            <>
              <EstimateDisplay
                estimates={estimates.estimates}
                originalSizeMB={estimates.originalSizeMB}
                pageCount={estimates.pageCount}
                analysis={estimates.analysis}
                selectedChoice={selectedChoice}
                onChoiceSelect={setSelectedChoice}
              />

              {/* Feasibility Result - shows when target is selected */}
              {selectedChoice && selectedChoice.type === 'target' && (
                // Check if file is already under target
                estimates.originalSizeMB <= selectedChoice.targetMB ? (
                  <AlreadyUnderTarget
                    originalSizeMB={estimates.originalSizeMB}
                    targetMB={selectedChoice.targetMB}
                    targetLabel={selectedChoice.label}
                    onCompressAnyway={handleCompress}
                    onChangeTarget={() => setSelectedChoice(null)}
                    onStartOver={handleReset}
                  />
                ) : (
                  <FeasibilityResult
                    targetMB={selectedChoice.targetMB}
                    targetLabel={selectedChoice.label}
                    estimatedMB={
                      // Find best estimate for this target
                      [...estimates.estimates]
                        .sort((a, b) => b.quality - a.quality)
                        .find(e => e.estimatedSizeMB <= selectedChoice.targetMB)?.estimatedSizeMB
                      || estimates.estimates[estimates.estimates.length - 1]?.estimatedSizeMB
                      || selectedChoice.targetMB
                    }
                    minimumAchievableMB={estimates.analysis?.minimumAchievableSizeMB}
                    onCompress={handleCompress}
                    onChangeTarget={(newTargetMB) => {
                      if (newTargetMB) {
                        // User selected a new target from the impossible target screen
                        setSelectedChoice({
                          type: 'target',
                          targetMB: newTargetMB,
                          label: `${newTargetMB} MB`,
                        });
                      } else {
                        // User wants to go back to selection
                        setSelectedChoice(null);
                      }
                    }}
                  />
                )
              )}

              {/* Quality selection - show compress button directly */}
              {selectedChoice && selectedChoice.type === 'quality' && (
                <>
                  <button
                    onClick={handleCompress}
                    className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg transition-all"
                  >
                    Compress PDF
                  </button>
                  <button
                    onClick={() => setSelectedChoice(null)}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Change selection
                  </button>
                </>
              )}

              {/* No selection yet */}
              {!selectedChoice && (
                <button
                  onClick={handleReset}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Choose a different file
                </button>
              )}
            </>
          )}

          {/* Step 3: Done */}
          {status === 'done' && compressionResult && (
            <div className="space-y-6">
              {/* Success header with checkmark */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>

                {/* Main success message */}
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Done. {formatBytes(compressionResult.compressedSize)}
                </h3>

                {/* "Fits in X with room to spare" message */}
                {selectedChoice?.type === 'target' ? (
                  <p className="text-green-600 font-medium">
                    Fits in {selectedChoice.label} with room to spare.
                  </p>
                ) : (
                  <p className="text-green-600 font-medium">
                    Reduced by {(
                      (1 - compressionResult.compressedSize / compressionResult.originalSize) * 100
                    ).toFixed(0)}%
                  </p>
                )}
              </div>

              {/* Size comparison */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-center items-center gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Original</p>
                    <p className="text-lg font-semibold text-gray-400 line-through">
                      {formatBytes(compressionResult.originalSize)}
                    </p>
                  </div>
                  <svg
                    className="w-5 h-5 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Compressed</p>
                    <p className="text-lg font-semibold text-green-600">
                      {formatBytes(compressionResult.compressedSize)}
                    </p>
                  </div>
                </div>
                <p className="text-center text-sm text-gray-500 mt-2">
                  {((1 - compressionResult.compressedSize / compressionResult.originalSize) * 100).toFixed(0)}% smaller
                </p>
              </div>

              <button
                onClick={handleDownload}
                className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
              >
                Download Compressed PDF
              </button>

              <button
                onClick={handleReset}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Compress another PDF
              </button>
            </div>
          )}

          {/* Error State */}
          {status === 'failed' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-1">
                {failureType === 'upload'
                  ? 'Upload failed'
                  : failureType === 'analysis'
                  ? 'Analysis failed'
                  : failureType === 'compression'
                  ? 'Compression failed'
                  : 'Something went wrong'}
              </h3>
              <p className="text-gray-500 mb-4">
                {errorMessage || "We couldn't process your PDF. Please try again."}
              </p>

              {/* Retry button - keeps file if possible */}
              {file && (
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors mb-2"
                >
                  {failureType === 'compression' ? 'Retry compression' : 'Try again'}
                </button>
              )}

              {/* Try different file button */}
              <button
                onClick={handleReset}
                className="block mx-auto px-6 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {file ? 'Try a different file' : 'Start over'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center mt-8 text-sm text-gray-400">
          PDF Size Chooser - Internal Tool
        </footer>
      </main>
    </div>
  );
}
