# PDF Size Chooser - Backend API

Node.js/Express backend for PDF compression using Ghostscript.

## Requirements

- Node.js 20+
- Ghostscript (`gs` CLI)
- Redis (optional, for job queue)

## Quick Start

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The server runs on `http://localhost:3001`.

### Docker

```bash
docker-compose up -d
```

This starts both the API server and Redis.

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and Ghostscript version.

### Upload PDF
```
POST /api/upload
Content-Type: multipart/form-data
X-API-Key: your-api-key

file: <PDF file>
```
Returns `jobId` for tracking.

### Get Job Status
```
GET /api/job/:id/status
X-API-Key: your-api-key
```
Returns current job status and progress.

### Get Size Estimates
```
GET /api/job/:id/estimate
X-API-Key: your-api-key
```
Returns estimated compressed sizes at different quality levels.

### Start Compression
```
POST /api/job/:id/compress
X-API-Key: your-api-key
Content-Type: application/json

{
  "quality": 75,        // Quality level 1-100
  "targetSizeMB": 10    // Or target a specific size
}
```

### Download Compressed PDF
```
GET /api/job/:id/download
X-API-Key: your-api-key
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `API_KEY` | API key for authentication | (none - dev mode) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:3000` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `TEMP_DIR` | Directory for temp files | `/tmp/pdf-jobs` |

## Production Deployment

### Digital Ocean Droplet

1. Provision Ubuntu 22.04 droplet (4GB RAM recommended for large files)

2. Install dependencies:
   ```bash
   # Node.js
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Ghostscript
   sudo apt-get install -y ghostscript

   # Redis
   sudo apt-get install -y redis-server
   sudo systemctl enable redis-server
   ```

3. Clone and build:
   ```bash
   git clone <repo>
   cd pdf-size-chooser/server
   npm ci
   npm run build
   ```

4. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

5. Run with PM2:
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name pdf-api
   pm2 save
   pm2 startup
   ```

### nginx Configuration

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # Increase timeouts for large file uploads
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;

        # Increase max body size for large PDFs
        client_max_body_size 250M;
    }
}
```

Enable SSL with Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Express Server                       │
├─────────────────────────────────────────────────────────┤
│  Routes                                                  │
│  ├── /health          Health check                       │
│  ├── /api/upload      File upload, creates job           │
│  └── /api/job/:id/*   Job status, compress, download     │
├─────────────────────────────────────────────────────────┤
│  Middleware                                              │
│  ├── auth.ts          API key validation                 │
│  └── rateLimit.ts     10 req/min per IP                  │
├─────────────────────────────────────────────────────────┤
│  Services                                                │
│  ├── ghostscript.ts   Ghostscript CLI wrapper            │
│  ├── sampler.ts       10% page sampling for estimates    │
│  └── jobQueue.ts      Bull queue for compression jobs    │
├─────────────────────────────────────────────────────────┤
│  External                                                │
│  ├── Redis            Job queue persistence              │
│  └── Ghostscript      PDF compression                    │
└─────────────────────────────────────────────────────────┘
```
