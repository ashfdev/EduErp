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

- [x] API — all `server/api/src/modules/settings/*` endpoints: institution profile/branding/
      type-change (cascading terminology per InstitutionType), config, student-id-config
      (+preview+reset), grading-scales (+ranges+presets+gap/overlap validation), exam-types
      (+reorder), fee-rules, attendance-rules, signatures+authority-config, templates
      (+HTML/CSS upload+preview render), notifications (+test send), academic-years/shifts/
      departments/classes/sections, users (+auto staff_uid+temp password SMS). JWT
      authenticate/authorize middleware, Azure Blob + local-disk storage service (ported
      forward), path-traversal-safe upload serving.
- [x] Admin UI — all 12 `/settings/*` pages under a secondary sidebar (4 groups): Institution
      Profile (4 tabs incl. type-change confirmation), Academic Structure, Departments,
      Student ID Format (live preview), Grading System (scale editor + presets), Exam Types,
      Fee Rules, Attendance Rules, Authority Signatures, Signature Mapping, Document Templates
      (upload+preview), Notifications (per-trigger×channel templates), User Accounts. Added
      the remaining shadcn-style primitives (select, switch, checkbox, tabs, dialog,
      confirm-dialog, textarea) to `packages/ui` as consumed.
- [x] Verified: live curl smoke tests against every endpoint category (institution CRUD,
      grading preset apply, academic-year create, user creation with SMS stub) against the dev
      Postgres; full monorepo typecheck (11/11); `next build` succeeds generating all 18 admin
      routes; live-fetched rendered HTML for the institution page and spot-checked 4 more pages
      (all 200 OK with real content, not error boundaries).

Real bugs fixed: Express 5's `ParamsDictionary` types route params as `string | string[]`
(broader than Express 4) — combined with `noUncheckedIndexedAccess` this mistyped every
`req.params.x`; added a validating `reqParam()` helper instead of scattering casts. Several
settings validators used loose `z.string()` where a Prisma enum was required (authority role,
document type, user role, grading scale type) — switched to `z.nativeEnum()`. A path-traversal
hole in the local-storage fallback (`blobKey` query param fed straight into `path.join`) was
closed with a resolved-path containment check before any file read. `packages/config`'s
Next.js tsconfig never included the `DOM` lib, so `HTMLInputElement`/`HTMLSelectElement` etc.
weren't fully typed — every native `<input onChange>` handler across the new settings pages
was silently losing `.value`/`.files` typing.

## Phase 2 — Auth + Login System

- [x] API — `server/api/src/modules/auth/auth.routes.ts`: login (phone/email + password,
      bcrypt-verified, issues 15min access + 7d refresh JWT), refresh (Redis-backed, rotates the
      refresh token on every use), logout (deletes from Redis), change-password (authenticated),
      forgot-password (6-digit OTP, bcrypt-hashed in Redis, 10min TTL, dispatched via the Phase 1
      SMS stub), verify-otp (issues a 5min reset_token), reset-password, and `/me`. A new
      dedicated `eduerp-redis-dev` Docker container (port 6380) backs token/OTP storage — the
      only other Redis on this machine is an unrelated project's container on 6379.
- [x] Admin UI — `/login` (institution-branded split layout, show/hide password, inline error
      states for invalid-credentials vs. disabled-account vs. network error, full 4-state
      forgot-password flow with resend cooldown), `/403`, a `ProtectedRoute` wrapper gating the
      whole `(dashboard)` layout (redirects unauthenticated → `/login`, role-mismatched → `/403`),
      role-based post-login redirect, and a proper 401-triggers-refresh-then-retry axios
      interceptor (was previously just an immediate logout).
- [x] Verified: live curl-driven full flow against the dev Postgres + new Redis — login,
      wrong-password rejection, `/me`, refresh-token rotation (confirmed via direct Redis
      inspection that the old key is deleted and reuse correctly 401s), forgot-password →
      OTP-from-log → verify-otp → OTP-reuse-rejected → reset-password → login-with-new-password,
      full monorepo typecheck (11/11), `next build` generates all 20 admin routes, and a live dev
      server confirmed the login page renders real content while an unauthenticated `/dashboard`
      hit correctly shows the `ProtectedRoute` loading state (pre-redirect).

Deferred (not in the given Phase 2 spec, noted for later rather than silently dropped): staff
2FA/TOTP login and a DB-backed overridable permission matrix layered on top of the static
`authorize()` middleware — both existed in the old build and are worth porting forward
eventually, but weren't required to match the authoritative spec and would have meaningfully
expanded this phase's scope.

## Phase 3 — Student Module

