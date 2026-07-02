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

- [x] `packages/validators/src/admission.ts` — cycle create/update/toggle, dynamic
      `form_config` schema (fields[] + subject_config + document_uploads), public application
      submission, status update, bulk-action, enroll, payment-initiate, status-lookup schemas.
- [x] `server/api/src/modules/admission/admission.routes.ts` — built on the `AdmissionCycle`/
      `AdmissionApplication` models already defined in the Phase 0 schema (no migration needed):
  - Cycle management: create/list/detail (each with live-computed stats: applied/shortlisted/
    waitlisted/confirmed/enrolled/rejected + seats-remaining), update (blocks changing
    class/academic_year once applications exist), open/publish toggle.
  - Form config: get/put per-cycle `form_config`, get compulsory/optional subject split for the
    cycle's class.
  - Public: published-cycles list/detail, `POST /apply` (validates cycle is open, within the
    open/close date window, and that all `form_config`-required fields + required document keys
    are present; generates a sequential `{prefix}-{year}-{seq}` admission roll from the cycle
    name; queues a confirmation SMS), payment initiate/callback (reuses the Phase 8
    `getPaymentAdapter` — correctly 400s as "not configured" today, same as Fees), and a
    phone-verified application-status lookup (matches `application_id` + guardian phone against
    the JSON `guardian_info` field — no dedicated phone column needed).
  - Admin processing: paginated/filterable application list + detail, single/bulk status
    update (SHORTLISTED/WAITLISTED/REJECTED, blocked once ENROLLED), merit-list generation
    (ranks non-rejected/non-enrolled applications by a `gpa*1000 + total_marks/1000` score
    computed from the `previous_result` JSON, auto-shortlists the top `seat_count` and
    waitlists the rest), merit-list publish (SMS-notifies every ranked applicant of their
    rank/status), confirm (SHORTLISTED→CONFIRMED), and enroll (CONFIRMED→ENROLLED —
    creates/matches a `Guardian` by phone, generates a real `student_uid` via the existing
    `generateStudentUID()`, creates the `User`+`Student`, runs the existing
    `inheritSubjectsForClass()` against the applicant's `selected_subjects`, creates an
    ADMISSION-category `Invoice` when `app_fee > 0`, sets `enrolled_student_id`, and sends a
    welcome SMS — all inside one transaction).
  - Document endpoints (`admit-card`, `merit-list/pdf`) return structured JSON with an explicit
    "PDF rendering lands in Phase 10" note, matching the pattern already used for Phase 5/7
    report endpoints — no PDF engine exists yet.
- [x] Admin UI — `/admission` (dashboard cards per cycle with live stats + open/draft badges),
      `/admission/cycles/new` (single-form cycle creation — class, year, dates, seats, fee),
      `/admission/cycles/[id]` (open/publish switches, stats bar, Applications tab with status
      filter + checkbox multi-select + bulk shortlist/waitlist/reject, Merit List tab with
      generate + publish-and-notify actions), `/admission/applications/[id]` (guardian/previous-
      record/personal-info/documents panels + status-appropriate action buttons: Shortlist/
      Waitlist/Reject → Confirm → Enroll, redirects to the new student's profile on enroll
      success). Added an "Admission" link to the sidebar nav.
