'use client';

import { SizeEstimate, PDFAnalysis } from '@/lib/api';
import TargetSelector, { TargetSelection } from './TargetSelector';

type CompressionChoice =
  | { type: 'quality'; quality: number }
  | { type: 'target'; targetMB: number; label: string };

interface EstimateDisplayProps {
  estimates: SizeEstimate[];
  originalSizeMB: number;
  pageCount: number;
  analysis?: PDFAnalysis;
  selectedChoice: CompressionChoice | null;
  onChoiceSelect: (choice: CompressionChoice) => void;
}

function formatSize(mb: number): string {
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb * 1024).toFixed(0)} KB`;
}

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
  analysis,
  selectedChoice,
  onChoiceSelect,
}: EstimateDisplayProps) {
  // Sort estimates by quality descending
  const sortedEstimates = [...estimates].sort((a, b) => b.quality - a.quality);

  // Convert TargetSelection to CompressionChoice
  const handleTargetSelect = (target: TargetSelection) => {
    const label = target.type === 'platform'
      ? target.platformName
      : `${target.targetMB} MB`;
    onChoiceSelect({
      type: 'target',
      targetMB: target.targetMB,
      label,
    });
  };

  // Convert CompressionChoice back to TargetSelection for the selector
  const getSelectedTarget = (): TargetSelection | null => {
    if (!selectedChoice || selectedChoice.type !== 'target') return null;

    // Try to find matching platform
    const platforms = [
      { id: 'gmail', name: 'Gmail', limitMB: 25 },
      { id: 'outlook', name: 'Outlook', limitMB: 20 },
      { id: 'yahoo', name: 'Yahoo', limitMB: 25 },
      { id: 'icloud', name: 'iCloud', limitMB: 20 },
      { id: 'protonmail', name: 'ProtonMail', limitMB: 25 },
      { id: 'slack', name: 'Slack', limitMB: 25 },
      { id: 'discord', name: 'Discord', limitMB: 25 },
      { id: 'whatsapp', name: 'WhatsApp', limitMB: 100 },
      { id: 'messenger', name: 'Messenger', limitMB: 25 },
      { id: 'linkedin', name: 'LinkedIn', limitMB: 20 },
    ];

    const matchedPlatform = platforms.find(
      p => p.name === selectedChoice.label && p.limitMB === selectedChoice.targetMB
    );

    if (matchedPlatform) {
      return {
        type: 'platform',
        platformId: matchedPlatform.id,
        platformName: matchedPlatform.name,
        targetMB: matchedPlatform.limitMB,
      };
    }

    return {
      type: 'custom',
      targetMB: selectedChoice.targetMB,
    };
  };

  return (
    <div className="space-y-6">
      {/* PDF Analysis Summary */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div className="text-center">
          <p className="text-gray-600">
            Your PDF has <span className="font-semibold">{pageCount} pages</span> and is currently{' '}
            <span className="font-semibold">{formatSize(originalSizeMB)}</span>
          </p>
        </div>

        {/* Component breakdown - only show if analysis is available */}
        {analysis && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-500 pt-2 border-t border-gray-200">
            {analysis.images.count > 0 && (
              <span>
                {analysis.images.count} image{analysis.images.count !== 1 ? 's' : ''}{' '}
                <span className="text-gray-400">({formatSize(analysis.images.totalSizeMB)})</span>
              </span>
            )}
            {analysis.fonts.count > 0 && (
              <span>
                {analysis.fonts.count} font{analysis.fonts.count !== 1 ? 's' : ''}
              </span>
            )}
            {analysis.compressibleContentMB > 0 && (
              <span className="text-green-600">
                {formatSize(analysis.compressibleContentMB)} compressible
              </span>
            )}
          </div>
        )}

        {/* Minimum achievable size hint */}
        {analysis && analysis.minimumAchievableSizeMB > 0 && (
          <p className="text-xs text-gray-400 text-center">
            Minimum achievable: ~{formatSize(analysis.minimumAchievableSizeMB)}
          </p>
        )}
      </div>

      {/* Target Selection - Platform Presets */}
      <TargetSelector
        originalSizeMB={originalSizeMB}
        minimumAchievableMB={analysis?.minimumAchievableSizeMB}
        selectedTarget={getSelectedTarget()}
        onTargetSelect={handleTargetSelect}
      />

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-3 bg-white text-gray-500">or choose by quality</span>
        </div>
      </div>

      {/* Quality Options */}
      <div className="space-y-2">
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
        Text remains sharp at all levels. Heavy compression affects image quality.
      </p>
    </div>
  );
}

export type { CompressionChoice };
