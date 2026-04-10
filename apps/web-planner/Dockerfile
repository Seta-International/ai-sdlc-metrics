FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-planner/package.json ./apps/web-planner/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-planner ./apps/web-planner
RUN cd apps/web-planner && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-planner/.next/standalone ./
COPY --from=builder /app/apps/web-planner/.next/static ./apps/web-planner/.next/static
EXPOSE 3011
CMD ["bun", "apps/web-planner/server.js"]