- [x] Public UI (`apps/website`) — `/admission` (published-cycle list with Apply/Check-Status
      links), `/admission/[cycle_id]` (6-step wizard: Personal Info incl. cycle-specific dynamic
      fields from `form_config`, Guardian Info, Previous Academic Record, Subject Selection
      (compulsory shown read-only, optional checkboxes), Documents (URL inputs keyed by
      `form_config.document_uploads` — see deferred item below), Review & Submit — shows the
      generated admission roll on success), `/admission/status` (application_id + guardian-phone
      lookup, plain fetch, no auth, matches the existing `/result` page's style).
- [x] Verified end-to-end via live curl against the dev Postgres (fixtures created and cleaned
      up afterward): created a class/section/compulsory+optional subject, created a 2-seat
      cycle with a required custom field + required document, confirmed `POST /apply` correctly
      400s when the required field is missing, submitted 3 applications with descending GPA
      (5.0/4.5/3.5) getting sequential rolls `CLA-2026-0001..0003`, confirmed the phone-verified
      status lookup returns `found:false` for a wrong phone, generated the merit list and
      confirmed the top-2-by-GPA were SHORTLISTED and the third WAITLISTED, confirmed+enrolled
      the rank-1 applicant and verified the resulting `Student` had the compulsory subject
      correctly inherited, an ADMISSION invoice for ৳500 created, the application flipped to
      ENROLLED with `enrolled_student_id` set, and a second enroll attempt correctly rejected;
      confirmed an unconfigured-BKASH payment-initiate 400s cleanly, merit-list-publish sent 3
      SMS stub log lines, bulk-reject correctly excluded the already-ENROLLED application from
      re-transition, and the admit-card endpoint 400s for a REJECTED application but returns the
      structured payload for a SHORTLISTED one. Full monorepo typecheck and both `admin`/
      `website` production builds succeed.
- [ ] Deferred: real document file upload for the public application form (currently accepts a
      document URL directly rather than uploading through a public multipart endpoint — no
      public-facing upload route exists yet, only the authenticated one used elsewhere); the
      admin cycle-creation form builder is a fixed form rather than the drag-and-drop dynamic
      field editor described in the spec (the `form_config` JSON contract is fully implemented
      and editable via the API, just not yet through a dedicated builder UI); a payment-driven
      auto-confirm path (today `confirm` is a manual admin action — the payment callback handler
      already flips CONFIRMED on a successful gateway callback, so this mostly needs real gateway
      credentials to exercise, per the standing "external accounts... later" decision).

## Phase 10 — Document Generation (all 15 doc types)

- [x] `server/api/src/services/pdf.service.ts` — implements CLAUDE.md's `renderDocument()` pattern
      exactly: loads `InstitutionProfile` branding, the active `DocumentTemplate` for the doc type
      (auto-seeding one from a built-in default HTML file on first use if none exists yet — so
      every endpoint works out of the box, and the existing Phase-1 Templates/Signatures settings
      CRUD is what lets an admin customize it later), the `AuthorityConfig`→`AuthoritySignature`
      chain per doc type, compiles with Handlebars, and renders via Puppeteer
      (`--no-sandbox`, `PUPPETEER_EXECUTABLE_PATH` override for prod Linux per CLAUDE.md). All 6
      spec'd Handlebars helpers registered (`banglaDate`, `gradeColor`, `ifPassed`, `formatMarks`,
      `institutionLogo`, `signatureBlock`). Real Puppeteer + Handlebars + `qrcode` packages
      installed (Chromium downloaded successfully in this environment).
- [x] `renderDocumentBatch()` — a genuine improvement over a naive per-record approach: compiles
      the template once and concatenates N records' rendered HTML with CSS page-breaks into a
      **single** Puppeteer pass, so "all admit cards for a class" / "all marksheets for a class" /
      "all ID cards for a class" each produce one real multi-page PDF instead of launching a
      browser per record or silently only rendering the first record.
- [x] `server/api/src/templates/defaults/` — 13 default Handlebars templates matching the spec's
      layout descriptions: student/staff ID card (85.6×54mm), admit card, marksheet, report card,
      tabulation sheet (A3 landscape), merit list, testimonial, transfer certificate (numbered
      BD-board format), attendance sheet (monthly grid) + blank sheet, fee receipt (with inline QR
      via `qrcode`), payslip. All embed the mandatory Noto Sans Bengali font-face per CLAUDE.md.
      `SYLLABUS` and `REGISTRATION_CARD` doc types exist in the schema enum but have no default
      template or endpoint — the spec's own Step 10B endpoint list never calls either, so they're
      left for a custom template via the existing Templates CRUD if ever needed.