- [x] `server/api/src/utils/student-id.generator.ts` — GLOBAL scope atomically increments
      `StudentIdConfig.current_sequence`; YEARLY/CLASS scopes are derived by counting existing
      students in that scope (the schema has only one counter column, so per-year/per-class
      "reset" is computed rather than stored — self-resetting, no extra state to maintain).
- [x] `server/api/src/utils/subject-inheritance.ts` — shared by create/update/promote/
      bulk-promote/bulk-import: assigns all compulsory subjects + any selected optional ones.
- [x] API — full CRUD, list with search/filters/pagination, the 360° profile endpoint
      (personal/academic/subjects/attendance/results/fees — library/transport/hostel return
      empty/null until Phase 13 adds those models), promote + bulk-promote (skips students who
      failed a subject or are below the configured attendance threshold), extra-subject
      add/remove (blocks removing compulsory subjects), and CSV bulk-import (preview + confirm).
      Pulled a minimal read-only `GET /api/subjects?class_id=` forward from Phase 4 since student
      creation genuinely needs it — Phase 4 adds the full CRUD on top.
- [x] Admin UI — `/students` (search/filter/paginated table), `/students/new` (5-step form:
      Personal → Guardian → Academic Placement → Subjects → Review, with live compulsory/optional
      subject preview per selected class), `/students/:id` (360° profile with 6 tabs: Personal,
      Academic, Subjects, Attendance, Results, Fees).
- [x] Verified: live end-to-end via curl against the dev Postgres — created a student, confirmed
      auto-generated `student_uid` (GLOBAL scope), auto-created guardian (matched-or-created by
      phone), correct compulsory-vs-optional subject split in the 360 profile, search/list
      filtering, and that removing a compulsory subject is correctly rejected (400). Full
      monorepo typecheck (11/11), `next build` generates all 22 admin routes. Test data cleaned
      up after verification.

## Phase 4 — Subjects & Teacher Assignment

- [x] API — `POST/PUT/DELETE /api/subjects` (duplicate-code-per-class rejected with 409, delete
      blocked if `MarkEntry` records exist), `PUT /api/subjects/reorder`,
      `GET /api/subjects/:id/assignments`, `POST/PUT/DELETE /api/subjects/assign`, and
      `GET /api/staff/teachers` (filters `Staff` by `User.role` in the teaching-role set — a
      minimal read-only endpoint, full HR/staff CRUD is Phase 12).
- [x] Admin UI — `/settings/subjects`: left panel class list, right panel subjects for the
      selected class (up/down reorder, inline compulsory/optional/marks badges, add-subject
      dialog), expandable per-subject teacher-assignment panel (per-section or all-sections,
      assign/remove).
- [x] Verified: live curl-driven flow against the dev Postgres — subject creation, duplicate-code
      409, teacher assignment, fetching assignments, unassign, reorder. Full monorepo typecheck,
      admin build generates all 23 routes.

Real bug found and fixed: `POST /api/settings/users` (Phase 1) returned the created staff
record's `staff_uid` but never its `id` — since `SubjectTeacherAssignment.staff_id` references
`Staff.id` (not `User.id`), any caller using that response to immediately assign the new teacher
to a subject would hit a foreign-key violation with no way to recover the right id short of a
follow-up list call. Added `id` to both the create-response and list-response `staff` selects.

## Phase 5 — Attendance Module (Full)

- [x] API — `POST /api/attendance/mark` (biometric-conflict detection requiring an explicit
      override reason, find-then-write instead of `upsert()` since Prisma's compound-unique
      `where` shorthand rejects the null `shift_id`/`period_no` this schema actually has, SMS to
      guardians of absentees per `AttendanceRules.sms_on_absent`), `GET /api/attendance` (section
      roster for a date, flags biometric source), `GET /api/attendance/student/:id` (calendar view
      or yearly+monthly summary), `GET /api/attendance/defaulters`, `GET /api/attendance/daily-summary`,
      and reports (`daily-register`, `monthly-sheet`, `blank-sheet` as structured JSON;
      `bulk-export` as a real multi-sheet `.xlsx` via `exceljs`).
- [x] Admin UI — `/attendance/mark` (date/class/section picker, live summary pills, click-to-set
      P/A/L/LV/HD grid, biometric badge, mark-all-present, conflict toast), `/attendance/reports`
      (4 tabs: Daily Register, Monthly Sheet, Defaulters, Bulk Export).
- [x] Verified: live curl-driven flow against the dev Postgres — mark, re-fetch confirming persisted
      status, daily-summary, per-student summary, defaulters (correctly flagged a 0%-attendance
      student), daily-register/monthly-sheet JSON shape, and the bulk-export endpoint downloaded
      and was confirmed as a real `Microsoft Excel 2007+` file via `file`. Full monorepo
      typecheck, admin build generates all 25 routes.

