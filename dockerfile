# --- Stage 1: Build ---
FROM node:18-alpine AS builder

# Install build tools needed for native addons (if any)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: Production Runner ---
FROM node:18-alpine

# Install Linux utilities required by 'systeminformation' library
# (lscpu, free, etc. are needed for accurate readings)
RUN apk add --no-cache util-linux

WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Install ONLY production dependencies (keeps image small)
RUN npm ci --omit=dev

# Set Environment defaults
ENV NODE_ENV=production
ENV INTERVAL=60

# CMD to start the agent
CMD ["node", "dist/index.js"]