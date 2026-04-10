FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-finance/package.json ./apps/web-finance/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-finance ./apps/web-finance
RUN cd apps/web-finance && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-finance/.next/standalone ./
COPY --from=builder /app/apps/web-finance/.next/static ./apps/web-finance/.next/static
EXPOSE 3006
CMD ["bun", "apps/web-finance/server.js"]
