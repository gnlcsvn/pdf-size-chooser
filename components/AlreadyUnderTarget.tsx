'use client';

import { formatMB } from '@/lib/sizeUtils';

interface AlreadyUnderTargetProps {
  originalSizeMB: number;
  targetMB: number;
  targetLabel: string;
  onCompressAnyway: () => void;
  onChangeTarget: () => void;
  onStartOver: () => void;
}

export default function AlreadyUnderTarget({
  originalSizeMB,
  targetMB,
  targetLabel,
  onCompressAnyway,
  onChangeTarget,
  onStartOver,
}: AlreadyUnderTargetProps) {
  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-green-800">
              Good news! No compression needed.
            </h3>
            <p className="text-sm text-green-700 mt-1">
              Your file is already <span className="font-semibold">{formatMB(originalSizeMB)}</span>
              {' '}&mdash; under the {formatMB(targetMB)} limit for {targetLabel}.
            </p>
          </div>
        </div>
      </div>

      {/* Info text */}
      <p className="text-sm text-gray-600 text-center">
        You can use your original file as-is, or compress it further.
      </p>

      {/* Primary action - compress anyway */}
      <button
        onClick={onCompressAnyway}
        className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg transition-all"
      >
        Compress anyway for smaller
      </button>

      {/* Secondary actions */}
      <div className="flex gap-2">
        <button
          onClick={onChangeTarget}
          className="flex-1 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Change target
        </button>
        <button
          onClick={onStartOver}
          className="flex-1 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Choose different file
        </button>
      </div>
    </div>
  );
}