Deferred (schema/infra gaps in the given spec, not oversights here): holiday-calendar validation
on mark (no `Holiday` model exists anywhere in the Phase 0 schema) and real-time Socket.io
emission on mark (no socket server has been built yet). Both noted for a later pass rather than
silently dropped.

Real bug found and fixed: an earlier attempt used `attendanceRecord.upsert()` keyed on the
`@@unique([person_id, person_type, date, shift_id, period_no])` compound index, but Prisma's
generated `where` type for that shorthand requires non-null `shift_id`/`period_no` even though
both columns are nullable — so any attendance marked without a shift or period (the common case)
wouldn't even compile. Replaced with an explicit find-then-create/update using regular `where`
filtering, which does support `null` correctly.

## Phase 6 — Examination + Mark Entry + Grading

- [x] `server/api/src/utils/grading.engine.ts` — pure functions ported forward from the old
      build: `calculateGrade` (handles absent + out-of-range clamping), `calculateStudentResult`
      (4th-subject rule: drops the lowest-GPA optional subject from the average, marksheet still
      shows its marks), `calculatePositions` (GPA desc, total-marks tiebreak, shared position on
      ties with the next rank skipped). 21 unit tests covering every BD-board grade boundary, the
      4th-subject rule on/off, a failed-subject-forces-overall-F case, and 3 tie-handling
      scenarios — all passing.
- [x] API — exam CRUD (auto-creates `ExamSubjectConfig` from each selected class's subjects on
      create; edit/delete restricted to `DRAFT`), enforced `DRAFT→ACTIVE→MARK_ENTRY→COMPLETED→PUBLISHED`
      status transitions, subject-config batch update, round-robin seat-plan generation across
      halls. Mark entry: the grid endpoint scopes to a `SUBJECT_TEACHER`'s own assigned subjects
      automatically, submit enforces the entry window + full-marks ceiling + (for subject
      teachers) assignment ownership, approve requires every subject×student combination
      submitted first, publish requires every mark approved first.
- [x] Admin UI — `/examination` (card grid), `/examination/new` (multi-field form + class
      checkboxes), `/examination/:id` (editable subject-config table + status-transition button),
      `/examination/:id/seat-plan` (hall builder + generate + table), `/marks` (exam/class/section
      picker scoped to exams currently in `MARK_ENTRY`), `/marks/:exam_id/:class_id/:section_id`
      (editable grid with per-cell absent checkbox), `/marks/:exam_id/approve` (per-class
      approve+publish with a public-on-website toggle).
- [x] Verified: live curl-driven flow against the dev Postgres — exam creation, mark-entry-window
      guard (rejected while `DRAFT`), invalid-transition rejection (`DRAFT`→`MARK_ENTRY` skipping
      `ACTIVE`), mark submission, over-full-marks rejection, approve (correctly required full
      submission first), publish, and seat-plan generation. Full monorepo typecheck, `vitest run`
      (22/22 including the 21 new grading tests), admin build generates all 31 routes.

## Phase 7 — Results & Report Cards

- [x] API — `GET /api/results/student/:id` (all published results across exams),
      `GET /api/results/exam/:exam_id` (merit-list-sorted class results, computed via the Phase 6
      grading engine), `GET /api/results/public/lookup` (**no auth**, by `student_uid` or
      `roll_no`+`registration_no`, only surfaces `is_published && is_public` results —
      rate-limited), `GET /api/results/tabulation/:exam_id/:class_id`, and reports
      (`merit-list`/`subject-analysis`/`campus-wide` as structured JSON — PDF rendering is
      Phase 10).
- [x] Admin UI — `/results` (completed/published exam list), `/results/:exam_id` (class picker +
      Merit List / Subject Analysis tabs).
- [x] Public — `apps/website` `/result` (student-ID or roll+registration search, no site chrome
      yet since the shared navbar/footer/branding is Phase 11's job — this is a standalone,
      functional page using plain `fetch` since the website app has no axios client yet).
- [x] Verified: live curl-driven flow against the dev Postgres — full mark→approve→publish→lookup
      pipeline with a real `BD_BOARD` grading-scale preset (85 marks correctly graded A+),
      merit-list/subject-analysis reports, public lookup by both `student_uid` and
      `roll_no`+`registration_no`, and confirmed the rate limiter actually returns 429 after the
      configured request budget. Full monorepo typecheck, both `admin` and `website` builds
      succeed.

Proactive fix (not a bug found in testing, but a real risk): `GET /api/results/public/lookup` is
unauthenticated by design (public result lookup) and reachable by anyone, which makes it a
plausible enumeration/scraping target. Added a shared `publicEndpointLimiter` (20 req/min) rather
than leaving it fully exposed until Phase 18's dedicated security-hardening pass — per-route rate
tuning (login attempts, forgot-password, etc.) still lands there.

