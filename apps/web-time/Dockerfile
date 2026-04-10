FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-time/package.json ./apps/web-time/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-time ./apps/web-time
RUN cd apps/web-time && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-time/.next/standalone ./
COPY --from=builder /app/apps/web-time/.next/static ./apps/web-time/.next/static
EXPOSE 3002
CMD ["bun", "apps/web-time/server.js"]
