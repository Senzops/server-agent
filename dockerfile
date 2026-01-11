# --- Stage 1: Build ---
FROM node:18-alpine AS builder

# Install build tools for node-pty (Native C++ Module)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: Production Runner ---
FROM node:18-alpine

# Production needs these tools/libs for the native binary runtime
RUN apk add --no-cache util-linux python3 make g++

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
# We copy node_modules from builder because node-pty is compiled there
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV INTERVAL=60

CMD ["node", "dist/index.js"]