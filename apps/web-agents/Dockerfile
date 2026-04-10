FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-agents/package.json ./apps/web-agents/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-agents ./apps/web-agents
RUN cd apps/web-agents && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-agents/.next/standalone ./
COPY --from=builder /app/apps/web-agents/.next/static ./apps/web-agents/.next/static
EXPOSE 3009
CMD ["bun", "apps/web-agents/server.js"]