- [x] `server/api/src/modules/documents/documents.routes.ts` — all 19 endpoints from the spec:
      student id-card/testimonial/transfer-cert; exam admit-cards (bulk) + seat-plan; result
      marksheet/report-card (single) + marksheets (bulk class) + tabulation + merit-list; attendance
      daily-register/monthly-sheet/blank-sheet; fee receipt/invoice/dues-report; payroll payslip;
      staff id-card + id-cards bulk (class / all-staff). `?download=true` toggles attachment vs.
      inline `Content-Disposition`. Two ops-report endpoints (daily-register, dues-report) skip the
      customizable-template path entirely via a new `renderSimpleReport()` helper, since their
      `DocumentType`-enum doesn't have a slot for them and they don't need an authority-signature
      workflow — they still get real institution branding + Puppeteer rendering.
- [x] Admin UI — `/documents/print`, a Print Center with a doc-type sidebar (all 18 generatable
      types) and a per-type filter panel (class/section/exam pickers reuse existing Settings data,
      date/month/year inputs where relevant) that downloads the generated PDF as a blob, matching
      the existing Excel-export pattern from Phase 8's Fee Reports page. Added a "Documents" nav
      link.
- [x] Verified live against the dev Postgres: generated **all 19 endpoints** end-to-end with real
      fixtures (class/section/2 students/subject/exam/mark-entries/invoice/payment/staff/payroll-
      record, all cleaned up afterward) and confirmed every response via `file` is a genuine
      `PDF document` — not a stub. Specifically confirmed: the student ID card renders at
      credit-card size; the 2-student bulk ID-card, bulk marksheets, and bulk admit-cards requests
      each came back as real **2-page** PDFs (proving `renderDocumentBatch`'s single-pass batching
      actually works, not just the single-record path); the fee receipt is measurably larger than
      the otherwise-identical invoice document (confirming the inline QR code is actually embedded);
      `DocumentTemplate` rows were auto-seeded on first use for exactly the 3 doc types exercised
      early in the test (confirms lazy per-type seeding, not an eager bulk-seed); tabulation sheet
      correctly rendered A3 landscape; endpoints with no underlying data yet (seat-plan, daily
      register with no attendance records) still returned valid PDFs with empty tables rather than
      erroring. Full monorepo typecheck, `vitest run` (still 30/30 — no regressions), and `admin`
      production build all succeed.
- [ ] Deferred: no `DocumentRegistry`/QR-verification-code model exists for a public "verify this
      certificate" lookup page (the fee-receipt QR points at a receipt id but there's no `/verify`
      endpoint or registry table yet — the original migration plan called for adding this model at
      this phase but the Phase 0 schema already fixed the model set and PHASE_PROMPTS_PART2.md's
      actual Phase 10 spec doesn't ask for it either, so it's left as a genuine gap rather than
      invented scope); the admit-card endpoint has no real per-subject exam-schedule data to draw
      from (no such model exists in the schema — hall/seat come from the real `ExamSeatPlan`, but
      date/time per subject are currently placeholder text) — would need a new schedule model in a
      future phase; 2-up/4-up cut-line print layouts for ID cards and admit cards (spec mentions
      these formats; today each record is a full page, which the batching change above makes
      correct for bulk *counts* but not space-efficient for physical cutting).

## Phase 11 — Website Maintenance + Public Website (apps/website)

- [x] Schema additions (one migration, `phase11_website_events_contact_staff_website_flag`): the
      Phase 0 schema had `Notice`/`SliderImage`/`GalleryAlbum`/`GalleryImage`/`Download`/
      `StaticPage`/`GoverningBodyMember` already, but no `Event` or `ContactSubmission` model —
      both are genuinely required by this phase's spec (academic calendar + contact-form inbox)
      so they were added rather than skipped. Also added `Staff.show_on_website` (the spec
      explicitly calls for this column to drive the public faculty directory).