## Phase 8 — Fee & Finance Module

- [x] `server/api/src/utils/late-fee.ts` — ported forward from the old build: FIXED/PERCENTAGE/DAILY
      fine types, grace period, daily cap clamp. 8 unit tests (disabled rules, within-grace,
      each fine type, cap clamping) — all passing.
- [x] `server/api/src/services/payment/` — adapter interface + registry (`getPaymentAdapter`),
      CASH (synchronously completes, no external round-trip), and BKASH/NAGAD/SSLCOMMERZ stubs
      that report `isConfigured()` from env vars and fail gracefully with a clear message when
      credentials aren't set — same proven pattern as the old build, real API calls deferred per
      the standing "external accounts... later" decision.
- [x] API — fee structure CRUD (delete blocked once invoices exist), invoice generation
      (single + bulk-monthly, duplicate-invoice prevention), manual collection via the CASH
      adapter (applies the late-fee calculator, transitions PENDING→PARTIAL→PAID), invoice
      waiver, online-payment initiate/callback (BKASH/NAGAD/SSLCOMMERZ — correctly 400s as
      "not configured" today), and reports (daily-collection, monthly-summary, dues, defaulters,
      Excel export).
- [x] Admin UI — `/fees` (dashboard cards), `/fees/structures`, `/fees/invoices` (filter +
      bulk-generate), `/fees/collect` (student search → outstanding invoices → collect),
      `/fees/reports` (Dues / Defaulters / Export tabs).
- [x] Verified: live curl-driven flow against the dev Postgres — invoice generation +
      duplicate-prevention, partial→full payment collection with a real computed late fee ($50
      fixed fine correctly applied since the test due-date was already past), daily-collection
      report, graceful 400 on an unconfigured BKASH initiate, and the Excel export confirmed as a
      real file via `file`. Full monorepo typecheck, `vitest run` (30/30 incl. 8 new late-fee
      tests), admin build succeeds.

## Phase 9 — Online Admission

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md`.

## Phase 10 — Document Generation (all 15 doc types)

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md`. Adds a `DocumentRegistry`-equivalent for
      certificate verification. Port forward: Bangla PDF font-embedding solution.

## Phase 11 — Website Maintenance + Public Website (apps/website)

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md` (this phase merges what earlier planning
      notes called separate "Website Maintenance" and "Public Website" phases — the authoritative
      Part 2 doc combines them into one). Port forward: self-hosted CAPTCHA + rate-limiting, old
      public-site's proven 9-page structure, revalidate-on-publish pattern.

## Phase 12 — HR + Payroll

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md`. Port forward: staff-advance/loan
      tracking gap.

## Phase 13 — Library + Transport + Hostel

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md`, which includes the actual schema
      additions this time (`Book`/`BookIssue`, `TransportRoute`/`Vehicle`/`StudentTransport`,
      `HostelBlock`/`HostelRoom`/`HostelAllocation`/`HostelVisitor`) — supersedes the earlier
      placeholder guess at these model names.

## Phase 14 — Analytics + Reporting Dashboard

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md`.

## Phase 15 — Student/Guardian Portal (PWA)

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md`. `apps/portal`.

## Phase 16 — IoT/Biometric Device Service

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md`. `services/device`. Blocked on
      confirming the pilot institution's device brand — build against the generic ZKTeco ADMS
      protocol, keep the connector adapter-swappable.

## Phase 17 — Notification Service

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md`. `services/notification`. Real
      BullMQ+Redis worker, replacing the old polling-loop outbox pattern. Port forward: SSL
      Wireless BD SMS adapter.

## Phase 18 — Security, Performance, Docker, Testing, README

- [ ] Not started. Full spec in `PHASE_PROMPTS_PART2.md` — this is a "final integration" phase
      (rate limiting, Prisma-error-code mapping, Redis caching, Docker/compose, comprehensive
      seed data, unit/integration/e2e tests, root README) that earlier planning notes hadn't
      accounted for; supersedes the earlier placeholder guess that Phase 18 would be the
      Notification Service (that's actually Phase 17).

## Phase 19 — Mobile apps (Flutter) — FUTURE, out of scope

---

## Verification approach (every phase)

Schema → `pnpm db:migrate` against the live Docker Postgres → `pnpm typecheck` across the
monorepo → `next build` for affected apps → `vitest run` → live curl smoke test of every new
endpoint → fetch actual rendered HTML for frontend changes (or Puppeteer screenshot for
PDFs/Bangla text — text-extraction tools are unreliable for complex scripts) → update this file.
