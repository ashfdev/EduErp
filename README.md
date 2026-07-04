# Education ERP

A production-grade, single-institution Education ERP + public institution website for
Bangladesh-context schools, colleges, universities, and madrasahs — built as a Turborepo
monorepo. No multi-tenancy: one deployment serves one institution, fully configured through its
own Settings system (`InstitutionProfile`, `StudentIdConfig`, `GradingScale`, etc.) rather than
hardcoded assumptions.

## Overview

The system covers the full academic/administrative lifecycle of a Bangladeshi educational
institution:

- Institution-wide **Settings** — branding, student ID format, grading scale, exam types, fee
  rules, attendance rules, authority signatures, document templates, notification templates.
- **Student & Staff management**, subject assignment with compulsory/optional inheritance,
  manual + biometric **attendance**.
- **Examination**: mark entry → approval → grading engine (BD board GPA / CGPA, 4th-subject
  rule) → result publish → public result lookup.
- **Fee & Finance**: fee structures, invoicing, a late-fee engine, bKash/Nagad/SSLCommerz payment
  adapters.
- **Online Admission** with a public application flow, merit list, and auto-enrollment into
  Student records.
- **Document generation** (ID cards, admit cards, testimonials, marksheets, etc.) via
  Handlebars + Puppeteer, with full Bangla font support.
- **Website Maintenance** + a public, ISR-rendered institution website.
- **HR + Payroll**, **Library/Transport/Hostel**, an **Analytics dashboard**, a **Student/Guardian
  Portal PWA**, an **IoT/biometric device service** (ZKTeco ADMS), and a **Notification service**
  (SMS/Email/Push over BullMQ+Redis).

## Architecture

```
                         ┌─────────────────┐
                         │   apps/website   │  Public site (Next.js, ISR)
                         └────────┬─────────┘
                                  │ reads
┌─────────────┐          ┌───────▼────────┐          ┌──────────────────┐
│ apps/admin  │◄────────►│   server/api    │◄────────►│  packages/db      │
│ (ERP panel) │  REST    │ (Express + JWT) │  Prisma  │  (Postgres schema) │
└─────────────┘          └───┬────┬────┬───┘          └──────────────────┘
┌─────────────┐              │    │    │
│ apps/portal │◄─────────────┘    │    │
│ (Student/   │                   │    │
│  Guardian   │        ┌──────────▼┐  ┌▼───────────────────┐
│  PWA)       │        │ services/  │  │ services/           │
└─────────────┘        │ device     │  │ notification        │
                        │ (ADMS)     │  │ (BullMQ + Redis)     │
                        └────────────┘  └─────────────────────┘
```

| Layer | Technology |
|---|---|
| Package manager | pnpm workspaces |
| Monorepo | Turborepo |
| Frontend | Next.js 14 (App Router) — admin, portal (PWA), website (ISR) |
| Styling | Tailwind CSS + shadcn/ui |
| Forms | React Hook Form + Zod |
| State | Zustand + TanStack Query |
| Tables | TanStack Table v8 |
| Charts | Recharts |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Cache / Queue | Redis + BullMQ |
| PDF | Puppeteer + Handlebars |
| File storage | Azure Blob Storage (local-disk fallback in dev) |
| Auth | JWT (15 min access / 7 day refresh) + bcrypt |
| SMS | SSL Wireless BD |
| Email | Nodemailer |
| Push | web-push (VAPID) |

## Repository Structure

```
education-erp/
├── apps/
│   ├── admin/              Next.js 14 — ERP Admin Panel
│   ├── portal/             Next.js 14 + PWA — Student/Guardian Portal
│   └── website/             Next.js 14 + ISR — Public Institution Website
├── packages/
│   ├── db/                 Prisma schema + generated client (single source of truth)
│   ├── types/               Shared TypeScript interfaces & enums
│   ├── validators/          Shared Zod schemas (API + frontend)
│   ├── ui/                  Shared component library (shadcn/ui based)
│   └── config/              Shared tsconfig/eslint/tailwind base configs
├── server/
│   └── api/                 Node/Express core API — all business logic
├── services/
│   ├── device/               IoT/Biometric integration (ZKTeco ADMS)
│   └── notification/          SMS/Email/Push worker (BullMQ)
├── infra/bicep/              Azure IaC (App Service, PostgreSQL, Blob, Key Vault)
├── .github/workflows/ci.yml  Lint/typecheck/test/build on every PR
├── docker-compose.yml / docker-compose.prod.yml
├── Makefile
├── ROADMAP.md               Phase-by-phase build log with verification evidence
└── CLAUDE.md                 Master architecture/conventions reference
```

