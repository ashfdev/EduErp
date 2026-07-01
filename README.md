# Education ERP (Bangladesh)

Single-institution School/College/University/Madrasah ERP — Admin Panel + Student/Guardian
Portal (PWA) + Public Institution Website + Core API. See `CLAUDE.md` for the full architecture
and rules, and `prompts.md` / `PHASE_PROMPTS_PART2.md` for the phase-by-phase build guide.

No multi-tenancy — everything institution-specific is configured through the Settings system
(`InstitutionProfile`, `InstitutionConfig`, `StudentIdConfig`, `GradingScale`, etc.), not
hardcoded or tenant-scoped.

## Structure

```
apps/
  admin/       Next.js 14 — institution admin/staff dashboards
  portal/      Next.js 14 PWA — student & guardian portal
  website/     Next.js 14 ISR — public institution website
packages/
  db/          Prisma schema + generated client (single source of truth)
  types/       Shared TypeScript types (re-exports Prisma types + API wrappers)
  validators/  Shared Zod schemas used by API + frontend
  ui/          Shared React component library (shadcn/ui based)
  config/      Shared tsconfig, eslint, tailwind base configs
server/
  api/         Node.js + Express — all business logic
services/
  device/      IoT/biometric device integration (Phase 17)
  notification/  SMS/Email/Push dispatch worker, BullMQ (Phase 18)
infra/
  bicep/       Azure IaC baseline (App Service, PostgreSQL, Blob, Key Vault)
_legacy/       Old npm/camelCase/tenant-scoped build, kept for reference while porting
               proven business logic forward — not part of the pnpm workspace.
.github/workflows/ci.yml   Lint/typecheck/test/build on every PR
```

## Prerequisites

- Node.js 20+
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`, or `npm i -g pnpm`)
- PostgreSQL 16 (local, or Docker)
- Redis (for BullMQ queues, from Phase 18 onward)

## Getting started

```bash
pnpm install
cp packages/db/.env.example packages/db/.env       # DATABASE_URL
cp server/api/.env.example server/api/.env         # DATABASE_URL, JWT secrets, etc.
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev     # runs all apps in parallel via Turborepo
```

- api: http://localhost:4000/health
- admin: http://localhost:3000
- portal: http://localhost:3001
- website: http://localhost:3002

Default seeded login: phone `01700000000`, password `Admin@1234`.

## Testing

```bash
pnpm test        # vitest across all workspaces
pnpm lint
pnpm typecheck
```

## Deploying infra (Azure)

`infra/bicep/main.bicep` provisions App Service, PostgreSQL Flexible Server, Blob Storage, and
Key Vault per environment. Not yet wired into CI — deploy manually until Azure credentials are
configured as GitHub secrets:

```bash
az deployment group create \
  --resource-group <rg-name> \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/main.parameters.example.json
```

## Roadmap

Phase 0 (monorepo + schema + seed) → 1 (Settings) → 2 (Auth) → 3 (Students) → 4 (Subjects) →
5 (Attendance) → 6 (Examination/Grading) → 7 (Results/Report Cards) → 8 (Fee & Finance) →
9 (Admission) → 10 (Documents) → 11 (Website) → 12 (HR/Payroll) →
13 (Library/Transport/Hostel) → 14 (Analytics) → 15 (Portal PWA) → 16 (Public Website ISR) →
17 (IoT/Biometric Device Service) → 18 (Notification Service). Full detail in `ROADMAP.md` and
`CLAUDE.md`'s Phase Tracker.
