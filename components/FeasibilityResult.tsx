'use client';

interface FeasibilityResultProps {
  targetMB: number;
  targetLabel: string;
  estimatedMB: number;
  minimumAchievableMB?: number;
  onCompress: () => void;
  onChangeTarget: () => void;
}

function formatSize(mb: number): string {
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb * 1024).toFixed(0)} KB`;
}

export default function FeasibilityResult({
  targetMB,
  targetLabel,
  estimatedMB,
  minimumAchievableMB,
  onCompress,
  onChangeTarget,
}: FeasibilityResultProps) {
  // Determine feasibility
  const isAchievable = estimatedMB <= targetMB;
  const isClose = isAchievable && estimatedMB >= targetMB * 0.95; // Within 5% of target
  const isMuchSmaller = isAchievable && estimatedMB <= targetMB * 0.7; // 30%+ smaller than target

  // For impossible targets
  if (!isAchievable) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800">
                This target is too aggressive
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                Your PDF can't be compressed below ~{formatSize(minimumAchievableMB || estimatedMB)} without severe quality loss.
              </p>
              <p className="text-sm text-amber-600 mt-2">
                Best we can achieve: <span className="font-semibold">{formatSize(estimatedMB)}</span>
                {' '}(target: {formatSize(targetMB)})
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onChangeTarget}
            className="flex-1 py-3 px-4 rounded-lg font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            Choose different target
          </button>
          <button
            onClick={onCompress}
            className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Compress anyway
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">
          "Compress anyway" will use maximum compression. Images may be unreadable.
        </p>
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
        onClick={onChangeTarget}
        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
      >
        Change target
      </button>
    </div>
  );
}
