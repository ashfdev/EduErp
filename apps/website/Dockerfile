# Build context is the monorepo root (see docker-compose.yml).
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
COPY apps/website/package.json apps/website/package.json
RUN pnpm install --frozen-lockfile --filter=@education-erp/website...

FROM deps AS build
COPY packages/types packages/types
COPY packages/ui packages/ui
COPY packages/config packages/config
COPY apps/website apps/website
# NEXT_PUBLIC_* vars are baked into the client bundle at build time, not
# read at container startup — must be a build ARG, not a runtime ENV.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter=@education-erp/website build

# next.config.mjs sets output:"standalone", so the runtime image only needs
# .next/standalone + .next/static + public — not node_modules or source.
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/website/public ./apps/website/public
COPY --from=build /app/apps/website/.next/standalone ./
COPY --from=build /app/apps/website/.next/static ./apps/website/.next/static
EXPOSE 3002
CMD ["node", "apps/website/server.js"]
