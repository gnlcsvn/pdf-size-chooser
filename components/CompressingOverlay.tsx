'use client';

interface CompressingOverlayProps {
  filename: string;
}

export default function CompressingOverlay({ filename }: CompressingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-sm mx-auto px-4">
        {/* Animated spinner */}
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800">
            Compressing your PDF
          </h2>
          <p className="text-gray-500 text-sm truncate max-w-xs mx-auto">
            {filename}
          </p>
        </div>

        <p className="text-gray-400 text-sm">
          This may take a moment for larger files...
        </p>
      </div>
    </div>
  );
}
