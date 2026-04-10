FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-projects/package.json ./apps/web-projects/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-projects ./apps/web-projects
RUN cd apps/web-projects && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-projects/.next/standalone ./
COPY --from=builder /app/apps/web-projects/.next/static ./apps/web-projects/.next/static
EXPOSE 3005
CMD ["bun", "apps/web-projects/server.js"]
