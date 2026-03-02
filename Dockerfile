# Build stage
FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:20-alpine
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

WORKDIR /project
ENTRYPOINT ["node", "/app/dist/index.js", "serve"]
