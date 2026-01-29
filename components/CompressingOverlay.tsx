'use client';

import { useState, useEffect } from 'react';

const funMessages = [
  "Squishing pixels together...",
  "Teaching your PDF to fit in smaller jeans...",
  "Convincing images they don't need all those bytes...",
  "Performing PDF yoga... downward file size...",
  "Asking nicely for some extra space...",
  "Compressing with the power of friendship...",
  "Putting your PDF on a digital diet...",
  "Negotiating with stubborn images...",
  "Applying mathematical shrink-ray...",
  "Reorganizing the digital filing cabinet...",
  "Whispering sweet nothings to your fonts...",
  "Playing Tetris with your data...",
  "Convincing zeros they can be ones (and vice versa)...",
  "Giving your PDF a spa day...",
  "Finding the PDF's inner minimalist...",
  "Politely asking bytes to share seats...",
  "Running the compression hamster wheel...",
  "Deflating without losing the good stuff...",
  "Making your PDF travel-sized...",
  "Crunching numbers (literally)...",
  "Optimizing the optimization optimizer...",
  "Folding space-time (or just file size)...",
  "Removing invisible digital dust...",
  "Casting shrinking spells...",
  "Consulting the compression wizards...",
  "Squeezing bytes through a tiny door...",
  "Rearranging ones and zeros for efficiency...",
  "Making your PDF inbox-friendly...",
  "Applying the Marie Kondo method to bytes...",
  "Finding joy in smaller file sizes...",
  "Teaching old PDFs new tricks...",
  "Performing compression magic...",
  "Trimming the digital hedges...",
  "Putting pixels on a treadmill...",
  "Vacuum-packing your document...",
  "Making every byte count...",
  "Streamlining the stream of data...",
  "Condensing without compromising...",
  "Working some file size wizardry...",
  "Polishing and compacting...",
];

interface CompressingOverlayProps {
  filename: string;
  progress?: number;
  progressMessage?: string;
}

export default function CompressingOverlay({
  filename,
  progress,
  progressMessage
}: CompressingOverlayProps) {
  // Track elapsed time for user feedback
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * funMessages.length)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cycle through fun messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(i => (i + 1) % funMessages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Only show percentage if we have meaningful progress (not just 0 or 100)
  const hasRealProgress = typeof progress === 'number' && progress > 10 && progress < 100;
  const displayProgress = hasRealProgress ? Math.min(100, Math.max(0, progress)) : 0;

  // Format elapsed time
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-sm mx-auto px-4">
        {/* Progress circle or spinner */}
        <div className="relative w-20 h-20 mx-auto">
          {hasRealProgress ? (
            // Circular progress indicator (only when we have real progress)
            <svg className="w-20 h-20 transform -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="#e5e7eb"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="#3b82f6"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - displayProgress / 100)}`}
                className="transition-all duration-300 ease-out"
              />
            </svg>
          ) : (
            // Animated spinner for indeterminate state
            <>
              <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
            </>
          )}
          {/* Percentage in center (only for real progress) */}
          {hasRealProgress && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-semibold text-gray-700">
                {Math.round(displayProgress)}%
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            Compressing your PDF
          </h2>
          <p className="text-gray-500 text-sm truncate max-w-xs mx-auto">
            {filename}
          </p>
        </div>

        {/* Fun message that cycles */}
        <div className="space-y-3">
          <p className="text-blue-600 text-sm font-medium min-h-[20px] transition-opacity duration-300">
            {funMessages[messageIndex]}
          </p>

          {/* Elapsed time */}
          <p className="text-gray-400 text-xs">
            Elapsed: {formatTime(elapsedSeconds)}
          </p>

          {/* Reassuring message for long compressions */}
          {elapsedSeconds > 30 && elapsedSeconds <= 120 && (
            <p className="text-gray-500 text-xs bg-gray-100 rounded-lg px-3 py-2">
              Large files need more time. Still working...
            </p>
          )}
          {elapsedSeconds > 120 && (
            <p className="text-amber-600 text-xs bg-amber-50 rounded-lg px-3 py-2">
              This is a big one! Still crunching away...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
