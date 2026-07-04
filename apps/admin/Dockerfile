# Build context is the monorepo root (see docker-compose.yml).
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/package.json
COPY packages/validators/package.json packages/validators/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
COPY apps/admin/package.json apps/admin/package.json
RUN pnpm install --frozen-lockfile --filter=@education-erp/admin...

FROM deps AS build
COPY packages/types packages/types
COPY packages/validators packages/validators
COPY packages/ui packages/ui
COPY packages/config packages/config
COPY apps/admin apps/admin
# NEXT_PUBLIC_* vars are baked into the client bundle at build time, not
# read at container startup — must be a build ARG, not a runtime ENV.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter=@education-erp/admin build

# next.config.mjs sets output:"standalone", so the runtime image only needs
# .next/standalone + .next/static + public — not node_modules or source.
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/admin/public ./apps/admin/public
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
