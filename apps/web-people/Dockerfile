FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-people/package.json ./apps/web-people/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-people ./apps/web-people
RUN cd apps/web-people && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-people/.next/standalone ./
COPY --from=builder /app/apps/web-people/.next/static ./apps/web-people/.next/static
EXPOSE 3001
CMD ["bun", "apps/web-people/server.js"]