- [x] `server/api/src/modules/website/` (admin, `WEBSITE_CONTENT_ROLES` = ADMIN/PRINCIPAL/
      IT_ADMIN) — full CRUD for sliders (image upload, reorder, active toggle), notices (create/
      update/soft-delete, publish/unpublish with ISR-revalidation trigger, send-sms fan-out to the
      resolved audience via the existing `sendSms` stub), gallery (albums + up-to-20-at-once image
      upload with automatic first-image-as-cover, image reorder), downloads (any file type),
      static pages (10 spec'd `page_key`s, upsert-on-save), governing body (photo upload,
      reorder), events, and contact-submission review (list/mark-read).
- [x] `server/api/src/modules/content/content.routes.ts` — the public, unauthenticated
      `/api/content/*` API apps/website reads from: sliders (date-window + active filtered),
      notices (pinned-first), gallery albums/images, downloads, static pages, governing body,
      events, faculty (grouped by department from `Staff.show_on_website`), admission/open (reuses
      Phase 9's `AdmissionCycle`), merit-list (reuses Phase 9's ranked applications), institution
      branding, live student/staff stats, and `POST /contact` (stores a `ContactSubmission` +
      best-effort admin-email via a new `email.service.ts` stub mirroring the SMS stub pattern).
      All routes share the existing `publicEndpointLimiter`.
- [x] `server/api/src/services/revalidate.service.ts` — `triggerRevalidation(paths)`, called after
      notice publish/unpublish and static-page save; POSTs to the website app's own
      `WEBSITE_URL/api/revalidate` webhook (not a route on the main API — the real
      `revalidatePath()` call can only run inside the Next.js process). Best-effort: catches and
      logs a warning rather than failing the admin action if the website isn't reachable.
- [x] Admin UI — `/website` (hub with section cards + a contact-submissions inbox table),
      `/website/notices` (filter tabs, new-notice dialog, publish/unpublish/send-sms/delete),
      `/website/sliders` (card grid, add dialog with image upload, up/down reorder, active
      toggle), `/website/gallery` (album grid) + `/website/gallery/[id]` (multi-file upload with
      a live-updating grid, per-image delete), `/website/downloads` (upload dialog, category
      badges), `/website/governing-body` (reorderable card list), `/website/events` (table +
      add dialog), `/website/pages` (list) + `/website/pages/[page_key]` (EN/BN tabbed editor).
      Added a "Website" nav link.
- [x] Public website (`apps/website`) — a shared `SiteChrome` (navbar + footer) now wraps every
      page via the root layout, fetching institution branding client-side and exposing
      `primary_color`/`secondary_color` as CSS variables (matches CLAUDE.md's per-institution
      theming requirement). New pages: `/` (hero slider with auto-advance + dot nav, quick stats,
      admission-open banner, notice board widget, principal message teaser, gallery preview,
      upcoming events, contact section), `/notices` (tab-filtered), `/gallery` + `/gallery/[id]`
      (click-to-zoom lightbox), `/downloads` (grouped by category), `/about` + `/about/[slug]`
      (sidebar-navigated static pages), `/faculty` (grouped by department), `/governing-body`
      (grouped by group), `/contact` (form + map embed), `/events` (grouped by month), and
      `app/api/revalidate/route.ts` (the real Next.js ISR webhook, secret-verified). All content
      pages follow the existing `/result`/`/admission` pages' established pattern — `"use client"`
      + plain `fetch` against `/api/content/*` — for consistency with the rest of the app rather
      than introducing a second data-fetching style.
