FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-performance/package.json ./apps/web-performance/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-performance ./apps/web-performance
RUN cd apps/web-performance && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-performance/.next/standalone ./
COPY --from=builder /app/apps/web-performance/.next/static ./apps/web-performance/.next/static
EXPOSE 3004
CMD ["bun", "apps/web-performance/server.js"]
