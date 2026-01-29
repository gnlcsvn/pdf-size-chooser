'use client';

import { SplitPart } from '@/lib/api';

interface SplitResultProps {
  parts: SplitPart[];
  originalFilename: string;
  onDownloadPart: (partNumber: number) => void;
  onDownloadAll: () => void;
  onReset: () => void;
}

function formatSize(mb: number): string {
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb * 1024).toFixed(0)} KB`;
}

export default function SplitResult({
  parts,
  originalFilename,
  onDownloadPart,
  onDownloadAll,
  onReset,
}: SplitResultProps) {
  const baseName = originalFilename.replace(/\.pdf$/i, '');

  return (
    <div className="space-y-6">
      {/* Success header */}
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
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Split Complete
        </h3>
        <p className="text-gray-600">
          Your PDF has been split into {parts.length} parts
        </p>
      </div>

      {/* Parts list */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Split Preview:</p>

        {parts.map((part) => (
          <div
            key={part.partNumber}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
          >
            <div className="flex-1">
              <p className="font-medium text-gray-800">
                Part {part.partNumber}: Pages {part.startPage}-{part.endPage}
              </p>
              <p className="text-sm text-gray-500">
                {part.pageCount} pages • {formatSize(part.actualSizeMB ?? part.estimatedSizeMB)}
              </p>
            </div>
            <button
              onClick={() => onDownloadPart(part.partNumber)}
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Download
            </button>
          </div>
        ))}
      </div>

      {/* Download all button */}
      <button
        onClick={onDownloadAll}
        className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
      >
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
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Download All as ZIP
      </button>

      {/* Reset button */}
      <button
        onClick={onReset}
        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
      >
        Compress another PDF
      </button>
    </div>
  );
}
