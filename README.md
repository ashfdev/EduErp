# Education ERP (Bangladesh)

Multi-tenant School/College/Madrasah ERP — Core API + Admin Web + Student/Guardian PWA + Public
Website. See `Education_ERP_PRD_v2.docx` for the full product spec and the plan doc referenced
below for the gap-filled architecture and phased roadmap.

## Structure

```
apps/
  core-api/      Node/Express + Prisma — all business logic, tenant-isolated
  admin-web/     Next.js — institution admin/staff dashboards
  portal-pwa/    Next.js PWA — student & guardian portal
  public-site/   Next.js ISR — public institution website
packages/
  shared-types/  Roles, DTOs shared across apps
  ui/            Shared React components
infra/
  bicep/         Azure IaC baseline (App Service, PostgreSQL, Blob, Key Vault)
.github/workflows/ci.yml   Lint/typecheck/test/build on every PR
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16 (local, or `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`)
- Redis (for BullMQ queues, added from Phase 1 onward)

## Getting started

```bash
npm install
cp apps/core-api/.env.example apps/core-api/.env   # then fill in DATABASE_URL, JWT secrets
npm run prisma:generate
npx --workspace=apps/core-api prisma migrate dev --name init
npm run dev     # runs all apps in parallel via Turborepo
```

- core-api: http://localhost:4000/health
- admin-web: http://localhost:3000
- portal-pwa: http://localhost:3001
- public-site: http://localhost:3002

## Testing

```bash
npm run test        # vitest across all workspaces
npm run lint
npm run typecheck
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

Phase 0 (this scaffold) → SIS/Auth → Fee & Finance → Exams/Results/Documents → Website →
Admission → Biometric Attendance → HR/Payroll → Library/Transport/Hostel/Inventory →
Analytics/Mobile. Full detail in the architecture & delivery plan.
