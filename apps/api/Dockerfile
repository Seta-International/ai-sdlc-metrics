# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps apps
COPY modules modules
COPY platform platform
COPY tooling tooling
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @seta/api... build
RUN pnpm --filter @seta/api deploy --prod /out

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out .
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
