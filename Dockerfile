# ==========================================
# Multi-Stage Dockerfile for NestJS Backend
# ==========================================

# 1. Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (e.g. bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy source code and configs
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Build application
RUN npm run build

# Remove development dependencies to keep production footprint minimal
RUN npm prune --production

# 2. Production Stage
FROM node:20-alpine AS runner

WORKDIR /app

# Add curl for container healthcheck
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy production node_modules and built code
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig*.json ./

# Ensure logs / scratch directories have proper permissions
RUN mkdir -p /app/logs /app/scratch /app/backups && \
    chown -R nestjs:nodejs /app

USER nestjs

# Set environment
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start production server
CMD ["node", "dist/main.js"]
