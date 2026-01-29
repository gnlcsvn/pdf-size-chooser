'use client';

import { useState } from 'react';

interface FeasibilityResultProps {
  targetMB: number;
  targetLabel: string;
  estimatedMB: number;
  minimumAchievableMB?: number;
  originalSizeMB: number;
  pageCount: number;
  onCompress: () => void;
  onChangeTarget: (newTargetMB?: number) => void;
  onSplit?: (pageNumber?: number) => void; // Optional until Issue #6
}

function formatSize(mb: number): string {
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb * 1024).toFixed(0)} KB`;
}

type ImpossibleTargetOption = 'split' | 'compress' | 'different';

export default function FeasibilityResult({
  targetMB,
  targetLabel,
  estimatedMB,
  minimumAchievableMB,
  originalSizeMB,
  pageCount,
  onCompress,
  onChangeTarget,
  onSplit,
}: FeasibilityResultProps) {
  // Determine feasibility
  const isAchievable = estimatedMB <= targetMB;
  const isClose = isAchievable && estimatedMB >= targetMB * 0.95;
  const isMuchSmaller = isAchievable && estimatedMB <= targetMB * 0.7;

  // Calculate split information based on COMPRESSED size (estimatedMB), not original
  // This is the key fix - we use the minimum achievable compressed size
  const compressedSize = minimumAchievableMB || estimatedMB;

  // Leave 10% buffer below target for safety
  const effectiveTarget = targetMB * 0.9;
  const partsNeeded = Math.max(1, Math.ceil(compressedSize / effectiveTarget));

  // Each part will be approximately this size after compression
  const avgPartSize = compressedSize / partsNeeded;

  // Default to 'split' when it's available and compression alone won't work
  const [selectedOption, setSelectedOption] = useState<ImpossibleTargetOption>(
    !isAchievable && onSplit ? 'split' : 'different'
  );
  const [customTargetMB, setCustomTargetMB] = useState<string>(
    minimumAchievableMB ? Math.ceil(minimumAchievableMB).toString() : ''
  );
  const [customTargetError, setCustomTargetError] = useState<string | null>(null);

  // Validate custom target
  const handleCustomTargetChange = (value: string) => {
    setCustomTargetMB(value);
    setCustomTargetError(null);

    const numValue = parseFloat(value);
    if (value && (isNaN(numValue) || numValue <= 0)) {
      setCustomTargetError('Enter a valid number');
    } else if (numValue && numValue < (minimumAchievableMB || 0.5)) {
      setCustomTargetError(`Minimum achievable is ~${formatSize(minimumAchievableMB || 0.5)}`);
    }
  };

  const handleContinue = () => {
    if (selectedOption === 'compress') {
      onCompress();
    } else if (selectedOption === 'different') {
      const numValue = parseFloat(customTargetMB);
      if (!isNaN(numValue) && numValue > 0) {
        onChangeTarget(numValue);
      } else {
        onChangeTarget();
      }
    } else if (selectedOption === 'split' && onSplit) {
      onSplit();
    }
  };

  const isContinueDisabled =
    selectedOption === 'split' && !onSplit || // Split not implemented yet
    (selectedOption === 'different' && (!!customTargetError || !customTargetMB));

  // For impossible targets - show three options
  if (!isAchievable) {
    return (
      <div className="space-y-4">
        {/* Warning banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800">
                {partsNeeded > 1
                  ? `We'll split this into ${partsNeeded} files for ${targetLabel}`
                  : `Your PDF can't be compressed below ~${formatSize(compressedSize)}`
                }
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                {partsNeeded > 1
                  ? `Compresses to ~${formatSize(compressedSize)} total → ${partsNeeded} files of ~${formatSize(avgPartSize)} each`
                  : `Target: ${formatSize(targetMB)} • Minimum achievable: ${formatSize(compressedSize)}`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">How would you like to proceed?</p>

          {/* Option 1: Split (Coming soon) */}
          <label
            className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedOption === 'split'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            } ${!onSplit ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="impossibleOption"
                checked={selectedOption === 'split'}
                onChange={() => setSelectedOption('split')}
                disabled={!onSplit}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">
                    Split into {partsNeeded} files
                  </span>
                  {!onSplit && (
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  ~{formatSize(avgPartSize)} each after compression
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {Math.ceil(pageCount / partsNeeded)} pages per file
                </p>
              </div>
            </div>
          </label>

          {/* Option 2: Compress anyway */}
          <label
            className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedOption === 'compress'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="impossibleOption"
                checked={selectedOption === 'compress'}
                onChange={() => setSelectedOption('compress')}
                className="mt-1"
              />
              <div className="flex-1">
                <span className="font-medium text-gray-800">Compress anyway</span>
                <p className="text-sm text-amber-600 mt-1">
                  ⚠️ Expect severe quality loss. Images may be unreadable.
                </p>
              </div>
            </div>
          </label>

          {/* Option 3: Try different target */}
          <label
            className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedOption === 'different'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="impossibleOption"
                checked={selectedOption === 'different'}
                onChange={() => setSelectedOption('different')}
                className="mt-1"
              />
              <div className="flex-1">
                <span className="font-medium text-gray-800">Try a different target</span>
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min={minimumAchievableMB || 0.5}
                      value={customTargetMB}
                      onChange={(e) => handleCustomTargetChange(e.target.value)}
                      onClick={() => setSelectedOption('different')}
                      placeholder={Math.ceil(compressedSize).toString()}
                      className={`w-24 px-3 py-1.5 rounded border text-sm ${
                        customTargetError
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-blue-200`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      MB
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    Suggested: {formatSize(Math.ceil(compressedSize))}
                  </span>
                </div>
                {customTargetError && (
                  <p className="text-xs text-red-500 mt-1">{customTargetError}</p>
                )}
              </div>
            </div>
          </label>
        </div>

        {/* Continue button */}
        <button
          onClick={handleContinue}
          disabled={isContinueDisabled}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
            isContinueDisabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
          }`}
        >
          Continue
        </button>
      </div>
    );
  }

  // Achievable - show success state
  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-green-800">
              {isClose ? "We can do this, but it'll be close." : "We can do this."}
            </h3>
            <p className="text-sm text-green-700 mt-1">
              Estimated result:{' '}
              <span className="font-semibold">{formatSize(estimatedMB)}</span>
              {isClose && (
                <span className="text-green-600"> (target: {formatSize(targetMB)})</span>
              )}
            </p>
            {isMuchSmaller && (
              <p className="text-sm text-green-600 mt-1">
                Fits in {targetLabel} with plenty of room to spare.
              </p>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={onCompress}
        className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg transition-all"
      >
        Compress PDF
      </button>

      <button
        onClick={() => onChangeTarget()}
        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
      >
        Change target
      </button>
    </div>
  );
}
