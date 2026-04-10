FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-goals/package.json ./apps/web-goals/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-goals ./apps/web-goals
RUN cd apps/web-goals && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-goals/.next/standalone ./
COPY --from=builder /app/apps/web-goals/.next/static ./apps/web-goals/.next/static
EXPOSE 3007
CMD ["bun", "apps/web-goals/server.js"]