## Quick Start

### Docker (recommended)

```bash
git clone <repo-url> && cd education-erp
docker compose up --build
docker compose exec api pnpm --filter=@education-erp/db exec prisma migrate deploy
docker compose exec api pnpm --filter=@education-erp/db exec prisma db seed
```

Or with the Makefile shortcuts: `make dev`, then in another shell `make migrate && make seed`.

Once running:

| App | URL |
|---|---|
| Admin panel | http://localhost:3000 |
| Student/Guardian portal | http://localhost:3001 |
| Public website | http://localhost:3002 |
| Core API | http://localhost:4000 |
| Device service | http://localhost:4500 |
| Notification service | http://localhost:4600 |

### Local (without Docker)

Requires Node 20+, pnpm 9, a local Postgres and Redis (or point `DATABASE_URL`/`REDIS_URL` at
any reachable instance).

```bash
pnpm install
cp server/api/.env.example server/api/.env      # fill in DATABASE_URL etc.
cp services/device/.env.example services/device/.env
cp services/notification/.env.example services/notification/.env
pnpm --filter=@education-erp/db exec prisma migrate deploy
pnpm --filter=@education-erp/db exec prisma db seed
pnpm dev
```

`pnpm dev` runs every app/service in parallel via Turborepo. Use `pnpm dev --filter=<name>` to
run just one (e.g. `pnpm dev --filter=api`).

## Development Guide

```bash
pnpm dev                 # everything, in parallel
pnpm dev --filter=api    # just the core API
pnpm build               # build all apps/services
pnpm typecheck           # typecheck all packages
pnpm test                # unit/integration tests (vitest)

pnpm --filter=@education-erp/db exec prisma generate       # after a schema change
pnpm --filter=@education-erp/db exec prisma migrate dev    # create a migration
pnpm --filter=@education-erp/db exec prisma db seed        # reseed
pnpm --filter=@education-erp/db exec prisma studio         # browse the DB
```

`.github/workflows/ci.yml` runs typecheck/test/build against real Postgres + Redis service
containers on every push/PR to `main`. Linting isn't wired into CI yet — ESLint was never
actually configured for any app/package in this monorepo (see `packages/config/eslint-base.js`,
currently unused); tracked as a known gap rather than silently claimed as working.

## Environment Variables

Each app/service that needs secrets keeps its own `.env` (gitignored) alongside a committed
`.env.example`:

| File | Covers |
|---|---|
| `server/api/.env` | Database, Redis, JWT secrets, Azure Blob, payment gateways, app URLs |
| `services/device/.env` | Database, device-service port/secret |
| `services/notification/.env` | Database, Redis, SMS/SMTP/VAPID provider credentials |

Key variables:

```env
DATABASE_URL=postgresql://user:pass@host:5432/education_erp
REDIS_URL=redis://host:6379
JWT_ACCESS_SECRET=<min 32 chars>
JWT_REFRESH_SECRET=<min 32 chars>
ADMIN_URL=http://localhost:3000
PORTAL_URL=http://localhost:3001
WEBSITE_URL=http://localhost:3002
WEBSITE_REVALIDATE_SECRET=<shared secret>
DEVICE_SERVICE_SECRET=<shared secret, both server/api and services/device>
```

SMS (SSL Wireless BD), SMTP, VAPID (web-push), and payment gateway credentials are all optional
in development — every provider falls back to a logging mock when its credentials are absent, so
the full pipeline is testable without real accounts.

`server/api` validates its environment at startup (`src/lib/env.ts`) and fails fast with a clear
error if a required variable is missing or malformed, rather than surfacing a confusing error the
first time that variable is actually used.

## Database

