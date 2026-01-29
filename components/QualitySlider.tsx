'use client';

interface QualitySliderProps {
  quality: number;
  onQualityChange: (quality: number) => void;
}

export default function QualitySlider({ quality, onQualityChange }: QualitySliderProps) {
  return (
    <div className="w-full space-y-3">
      <div className="flex justify-between items-center">
        <label className="block text-sm font-medium text-gray-700">
          Quality Preference
        </label>
        <span className="text-sm font-semibold text-blue-600">
          {quality}%
        </span>
      </div>

      <input
        type="range"
        min="1"
        max="100"
        value={quality}
        onChange={(e) => onQualityChange(parseInt(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />

      <div className="flex justify-between text-xs text-gray-500">
        <span>Smaller file</span>
        <span>Better quality</span>
      </div>
    </div>
  );
}
