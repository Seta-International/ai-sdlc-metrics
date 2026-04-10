FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-hiring/package.json ./apps/web-hiring/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-hiring ./apps/web-hiring
RUN cd apps/web-hiring && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-hiring/.next/standalone ./
COPY --from=builder /app/apps/web-hiring/.next/static ./apps/web-hiring/.next/static
EXPOSE 3003
CMD ["bun", "apps/web-hiring/server.js"]
