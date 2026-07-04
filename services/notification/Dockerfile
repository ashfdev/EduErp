# Build context is the monorepo root (see docker-compose.yml).
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json packages/db/package.json
COPY packages/config/package.json packages/config/package.json
COPY services/notification/package.json services/notification/package.json
RUN pnpm install --frozen-lockfile --filter=@education-erp/notification-service...

FROM deps AS build
COPY packages/db packages/db
COPY packages/config packages/config
COPY services/notification services/notification
RUN pnpm --filter=@education-erp/db exec prisma generate
RUN pnpm --filter=@education-erp/notification-service build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
EXPOSE 4600
CMD ["node", "services/notification/dist/index.js"]
