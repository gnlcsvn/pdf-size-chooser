'use client';

import { useState } from 'react';
import UploadZone from '@/components/UploadZone';
import SizeSelector from '@/components/SizeSelector';
import QualitySlider from '@/components/QualitySlider';

interface CompressionResult {
  originalSize: number;
  newSize: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [targetMB, setTargetMB] = useState<number | null>(null);
  const [quality, setQuality] = useState(75);
  const [isCompressing, setIsCompressing] = useState(false);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [showToast, setShowToast] = useState(false);

  const canCompress = file !== null && targetMB !== null;

  const handleCompress = async () => {
    if (!canCompress) return;

    setIsCompressing(true);
    setResult(null);

    // Simulate compression delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    setIsCompressing(false);
    setShowToast(true);

    // Hide toast after 3 seconds
    setTimeout(() => setShowToast(false), 3000);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Backend not connected</span>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            PDF Size Chooser
          </h1>
          <p className="text-gray-600">
            Compress PDFs to your exact target size
          </p>
        </header>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-8">
          {/* Upload Zone */}
          <UploadZone file={file} onFileSelect={setFile} />

          {/* Size Selector */}
          <SizeSelector targetMB={targetMB} onTargetChange={setTargetMB} />

          {/* Quality Slider */}
          <QualitySlider quality={quality} onQualityChange={setQuality} />

          {/* Compress Button */}
          <button
            onClick={handleCompress}
            disabled={!canCompress || isCompressing}
            className={`
              w-full py-3 px-4 rounded-lg font-semibold text-white transition-all
              ${canCompress && !isCompressing
                ? 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'
                : 'bg-gray-300 cursor-not-allowed'
              }
            `}
          >
            {isCompressing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Compressing...
              </span>
            ) : (
              'Compress PDF'
            )}
          </button>

          {/* Result Section */}
          {result && (
            <div className="border-t pt-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Compression Complete</h3>
              <div className="flex justify-between items-center bg-gray-50 rounded-lg p-4">
                <div>
                  <p className="text-sm text-gray-500">Original</p>
                  <p className="font-semibold">{formatFileSize(result.originalSize)}</p>
                </div>
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Compressed</p>
                  <p className="font-semibold text-green-600">{formatFileSize(result.newSize)}</p>
                </div>
              </div>
              <button className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors">
                Download Compressed PDF
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center mt-8 text-sm text-gray-400">
          PDF Size Chooser - Internal Tool
        </footer>
      </main>
    </div>
  );
}
