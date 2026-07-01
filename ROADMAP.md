# Education ERP — Build Checklist (new architecture)

Status: migrating from the old npm/camelCase/tenant-scoped build (kept under `_legacy/` for
reference) to the authoritative spec in `CLAUDE.md` + `prompts.md` — pnpm workspaces, snake_case
Prisma schema, no multi-tenancy (single institution), Settings-table-driven configurability.

Legend: `[ ]` not started · `[~]` partially done / stubbed · `[x]` done and verified

---

## External accounts/credentials still needed (all explicitly deferred by the user)

Azure subscription (production deployment only — uploads work locally without it), real
pilot-institution details (currently placeholder demo data), bKash/Nagad/SSLCommerz merchant
accounts, SMS gateway account, domain name, biometric device brand confirmation.

---

## Phase 0 — Project Foundation

- [x] pnpm workspace (`pnpm-workspace.yaml`: apps/*, packages/*, server/*, services/*)
- [x] `packages/config` — tsconfig base/nextjs/node, eslint-base, tailwind.base
- [x] `packages/types` — re-exports Prisma types + ApiResponse/PaginatedResponse wrappers
- [x] `packages/validators` — auth + settings Zod schemas (grows per phase)
- [x] `packages/ui` — core primitives (button, input, label, card, badge) + base components
      (PageWrapper, PageHeader, StatusBadge, EmptyState, LoadingSpinner). Remaining shadcn
      components (select, checkbox, switch, tabs, dialog, table, calendar, command, etc.) and
      FileUpload/RichTextEditor/DataTable/ConfirmDialog/FilterBar added incrementally as each
      phase's UI needs them, not front-loaded.
- [x] `packages/db` — full Prisma schema (all Phase 0-18 models except Phase 10's
      `DocumentRegistry` and Phase 13's Library/Transport/Hostel models, added at those phases),
      seed script (default settings + ADMIN user 01700000000/Admin@1234)
- [x] `server/api` — Express skeleton (health route, error handler, async handler, pino logger)
- [x] `apps/admin`, `apps/portal`, `apps/website` — Next.js 14 App Router skeletons
- [x] `services/device`, `services/notification` — placeholders (filled in at Phase 17/18)
- [x] Verified: migration applied to live dev Postgres (`EduErp` db, port 5433, 51 tables),
      seed run + confirmed via psql, full monorepo `pnpm typecheck` passes (11/11 packages),
      `vitest run` passes, all 3 Next.js apps `next build` successfully, API boots and
      `/health` responds.

Real bugs found and fixed during this phase (the pasted spec doc was never run through the
Prisma engine or `tsc`):
- Prisma enum syntax requires one value per line — the spec's compact `enum X { A B C }` form
  doesn't parse.
- Several models referenced relations with no back-relation field on the other model
  (`AcademicYear`↔`StudentAcademicHistory`/`AdmissionCycle`/`FeeStructure`, `Class`↔`AdmissionCycle`,
  `ExamTypeConfig`↔`Exam`, `GradingScale`↔`Exam`, `Subject`↔`ExamSubjectConfig`) — added the
  missing back-relations.
- `Department.head_id` needed `@unique` to make the `Staff.department_head_of` 1:1 relation valid.
- pnpm 9 moved `overrides` out of `package.json#pnpm` into `pnpm-workspace.yaml`.
- `@types/express@5` was paired with `express@4` in the initial server/api scaffold — bumped
  runtime to Express 5 to match.
- `packages/config`'s `tailwind.base.ts` and the three Next.js apps needed `@education-erp/config`
  declared as an explicit dependency — pnpm's strict linking doesn't expose undeclared
  workspace packages even within the same monorepo.

## Phase 1 — Settings System (FULL) — API + Admin UI

- [ ] Not started. Full endpoint + page spec in `prompts.md`.

## Phase 2 — Auth + Login System

- [ ] Not started. Full spec in `prompts.md`. Enhancement to port forward from the old build:
      staff 2FA/TOTP login, and a DB-backed overridable permission matrix layered on top of the
      static `authorize()` middleware.

## Phase 3 — Student Module

- [ ] Not started. Full spec in `prompts.md`.

## Phase 4 — Subjects & Teacher Assignment

- [ ] Not started. Full spec in `prompts.md`.

## Phase 5 — Attendance Module (Full)

- [ ] Not started. Full spec in `prompts.md`.

## Phase 6 — Examination + Mark Entry + Grading

- [ ] Not started. Full spec in `prompts.md`. Port forward: grading engine incl. 4th-subject rule.

## Phase 7 — Results & Report Cards

- [ ] Not started. Full spec in `prompts.md`.

## Phase 8 — Fee & Finance Module

- [ ] Not started. Full spec in `prompts.md`. Port forward: late-fee calculation, payment adapter
      pattern (CASH working, BKASH/NAGAD/SSLCOMMERZ stubs).

## Phase 9 — Online Admission

- [ ] Not started. Scope designed (my own design, per user's request) — see
      `PHASE_PROMPTS_PART2.md` once written, and the migration plan file for the summary.

## Phase 10 — Document Generation (all doc types)

- [ ] Not started. Adds `DocumentRegistry` model. Port forward: Bangla PDF font-embedding
      solution, certificate verification (QR + registry).

## Phase 11 — Website Maintenance

- [ ] Not started. Port forward: self-hosted CAPTCHA + rate-limiting, old public-site's proven
      9-page structure.

## Phase 12 — HR + Payroll

- [ ] Not started. Port forward: staff-advance/loan tracking gap.

## Phase 13 — Library + Transport + Hostel

- [ ] Not started. Adds `Book`/`BookCopy`/`BookIssue`, `TransportRoute`/`Vehicle`/
      `StudentTransportAssignment`, `HostelBuilding`/`HostelRoom`/`HostelAllocation` (schema gap
      in the original spec).

## Phase 14 — Analytics Dashboard

- [ ] Not started.

## Phase 15 — Student/Guardian Portal (PWA)

- [ ] Not started. `apps/portal`.

## Phase 16 — Public Website (ISR)

- [ ] Not started. Port forward: revalidate-on-publish pattern.

## Phase 17 — IoT/Biometric Device Service

- [ ] Not started. `services/device`. Blocked on confirming the pilot institution's device
      brand — build against generic ADMS protocol, keep adapter-swappable.

## Phase 18 — Notification Service

- [ ] Not started. `services/notification`. Real BullMQ+Redis worker, replacing the old
      polling-loop outbox pattern. Port forward: SSL Wireless BD SMS adapter.

## Phase 19 — Mobile apps (Flutter) — FUTURE, out of scope

---

## Verification approach (every phase)

Schema → `pnpm db:migrate` against the live Docker Postgres → `pnpm typecheck` across the
monorepo → `next build` for affected apps → `vitest run` → live curl smoke test of every new
endpoint → fetch actual rendered HTML for frontend changes (or Puppeteer screenshot for
PDFs/Bangla text — text-extraction tools are unreliable for complex scripts) → update this file.
