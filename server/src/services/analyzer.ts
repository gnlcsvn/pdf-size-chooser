import { PDFDocument, PDFName, PDFDict, PDFRef, PDFStream, PDFArray } from 'pdf-lib';
import { promises as fs } from 'fs';

export interface ImageInfo {
  index: number;
  width: number;
  height: number;
  bitsPerComponent: number;
  colorSpace: string;
  filter: string; // Compression type (DCTDecode = JPEG, FlateDecode = PNG-like, etc.)
  estimatedSize: number; // Estimated size in bytes
}

export interface FontInfo {
  name: string;
  type: string;
  embedded: boolean;
}

export interface PDFAnalysis {
  // Basic info
  pageCount: number;
  originalSize: number;

  // Component breakdown
  images: {
    count: number;
    totalEstimatedSize: number;
    items: ImageInfo[];
  };
  fonts: {
    count: number;
    embeddedCount: number;
    items: FontInfo[];
  };
  metadata: {
    title: string | null;
    author: string | null;
    creator: string | null;
    hasBookmarks: boolean;
    hasAnnotations: boolean;
    hasForms: boolean;
  };

  // Compression analysis
  compressibleContent: number; // Bytes that can be compressed (mainly images)
  fixedOverhead: number; // Bytes that can't be significantly reduced
  minimumAchievableSize: number; // Estimated floor (aggressive compression)

  // Timing
  analysisTimeMs: number;
}

/**
 * Analyze a PDF file to understand its structure and compression potential
 */
export async function analyzePdf(pdfPath: string): Promise<PDFAnalysis> {
  const startTime = Date.now();

  // Read the PDF file
  const pdfBytes = await fs.readFile(pdfPath);
  const originalSize = pdfBytes.length;

  // Load with pdf-lib
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const pageCount = pdfDoc.getPageCount();

  // Extract images
  const images = await extractImageInfo(pdfDoc, pdfBytes);

  // Extract fonts
  const fonts = extractFontInfo(pdfDoc);

  // Extract metadata
  const metadata = extractMetadata(pdfDoc);

  // Calculate compression potential
  const totalImageSize = images.reduce((sum, img) => sum + img.estimatedSize, 0);

  // Images are the main compressible content
  // Text, vectors, and structure are relatively incompressible
  const compressibleContent = totalImageSize;

  // Fixed overhead includes: PDF structure, text, vectors, fonts
  // Rough estimate: everything that's not images
  const fixedOverhead = Math.max(0, originalSize - totalImageSize);

  // Minimum achievable size estimate:
  // - Images can typically be compressed to 10-20% of original with aggressive settings
  // - Fixed content might shrink by 10-30% with better compression
  // This is a conservative estimate
  const minimumImageSize = totalImageSize * 0.15; // 15% of original image size
  const minimumFixedSize = fixedOverhead * 0.85; // 15% reduction in fixed content
  const minimumAchievableSize = Math.round(minimumImageSize + minimumFixedSize);

  const analysisTimeMs = Date.now() - startTime;

  return {
    pageCount,
    originalSize,
    images: {
      count: images.length,
      totalEstimatedSize: totalImageSize,
      items: images,
    },
    fonts: {
      count: fonts.length,
      embeddedCount: fonts.filter(f => f.embedded).length,
      items: fonts,
    },
    metadata,
    compressibleContent,
    fixedOverhead,
    minimumAchievableSize,
    analysisTimeMs,
  };
}

/**
 * Extract information about embedded images in the PDF
 */
