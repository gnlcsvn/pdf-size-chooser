# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Install Ghostscript
RUN apk add --no-cache ghostscript

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create temp directory for PDF processing
RUN mkdir -p /tmp/pdf-jobs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV TEMP_DIR=/tmp/pdf-jobs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /tmp/pdf-jobs
USER nodejs

# Start the server
CMD ["node", "dist/index.js"]