- [x] Verified live against the dev Postgres: published a notice and confirmed it appears on
      `/api/content/notices` (and confirmed the revalidation trigger really does fire — it 400s/
      warns cleanly since no website dev server was running during the API-only test, proving the
      best-effort error handling); updated a static page and confirmed the public fetch reflects
      it; created a governing-body member and an event and confirmed both are public-visible;
      submitted a real contact form and confirmed it appears in the admin inbox and can be marked
      read; uploaded a real PNG through the slider/gallery/downloads multipart endpoints and
      confirmed each stored file is actually retrievable (`HTTP 200, content-type image/png`) —
      not just a DB row with a dangling URL; confirmed gallery multi-image upload auto-assigns the
      albums's first image as cover; created a `show_on_website=true` staff fixture and confirmed
      it's grouped correctly by `/api/content/faculty`. All fixtures (including uploaded local
      files) cleaned up afterward. Full monorepo typecheck (11/11 packages), `vitest run` (still
      30/30), and both `admin`/`website` production builds succeed.
- [ ] Deferred: rich-text editing uses plain `<textarea>` for notice bodies and page content
      rather than a Tiptap/Quill WYSIWYG editor (the spec calls for Tiptap; this mirrors a
      known-deferred item from the old pre-migration build for the same reason — time-boxed, and
      admins can still write raw HTML which the public pages render via `dangerouslySetInnerHTML`
      the same way a rich-text editor's output would be rendered); no EN/BN language-toggle switch
      on the public navbar (bilingual content itself is fully modeled and editable — `content_bn`
      fields exist and are editable in the admin page editor — just not switchable on the public
      side yet); Swiper.js/react-photo-gallery/yet-another-react-lightbox were not installed —
      the hero slider and gallery lightbox are hand-rolled with plain React state instead, which
      cover the spec'd behavior (autoplay, dot nav, click-to-zoom) without the extra dependencies;
      no Redis caching on the public content endpoints (spec suggests 5min/1hr TTLs) — acceptable
      at this stage since there's no real traffic yet, easy to layer on later via the existing
      `ioredis` client from Phase 2; the admission info page doesn't yet surface a downloads
      section alongside the open-cycle CTA.

## Phase 12 — HR + Payroll

- [x] Schema additions (2 migrations): `Staff.salary_structure_id` gained a real Prisma relation
      (was a bare unrelated FK column since Phase 0) plus a back-relation array on
      `SalaryStructure`, a `JobPosting` model for the spec's "basic recruitment" board (didn't
      exist — genuinely needed for `/api/hr/jobs`), and `LeaveRequest.rejection_reason` (the spec's
      `PUT /leaves/:id/reject` takes a `{ reason }` body but the Phase 0 schema had nowhere to
      store it).
