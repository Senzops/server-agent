# --- Stage 1: Build ---
FROM node:22-alpine AS builder

# Install build tools for node-pty (Native C++ Module)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: Production Runner ---
FROM node:22-alpine

# util-linux provides nsenter for host-level terminal access
RUN apk add --no-cache util-linux

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV INTERVAL=60

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

CMD ["node", "dist/index.js"]
