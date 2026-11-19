# syntax=docker/dockerfile:1

# ---------- 构建阶段：安装依赖并构建 API 及其 workspace 依赖 ----------
FROM node:24-alpine AS build

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com

RUN npm config set registry "$NPM_REGISTRY" \
 && npm install -g pnpm@10.17.1 --no-fund --no-audit \
 && pnpm config set registry "$NPM_REGISTRY"

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @sylvie/api... build

RUN pnpm --filter @sylvie/api --prod deploy --legacy /app/deploy

# ---------- 运行阶段 ----------
FROM node:24-alpine AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

COPY --from=build --chown=node:node /app/deploy/package.json ./package.json
COPY --from=build --chown=node:node /app/deploy/dist ./dist
COPY --from=build --chown=node:node /app/deploy/node_modules ./node_modules

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