- [x] `server/api/src/modules/hr/` (mounted at `/api/hr`, distinct from the pre-existing minimal
      `/api/staff/teachers` dropdown endpoint from Phase 4, which is untouched and still used by
      Settings → Subjects):
  - Staff: full CRUD with a real `STAFF-{YEAR}-{seq}` UID generator (`utils/staff-id.generator.ts`,
      mirrors the student UID generator's pattern), optional login-account creation (temp password
      via the existing SMS stub) or an auto-created deactivated shell `User` when no login is
      wanted (required since `Staff.user_id` is a non-null unique FK), photo/signature upload, and
      a `show_on_website` toggle that triggers the Phase 11 `/faculty` revalidation.
  - Leave: leave-type CRUD, apply (validates remaining balance for the leave's calendar year),
      balance-per-type endpoint, approve (transactionally creates/updates a `LEAVE`
      `AttendanceRecord` for every non-Friday day in the range — reusing the same find-then-write
      pattern from Phase 5 since the compound unique key has nullable members) and reject (now
      persists the reason via the new column).
  - Salary structures: CRUD + a `PUT /staff/:id/salary-structure` assignment endpoint.
  - Payroll: `calculate` (derives working days from the existing `AttendanceRules.
      working_days_per_week` — 6 excludes only Friday, less excludes Friday+Saturday, since no
      Holiday-calendar model exists in the schema, a previously documented gap; per-day salary =
      basic/working_days; deductions = PF% + TDS% + absent-day proration; upserts one
      `PayrollRecord` per staff with a salary structure), list/filter, draft-only manual
      adjustment (recomputes net), `finalize` (renders a **real** payslip PDF per staff via the
      Phase 10 `renderDocument("PAYSLIP", ...)` and uploads it through the existing storage
      service — a single staff's render failure doesn't block finalizing the rest of the batch),
      `mark-paid` (FINALIZED→PAID only), and an on-demand payslip endpoint.
  - Jobs: CRUD + publish toggle for a lightweight recruitment board; public listing added to
      `/api/content/jobs` (Phase 11's public content router) rather than under `/api/hr` so an
      unpublished posting is never accidentally exposed.
- [x] Admin UI — `/hr` (stat cards: total/active staff, pending leave, this-month payroll total),
      `/hr/staff` (searchable table) + `/hr/staff/new` (single-form add — see deferred note) +
      `/hr/staff/[id]` (Profile/Subjects/Leave/Payroll tabs, leave-balance cards, an "Apply Leave"
      dialog for admin-on-behalf-of, per-record payslip download), `/hr/leave` (Pending/Approved/
      Rejected/All tabs with inline approve/reject), `/hr/payroll` (month/year selector,
      Calculate/Finalize/Mark-Paid actions, per-row payslip download). Added an "HR" nav link.
  - **Bug caught and fixed during this phase**: the first draft of the payslip-download links used
      plain `<a href="/api/documents/...">`, which is broken two ways at once — it resolves
      against the *admin app's own origin* (not the API server) and carries no `Authorization`
      header, so it would have 404'd/401'd for every user. Fixed by switching to the same
      `api.get(..., { responseType: "blob" })` + `URL.createObjectURL` pattern already established
      in Phase 8's Fee Reports and Phase 10's Print Center, in both `/hr/payroll` and
      `/hr/staff/[id]`.
- [x] Verified live against the dev Postgres: created a staff member through `/api/hr/staff` with
      `create_login:true` and confirmed both the SMS-stub log line and the (gracefully-failing,
      since no website server was running) revalidation trigger fired; assigned a salary structure;
      seeded 13 real `PRESENT` attendance days for July 2026 and ran `/payroll/calculate`, then
      hand-verified the exact arithmetic the API returned (working_days=26, gross=৳43,500,
      deductions=৳18,045 [PF+TDS+13 absent days × per-day rate], net=৳25,455 — matched to the
      taka); adjusted the DRAFT record's deductions and confirmed net recalculated; finalized the
      month and confirmed a **real, fetchable PDF payslip** was generated and stored (not a stub);
      confirmed a finalized record correctly rejects further adjustment; marked it PAID; applied
      for 3 days of leave, confirmed the balance endpoint only counts APPROVED leave, approved it,
      and confirmed exactly 3 `LEAVE` `AttendanceRecord` rows were created for the correct dates
      and the balance dropped accordingly; confirmed a second application exceeding the remaining
      balance is correctly rejected; rejected a separate pending application with a reason and
      confirmed it persists; created and published a job posting and confirmed it's invisible on
      the public endpoint until published. All fixtures cleaned up afterward. Full monorepo
      typecheck (11/11), `vitest run` (still 30/30), and the admin production build all succeed.
- [ ] Deferred: staff advance/loan tracking (the `advance_deducted` field exists on
      `PayrollRecord` and is applied in the net-salary formula, but there's no dedicated
      loan-ledger model or UI to originate/track an advance over time — matches a gap already
      flagged before this migration began); the "Add Staff" admin UI is a single form rather than
      the spec's 4-step wizard (Personal → Professional → Account Access → Done) — all the same
      fields are collected, just on one screen; no staff Attendance calendar tab or Documents
      (NID/TIN/certificate vault) tab on the staff detail page — the attendance data model and
      upload plumbing both already exist and are exercised by other features, this is UI-surface
      scope only; "Download All Payslips" as a single ZIP/merged PDF is not implemented (each
      payslip downloads individually, which is functionally complete but not bulk-optimized).

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
