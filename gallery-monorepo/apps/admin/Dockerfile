# syntax=docker/dockerfile:1

# ---------- 构建阶段 ----------
FROM node:24-alpine AS build

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG WEB_URL=http://localhost:3001

RUN npm config set registry "$NPM_REGISTRY" \
 && npm install -g pnpm@10.17.1 --no-fund --no-audit \
 && pnpm config set registry "$NPM_REGISTRY"

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/cache/package.json packages/cache/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/job/package.json packages/job/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/mq/package.json packages/mq/package.json
COPY packages/notify/package.json packages/notify/package.json
COPY packages/payment/package.json packages/payment/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/utils/package.json packages/utils/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ENV VITE_WEB_URL=$WEB_URL
RUN pnpm --filter @sylvie/admin... build

# ---------- 运行阶段：Nginx 托管 SPA 并代理 API ----------
FROM nginx:1.29 AS runner

ENV TZ=Asia/Shanghai

COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html

EXPOSE 80
