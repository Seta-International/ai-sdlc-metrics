FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-insights/package.json ./apps/web-insights/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-insights ./apps/web-insights
RUN cd apps/web-insights && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-insights/.next/standalone ./
COPY --from=builder /app/apps/web-insights/.next/static ./apps/web-insights/.next/static
EXPOSE 3008
CMD ["bun", "apps/web-insights/server.js"]
