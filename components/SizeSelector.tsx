'use client';

interface SizeSelectorProps {
  targetMB: number | null;
  onTargetChange: (mb: number | null) => void;
}

const presets = [
  { label: 'Under 25MB (Email)', value: 25 },
  { label: 'Under 10MB', value: 10 },
  { label: 'Under 5MB', value: 5 },
];

export default function SizeSelector({ targetMB, onTargetChange }: SizeSelectorProps) {
  const isPreset = presets.some(p => p.value === targetMB);
  const customValue = !isPreset && targetMB !== null ? targetMB : '';

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      onTargetChange(null);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num) && num > 0) {
        onTargetChange(num);
      }
    }
  };

  return (
    <div className="w-full space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        Target Size
      </label>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => onTargetChange(preset.value)}
            className={`
              px-4 py-2 rounded-lg font-medium text-sm transition-all
              ${targetMB === preset.value
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">or</span>
        <div className="flex items-center">
          <input
            type="number"
            min="0.1"
            step="0.1"
            placeholder="Custom"
            value={customValue}
            onChange={handleCustomChange}
            className={`
              w-24 px-3 py-2 border rounded-l-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              ${!isPreset && targetMB !== null
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300'
              }
            `}
          />
          <span className={`
            px-3 py-2 border border-l-0 rounded-r-lg text-sm bg-gray-50
            ${!isPreset && targetMB !== null
              ? 'border-blue-500'
              : 'border-gray-300'
            }
          `}>
            MB
          </span>
        </div>
      </div>
    </div>
  );
}