Prisma is the single source of truth for the schema (`packages/db/prisma/schema.prisma`).
Conventions: `cuid()` primary keys, soft deletes (`deleted_at`) on major entities, audit columns
(`created_at`/`updated_at`/`created_by_id`), and every configurable business rule (grading,
fees, attendance, notifications, document templates) lives in its own Settings table rather than
in code.

```bash
pnpm --filter=@education-erp/db exec prisma migrate dev --name "add_x"   # new migration
pnpm --filter=@education-erp/db exec prisma migrate deploy                # apply in prod/CI
```

Full phase-by-phase schema history, including exactly what was added and why, is in
[`ROADMAP.md`](./ROADMAP.md).

## Deployment

### Docker Compose

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The prod overlay adds resource limits, `restart: always`, and container healthchecks on top of
the base compose file. `server/api`'s image bundles a system Chromium for Puppeteer PDF
rendering (no separate download at container start).

### Azure (infra/bicep)

`infra/bicep/main.bicep` provisions App Service, PostgreSQL Flexible Server, Blob Storage, and
Key Vault. Not yet wired into CI — deploy manually until Azure credentials are configured as
GitHub secrets:

```bash
az deployment group create \
  --resource-group <rg-name> \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/main.parameters.example.json
```

### Production checklist

- Set real `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (32+ random characters each).
- Point `DATABASE_URL`/`REDIS_URL` at managed instances, not the compose-local containers.
- Fill in SMS/SMTP/VAPID/payment-gateway credentials in `services/notification/.env` and
  `server/api/.env` — everything runs in mock/logging mode until then.
- Set `ADMIN_URL`/`PORTAL_URL`/`WEBSITE_URL` to real domains — the API's CORS allowlist and the
  website's ISR-revalidation webhook both depend on these.
- Rate limiting, Prisma-error-code mapping, request IDs, and file-upload magic-byte validation
  are already wired in `server/api` (see `src/middleware/`).

## Default Login Credentials (seed data)

| Role | Phone | Password |
|---|---|---|
| Admin | 01700000000 | Admin@1234 |
| Principal | 01700000001 | Test@1234 |
| Exam Controller | 01700000002 | Test@1234 |
| Accountant | 01700000003 | Test@1234 |
| Class Teacher | 01700000004 | Test@1234 |
| Subject Teacher | 01700000005 | Test@1234 |

Demo data also includes 5 students in Class 9 Section A (IDs `ALh-26-0001`–`ALh-26-0005`) with
subject assignments, attendance, and invoice records — enough to explore every module without
hand-creating fixtures. **Change all of these before any real deployment.**

## Module Status

All 18 phases are complete — see [`ROADMAP.md`](./ROADMAP.md) for the detailed build log,
per-phase live-verification evidence, and an explicit list of what's deferred at each phase
(mostly external credentials the client hasn't provided yet: real SMS/payment-gateway accounts,
biometric device brand confirmation, etc.).

```
[x] Phase 0  — Turborepo setup, Prisma schema, seed data
[x] Phase 1  — Settings system
[x] Phase 2  — Auth + Login UI
[x] Phase 3  — Student module
[x] Phase 4  — Subjects + Teacher assignment
[x] Phase 5  — Attendance
[x] Phase 6  — Examination + Mark entry + Grading engine
[x] Phase 7  — Results + Report cards + Public lookup
[x] Phase 8  — Fee & Finance + Payment gateways
[x] Phase 9  — Online Admission
[x] Phase 10 — Document generation
[x] Phase 11 — Website Maintenance + Public website
[x] Phase 12 — HR + Payroll
[x] Phase 13 — Library + Transport + Hostel
[x] Phase 14 — Analytics + Reporting dashboard
[x] Phase 15 — Student/Guardian Portal (PWA)
[x] Phase 16 — IoT/Biometric device service
[x] Phase 17 — Notification service (SMS + Email + Push)
[x] Phase 18 — Security + Performance + Docker + Testing + README
```

`_legacy/` holds an earlier npm/camelCase/tenant-scoped build kept for reference during the
rewrite to the current pnpm/snake_case/single-tenant architecture — it is not part of the pnpm
workspace and is not deployed.
