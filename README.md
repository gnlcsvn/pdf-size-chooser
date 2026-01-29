# PDF Size Chooser

A simple web tool to compress PDF files to a specific target size. Unlike other PDF compressors that offer vague "low/medium/high" quality options, this tool lets you specify exactly how big you want your output file to be.

## The Problem

You need to email a PDF but it's 45MB and your email client only allows 25MB attachments. Or you need to upload to a portal with a 10MB limit. Most compression tools don't let you target a specific size — you just have to guess and retry.

## The Solution

Upload your PDF, specify your target size (e.g., "under 25MB for email"), and get a compressed file that meets your requirement while preserving as much quality as possible.

## Features

- **Target size compression**: Specify the exact maximum file size you need
- **Quality preservation**: Iteratively compresses to find the best quality that fits your size limit
- **Simple UI**: Upload, choose size, download. No accounts required.

## Tech Stack

- **Frontend**: Next.js (hosted on Vercel)
- **Backend**: Node.js/Express API
- **Compression**: Ghostscript (via CLI, unmodified)
- **Hosting**: DigitalOcean Droplet

## How It Works

1. User uploads a PDF and specifies target size
2. Backend receives the file and target parameters
3. Ghostscript compresses the PDF iteratively, starting with high quality
4. If output exceeds target, reduce quality and retry
5. Return the best quality version that fits the size limit

```
Quality 100 → Too big? → Quality 90 → Too big? → Quality 80 → Fits! → Done
```

## Ghostscript Quality Presets

| Preset | DPI | Use Case |
|--------|-----|----------|
| `/screen` | 72 | Smallest, web viewing |
| `/ebook` | 150 | Good for email |
| `/printer` | 300 | Print quality |
| `/prepress` | 300 | Color preservation |

## Development

```bash
# Install dependencies
npm install

# Install Ghostscript (required)
# macOS: brew install ghostscript
# Ubuntu: sudo apt-get install ghostscript

# Run development server
npm run dev
```

## API Endpoints

### POST /api/compress

Compress a PDF to target size.

**Request**: `multipart/form-data`
- `file`: PDF file
- `targetMB`: Target size in megabytes (e.g., `25`)
- `minQuality`: Minimum acceptable quality, 1-100 (optional, default: `50`)

**Response**: Compressed PDF file stream

## License

MIT
