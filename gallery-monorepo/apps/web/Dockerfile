# syntax=docker/dockerfile:1

# ---------- 构建阶段 ----------
FROM node:22-alpine AS build

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG API_BASE_URL=http://api:3000

RUN npm config set registry "$NPM_REGISTRY" \
 && npm install -g pnpm@10.17.1 --no-fund --no-audit \
 && pnpm config set registry "$NPM_REGISTRY"

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ENV NEXT_STANDALONE=1
ENV API_BASE_URL=$API_BASE_URL
RUN pnpm --filter @sylvie/web... build

# ---------- 运行阶段 ----------
FROM node:22-alpine AS runner

ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Shanghai

WORKDIR /app

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3001

CMD ["node", "apps/web/server.js"]