async function extractImageInfo(pdfDoc: PDFDocument, pdfBytes: Uint8Array): Promise<ImageInfo[]> {
  const images: ImageInfo[] = [];

  try {
    // Access the internal structure to find XObject images
    const context = pdfDoc.context;

    // Iterate through all indirect objects looking for images
    let imageIndex = 0;

    context.enumerateIndirectObjects().forEach(([ref, obj]) => {
      try {
        if (obj instanceof PDFStream) {
          const dict = obj.dict;
          const subtype = dict.get(PDFName.of('Subtype'));

          if (subtype && subtype.toString() === '/Image') {
            const width = getNumberFromDict(dict, 'Width') || 0;
            const height = getNumberFromDict(dict, 'Height') || 0;
            const bitsPerComponent = getNumberFromDict(dict, 'BitsPerComponent') || 8;

            // Get color space
            const colorSpaceObj = dict.get(PDFName.of('ColorSpace'));
            let colorSpace = 'Unknown';
            if (colorSpaceObj) {
              const csString = colorSpaceObj.toString();
              if (csString.includes('DeviceRGB') || csString.includes('RGB')) {
                colorSpace = 'RGB';
              } else if (csString.includes('DeviceGray') || csString.includes('Gray')) {
                colorSpace = 'Grayscale';
              } else if (csString.includes('DeviceCMYK') || csString.includes('CMYK')) {
                colorSpace = 'CMYK';
              } else if (csString.includes('Indexed')) {
                colorSpace = 'Indexed';
              } else {
                colorSpace = csString.replace(/\//g, '');
              }
            }

            // Get filter (compression type)
            const filterObj = dict.get(PDFName.of('Filter'));
            let filter = 'None';
            if (filterObj) {
              const filterString = filterObj.toString();
              if (filterString.includes('DCTDecode')) {
                filter = 'JPEG';
              } else if (filterString.includes('FlateDecode')) {
                filter = 'Flate';
              } else if (filterString.includes('JPXDecode')) {
                filter = 'JPEG2000';
              } else if (filterString.includes('CCITTFaxDecode')) {
                filter = 'CCITT';
              } else if (filterString.includes('JBIG2Decode')) {
                filter = 'JBIG2';
              } else {
                filter = filterString.replace(/[\[\]\/]/g, '').trim();
              }
            }

            // Estimate size based on dimensions and color depth
            // This is approximate - actual stream size would be more accurate
            let estimatedSize = 0;
            const channels = colorSpace === 'RGB' ? 3 : colorSpace === 'CMYK' ? 4 : 1;
            const uncompressedSize = width * height * channels * (bitsPerComponent / 8);

            // Estimate based on filter type
            if (filter === 'JPEG') {
              // JPEG typically achieves 10:1 to 20:1 compression
              estimatedSize = Math.round(uncompressedSize * 0.1);
            } else if (filter === 'Flate') {
              // Flate (PNG-like) typically achieves 2:1 to 4:1
              estimatedSize = Math.round(uncompressedSize * 0.4);
            } else if (filter === 'JPEG2000') {
              estimatedSize = Math.round(uncompressedSize * 0.08);
            } else {
              // Assume some compression
              estimatedSize = Math.round(uncompressedSize * 0.3);
            }

            // Try to get actual stream length if available
            const lengthObj = dict.get(PDFName.of('Length'));
            if (lengthObj) {
              const actualLength = getNumberFromDict(dict, 'Length');
              if (actualLength && actualLength > 0) {
                estimatedSize = actualLength;
              }
            }

            images.push({
              index: imageIndex++,
              width,
              height,
              bitsPerComponent,
              colorSpace,
              filter,
              estimatedSize,
            });
          }
        }
      } catch {
        // Skip objects that can't be parsed
      }
    });
  } catch (err) {
    console.error('Error extracting image info:', err);
  }

  return images;
}

/**
 * Extract font information from the PDF
 */
function extractFontInfo(pdfDoc: PDFDocument): FontInfo[] {
  const fonts: FontInfo[] = [];
  const seenFonts = new Set<string>();

  try {
    const context = pdfDoc.context;

    context.enumerateIndirectObjects().forEach(([ref, obj]) => {
      try {
        if (obj instanceof PDFDict) {
          const type = obj.get(PDFName.of('Type'));

          if (type && type.toString() === '/Font') {
            const subtypeObj = obj.get(PDFName.of('Subtype'));
            const baseFontObj = obj.get(PDFName.of('BaseFont'));

            const subtype = subtypeObj?.toString().replace('/', '') || 'Unknown';
            const baseFont = baseFontObj?.toString().replace('/', '') || 'Unknown';

            // Avoid duplicates
            const fontKey = `${baseFont}-${subtype}`;
            if (seenFonts.has(fontKey)) return;
            seenFonts.add(fontKey);

            // Check if font is embedded
            const fontDescriptor = obj.get(PDFName.of('FontDescriptor'));
            let embedded = false;

            if (fontDescriptor instanceof PDFRef) {
              const descriptorDict = context.lookup(fontDescriptor);
              if (descriptorDict instanceof PDFDict) {
                // Font is embedded if it has FontFile, FontFile2, or FontFile3
                embedded = !!(
                  descriptorDict.get(PDFName.of('FontFile')) ||
                  descriptorDict.get(PDFName.of('FontFile2')) ||
                  descriptorDict.get(PDFName.of('FontFile3'))
                );
              }
            }

            fonts.push({
              name: baseFont,
              type: subtype,
              embedded,
            });
          }
        }
      } catch {
        // Skip fonts that can't be parsed
      }
    });
  } catch (err) {
    console.error('Error extracting font info:', err);
  }

  return fonts;
}

/**
 * Extract metadata from the PDF
 */
function extractMetadata(pdfDoc: PDFDocument): PDFAnalysis['metadata'] {
  let hasBookmarks = false;
  let hasAnnotations = false;
  let hasForms = false;

  try {
    const context = pdfDoc.context;

    // Check for bookmarks (Outlines)
    const catalog = pdfDoc.catalog;
    if (catalog) {
      const outlines = catalog.get(PDFName.of('Outlines'));
      hasBookmarks = !!outlines;

      // Check for AcroForm (forms)
      const acroForm = catalog.get(PDFName.of('AcroForm'));
      hasForms = !!acroForm;
    }

    // Check for annotations by looking at pages
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const annots = page.node.get(PDFName.of('Annots'));
      if (annots) {
        // Check if it's not empty
        if (annots instanceof PDFArray && annots.size() > 0) {
          hasAnnotations = true;
          break;
        } else if (annots instanceof PDFRef) {
          hasAnnotations = true;
          break;
        }
      }
    }
  } catch (err) {
    console.error('Error checking PDF features:', err);
  }

  return {
    title: pdfDoc.getTitle() || null,
    author: pdfDoc.getAuthor() || null,
    creator: pdfDoc.getCreator() || null,
    hasBookmarks,
    hasAnnotations,
    hasForms,
  };
}

/**
 * Helper to safely extract number values from PDF dictionaries
 */
function getNumberFromDict(dict: PDFDict, key: string): number | null {
  try {
    const obj = dict.get(PDFName.of(key));
    if (obj) {
      const str = obj.toString();
      const num = parseInt(str, 10);
      if (!isNaN(num)) return num;
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
