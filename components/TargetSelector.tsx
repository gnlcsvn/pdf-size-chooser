'use client';

import { useState } from 'react';

interface PlatformPreset {
  id: string;
  name: string;
  limitMB: number;
}

interface PlatformCategory {
  name: string;
  platforms: PlatformPreset[];
}

const platformCategories: PlatformCategory[] = [
  {
    name: 'EMAIL',
    platforms: [
      { id: 'gmail', name: 'Gmail', limitMB: 25 },
      { id: 'outlook', name: 'Outlook', limitMB: 20 },
      { id: 'yahoo', name: 'Yahoo', limitMB: 25 },
      { id: 'icloud', name: 'iCloud', limitMB: 20 },
      { id: 'protonmail', name: 'ProtonMail', limitMB: 25 },
    ],
  },
  {
    name: 'CHAT',
    platforms: [
      { id: 'slack', name: 'Slack', limitMB: 25 },
      { id: 'discord', name: 'Discord', limitMB: 25 },
      { id: 'whatsapp', name: 'WhatsApp', limitMB: 100 },
      { id: 'messenger', name: 'Messenger', limitMB: 25 },
      { id: 'linkedin', name: 'LinkedIn', limitMB: 20 },
    ],
  },
];

export type TargetSelection =
  | { type: 'platform'; platformId: string; platformName: string; targetMB: number }
  | { type: 'custom'; targetMB: number };

interface TargetSelectorProps {
  originalSizeMB: number;
  minimumAchievableMB?: number;
  selectedTarget: TargetSelection | null;
  onTargetSelect: (target: TargetSelection) => void;
}

export default function TargetSelector({
  originalSizeMB,
  minimumAchievableMB,
  selectedTarget,
  onTargetSelect,
}: TargetSelectorProps) {
  const [customValue, setCustomValue] = useState<string>('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Filter platforms that make sense (file is larger than the limit)
  const getRelevantCategories = () => {
    return platformCategories
      .map((category) => ({
        ...category,
        platforms: category.platforms.filter((p) => p.limitMB < originalSizeMB),
      }))
      .filter((category) => category.platforms.length > 0);
  };

  const relevantCategories = getRelevantCategories();

  const handlePlatformSelect = (platform: PlatformPreset) => {
    onTargetSelect({
      type: 'platform',
      platformId: platform.id,
      platformName: platform.name,
      targetMB: platform.limitMB,
    });
    setCustomValue('');
    setCustomError(null);
  };

  const handleCustomChange = (value: string) => {
    setCustomValue(value);
    setCustomError(null);

    const numValue = parseFloat(value);
    if (value === '') {
      return;
    }

    if (isNaN(numValue) || numValue <= 0) {
      setCustomError('Enter a valid number');
      return;
    }

    if (numValue >= originalSizeMB) {
      setCustomError(`Must be less than ${originalSizeMB.toFixed(1)} MB`);
      return;
    }

    if (numValue < 0.5) {
      setCustomError('Minimum is 0.5 MB');
      return;
    }

    // Valid - select it
    onTargetSelect({
      type: 'custom',
      targetMB: numValue,
    });
  };

  const isSelected = (platformId: string) => {
    return selectedTarget?.type === 'platform' && selectedTarget.platformId === platformId;
  };

  const isCustomSelected = selectedTarget?.type === 'custom';

  // Check if a target needs splitting (can't be achieved with compression alone)
  const needsSplit = (targetMB: number) => {
    if (!minimumAchievableMB) return false;
    return targetMB < minimumAchievableMB;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-700 text-center">
        Where are you sending this?
      </p>

      {/* Platform Categories */}
      {relevantCategories.map((category) => (
        <div key={category.name} className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {category.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {category.platforms.map((platform) => {
              const selected = isSelected(platform.id);
              const requiresSplit = needsSplit(platform.limitMB);

              return (
                <button
                  key={platform.id}
                  onClick={() => handlePlatformSelect(platform)}
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${selected
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                  title={requiresSplit ? `Will need to split into multiple files` : undefined}
                >
                  {platform.name}
                  <span className={`ml-1 ${selected ? 'text-blue-100' : 'text-gray-400'}`}>
                    {platform.limitMB}MB
                  </span>
                  {requiresSplit && !selected && (
                    <span className="ml-1 text-xs text-amber-500">✂️</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Show message if file is already small */}
      {relevantCategories.length === 0 && (
        <div className="text-center py-4 text-gray-500 text-sm">
          Your file ({originalSizeMB.toFixed(1)} MB) is already small enough for most platforms.
          <br />
          Use a custom target or quality setting below.
        </div>
      )}

      {/* Custom Input */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          CUSTOM
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-[150px]">
            <input
              type="number"
              step="0.5"
              min="0.5"
              max={originalSizeMB - 0.1}
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="Enter size"
              className={`
                w-full px-3 py-2 rounded-lg border-2 text-sm
                ${isCustomSelected && !customError
                  ? 'border-blue-500 bg-blue-50'
                  : customError
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-white'
                }
                focus:outline-none focus:ring-2 focus:ring-blue-200
              `}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              MB
            </span>
          </div>
          {isCustomSelected && !customError && (
            <span className="text-green-600 text-sm">Selected</span>
          )}
        </div>
        {customError && (
          <p className="text-xs text-red-500">{customError}</p>
        )}
      </div>

      {/* Selected target summary */}
      {selectedTarget && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            {selectedTarget.type === 'platform' ? (
              <>
                Compressing for <span className="font-semibold">{selectedTarget.platformName}</span>{' '}
                (under {selectedTarget.targetMB} MB)
              </>
            ) : (
              <>
                Compressing to <span className="font-semibold">{selectedTarget.targetMB} MB</span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
