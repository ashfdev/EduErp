# Build context is the monorepo root (see docker-compose.yml) — a pnpm
# workspace can't build a single package in isolation, it needs the root
# lockfile plus every workspace package this one depends on.
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    fonts-noto fonts-noto-cjk ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Puppeteer would otherwise try to download its own Chromium at install
# time — we already installed the Debian package above.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/validators/package.json packages/validators/package.json
COPY packages/config/package.json packages/config/package.json
COPY server/api/package.json server/api/package.json
RUN pnpm install --frozen-lockfile --filter=@education-erp/api...

FROM deps AS build
COPY packages/db packages/db
COPY packages/types packages/types
COPY packages/validators packages/validators
COPY packages/config packages/config
COPY server/api server/api
RUN pnpm --filter=@education-erp/db exec prisma generate
RUN pnpm --filter=@education-erp/api build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
EXPOSE 4000
CMD ["node", "server/api/dist/index.js"]
