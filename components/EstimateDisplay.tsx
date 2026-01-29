'use client';

import { SizeEstimate } from '@/lib/api';

type CompressionChoice =
  | { type: 'quality'; quality: number }
  | { type: 'target'; targetMB: number; label: string };

interface EstimateDisplayProps {
  estimates: SizeEstimate[];
  originalSizeMB: number;
  pageCount: number;
  selectedChoice: CompressionChoice | null;
  onChoiceSelect: (choice: CompressionChoice) => void;
}

function formatSize(mb: number): string {
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb * 1024).toFixed(0)} KB`;
}

const useCaseOptions = [
  { targetMB: 25, label: 'Email attachment', description: 'Under 25 MB - fits most email limits' },
  { targetMB: 10, label: 'Easy sharing', description: 'Under 10 MB - quick uploads & downloads' },
  { targetMB: 5, label: 'Minimal size', description: 'Under 5 MB - for slow connections' },
];

const qualityDescriptions: Record<number, { label: string; description: string }> = {
  100: {
    label: 'Maximum Quality',
    description: 'Best image clarity, minimal compression',
  },
  75: {
    label: 'Balanced',
    description: 'Good quality for most documents',
  },
  50: {
    label: 'Smaller File',
    description: 'Noticeable on large images, text stays sharp',
  },
  25: {
    label: 'Minimum Size',
    description: 'Best for text-heavy documents',
  },
};

export default function EstimateDisplay({
  estimates,
  originalSizeMB,
  pageCount,
  selectedChoice,
  onChoiceSelect,
}: EstimateDisplayProps) {
  // Sort estimates by quality descending
  const sortedEstimates = [...estimates].sort((a, b) => b.quality - a.quality);

  // Find smallest achievable size
  const smallestEstimate = sortedEstimates[sortedEstimates.length - 1];

  // Filter use cases that are achievable
  const achievableUseCases = useCaseOptions.filter(
    (uc) => smallestEstimate && smallestEstimate.estimatedSizeMB <= uc.targetMB
  );

  // Check if any use case is relevant (file is bigger than smallest target)
  const showUseCases = originalSizeMB > 5;

  return (
    <div className="space-y-6">
      <div className="text-center pb-2">
        <p className="text-gray-600">
          Your PDF has <span className="font-semibold">{pageCount} pages</span> and is currently{' '}
          <span className="font-semibold">{formatSize(originalSizeMB)}</span>
        </p>
      </div>

      {/* Use Case Options */}
      {showUseCases && achievableUseCases.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            I need this file to...
          </p>
          <div className="grid gap-2">
            {achievableUseCases.map((useCase) => {
              const isSelected =
                selectedChoice?.type === 'target' &&
                selectedChoice.targetMB === useCase.targetMB;

              // Find estimated size for this target
              const estimateForTarget = sortedEstimates.find(
                (e) => e.estimatedSizeMB <= useCase.targetMB
              );

              return (
                <button
                  key={useCase.targetMB}
                  onClick={() => onChoiceSelect({
                    type: 'target',
                    targetMB: useCase.targetMB,
                    label: useCase.label
                  })}
                  className={`
                    w-full p-4 rounded-lg border-2 transition-all text-left
                    ${isSelected
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`
                          w-5 h-5 rounded-full border-2 flex items-center justify-center
                          ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}
                        `}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className={`font-medium ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                          {useCase.label}
                        </p>
                        <p className="text-sm text-gray-500">{useCase.description}</p>
                      </div>
                    </div>
                    {estimateForTarget && (
                      <div className="text-right">
                        <p className={`font-semibold ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                          ~{formatSize(estimateForTarget.estimatedSizeMB)}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Divider */}
      {showUseCases && achievableUseCases.length > 0 && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-white text-gray-500">or choose by quality</span>
          </div>
        </div>
      )}

      {/* Quality Options */}
      <div className="space-y-2">
        {!showUseCases && (
          <p className="text-sm font-medium text-gray-700">
            Choose compression level:
          </p>
        )}
        <div className="grid gap-2">
          {sortedEstimates.map((estimate) => {
            const isSelected =
              selectedChoice?.type === 'quality' &&
              selectedChoice.quality === estimate.quality;
            const savings = ((1 - estimate.estimatedSizeMB / originalSizeMB) * 100).toFixed(0);
            const info = qualityDescriptions[estimate.quality] || {
              label: `Quality ${estimate.quality}%`,
              description: '',
            };

            return (
              <button
                key={estimate.quality}
                onClick={() => onChoiceSelect({ type: 'quality', quality: estimate.quality })}
                className={`
                  w-full p-3 rounded-lg border-2 transition-all text-left
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`
                        w-4 h-4 rounded-full border-2 flex items-center justify-center
                        ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}
                      `}
                    >
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className={`font-medium text-sm ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                        {info.label}
                      </p>
                      <p className="text-xs text-gray-500">{info.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold text-sm ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                      {formatSize(estimate.estimatedSizeMB)}
                    </p>
                    <p className="text-xs text-green-600">-{savings}%</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Heavy compression works best for text documents. PDFs with large images may show reduced image clarity.
      </p>
    </div>
  );
}

export type { CompressionChoice };
