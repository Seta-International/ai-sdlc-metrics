FROM --platform=linux/arm64 oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY packages/ ./packages/
COPY apps/web-shell/package.json ./apps/web-shell/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-shell ./apps/web-shell
RUN cd apps/web-shell && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-shell/.next/standalone ./
COPY --from=builder /app/apps/web-shell/.next/static ./apps/web-shell/.next/static
COPY --from=builder /app/apps/web-shell/public ./apps/web-shell/public
EXPOSE 3000
CMD ["bun", "apps/web-shell/server.js"]
