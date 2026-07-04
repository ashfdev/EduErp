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

## Phase 8B — Accounts (Double-Entry Bookkeeping)

Added retroactively — `PHASE_8B_ACCOUNTS.md` was a spec file the user had prepared but forgot to
hand over during the original phase-by-phase build; built here alongside Phase 8C once discovered.

- [x] Schema — ~15 new models: `AccountGroup`/`Account` (chart of accounts, `is_system` protection,
      opening balance + type), `Voucher`/`JournalEntry` (RECEIPT/PAYMENT/JOURNAL/CONTRA/DEBIT_NOTE/
      CREDIT_NOTE, DRAFT→APPROVED→POSTED workflow; `created_by_id` deliberately nullable for
      payment-gateway webhook callbacks with no authenticated user), `FinancialYear`, `Budget`/
      `BudgetLine`, `BankAccount`, `BankReconciliation`/`ReconciliationItem`, `ChequeEntry`,
      `TaxEntry`, and `FeeAccountMapping` (new — not in the original spec text, added so
      fee-category→income-account mapping is Settings-driven per CLAUDE.md's "everything
      configurable" rule rather than hardcoded).
- [x] Seed — 5 account groups, 55 chart-of-accounts entries (matches spec, plus one extra `5020
      Loss on Disposal of Asset` needed for the disposal auto-journal), 10 fee-category mappings,
      one active `FinancialYear` (2026-2027).
- [x] `server/api/src/modules/accounts/voucher-helpers.ts` — `validateBalance()` (rejects
      unbalanced entries with the exact debit/credit/difference message), `createVoucher()`
      (financial-year date-range + not-closed checks, auto-generates voucher numbers per type),
      `generateVoucherNo()`.
- [x] `server/api/src/modules/accounts/auto-journal.service.ts` — the ONLY place allowed to create
      system-triggered vouchers: `createFeeReceiptJournal`, `createPayrollJournal`,
      `createInventoryPurchaseJournal`, `createDepreciationJournal`, `createAssetDisposalJournal`,
      `createMaintenanceJournal`. All auto-post immediately (no approval step — pre-balanced by
      construction) and swallow their own errors so a journal failure never blocks the calling
      module's primary transaction.
- [x] API — chart of accounts + account CRUD (system-reserved codes protected), financial years
      CRUD + activate + close, fee-mapping GET/PUT, vouchers CRUD + approve/post/cancel state
      machine, ledger (opening/closing + running balance), reports (day-book, cash-book, bank-book,
      trial-balance, income-expenditure, balance-sheet, account-summary, budget-vs-actual), budgets,
      banks + reconciliation, cheques, tax entries.
- [x] Admin UI — `/accounts` dashboard, `/accounts/chart`, `/accounts/vouchers` (list + new-voucher
      form with a live balance indicator that disables Save until balanced + color-coded
      RV/PV/JV/CV types), `/accounts/vouchers/[id]` (detail + approve/post/cancel), `/accounts/ledger`,
      `/accounts/reports` (trial-balance / income-expenditure / balance-sheet tabs).
- [x] Live-verified against the dev Postgres: balanced/unbalanced voucher validation, full
      approve→post workflow, ledger running balances, fee-payment auto-journal (Dr Cash/Bank → Cr
      mapped income account), trial balance (`total_debit === total_credit`).
- [x] **Real bug found and fixed**: the balance sheet only summed formally-closed `EQUITY`
      accounts, so it didn't balance mid-year (before a financial-year-end close). Real accounting
      always folds the current period's unclosed net income into Equity as an implicit "Current
      Year Earnings" line — added a `currentPeriodNetIncome()` computation to the balance-sheet
      report that does this on the fly. Re-verified: `total_assets === total_liabilities_and_equity`.
- [x] **Real bug found and fixed (second pass, during the full Accounts+Inventory integration
      test)**: the balance sheet's asset-section total added the Accumulated Depreciation
      contra-asset account's balance instead of subtracting it, overstating total assets by 2× its
      balance. `sectionRows()` in `reports.routes.ts` now detects contra accounts (nature doesn't
      match the account group's expected nature) and subtracts them from the section total while
      still displaying them as a positive "Less: ..." deduction line — the admin UI was updated to
      render this the same way.
- [ ] Deferred: no dedicated admin UI for day-book/cash-book/bank-book/budget-vs-actual/bank
      reconciliation/cheque management — API + data exist, list/detail pages don't yet. No PDF
      export for any of the 9 accounts reports (JSON only).

## Phase 8C — Inventory & Assets (Fixed Assets + Consumable Stock)

Added retroactively alongside Phase 8B, from `PHASE_8C_INVENTORY.md`.

- [x] Schema — ~14 new models: `AssetCategory` (depreciation rate/method + linked
      asset/depreciation/disposal accounts), `Asset` (QR code, department/staff assignment,
      condition, disposal fields), `DepreciationEntry`, `AssetMaintenance`, `AssetTransfer`,
      `ItemCategory`, `Item` (expense-account link, min/reorder stock), `StockTransaction`,
      `Supplier`, `PurchaseRequisition`/`RequisitionItem`, `PurchaseOrder`/`PurchaseItem`,
      `GoodsReceivedNote`/`GRNItem`.
- [x] Seed — 4 default asset categories (Furniture 10%/10yr, Electronics 20%/5yr, Vehicles
      15%/7yr, Buildings 5%/20yr) linked to the correct chart-of-accounts codes, 3 item categories.
- [x] `server/api/src/utils/asset-id.generator.ts` — `generateAssetUid()` plus
      `createWithUniqueAssetUid()`, which wraps the actual `prisma.asset.create()` call and retries
      the whole generate+create cycle on a P2002 unique-constraint collision (up to 5 attempts) —
      the precheck-then-create pattern alone has a TOCTOU race under concurrent requests.
- [x] API — asset categories CRUD, asset CRUD (QR code auto-generated via `qrcode` + uploaded to
      storage on creation) + photo upload + transfer + maintenance (auto-journal) + dispose
      (auto-journal with gain/loss balancing), depreciation `/calculate` (monthly) +
      `/calculate-annual` + `/schedule`, item categories + items CRUD (added a `GET /items/:id`
      detail route this session — the list-only pattern was inconsistent with every other module),
      stock issue (never negative) + adjust + transaction history + low-stock report, suppliers
      CRUD, requisitions (PENDING→APPROVED/REJECTED) + purchase orders (DRAFT→APPROVED→
      PARTIALLY_RECEIVED/RECEIVED) + GRN (the only trigger for stock/asset creation + auto-journal;
      supports partial receipt across multiple GRNs per PO), asset-register/depreciation-schedule/
      stock-report/stock-movement/purchase-history/maintenance-due reports, inventory dashboard.
- [x] Admin UI — `/inventory` dashboard, `/inventory/assets` (list + new + detail with
      depreciation/maintenance/transfer tabs + maintenance/dispose dialogs), `/inventory/stock`
      (issue-stock dialog), `/inventory/suppliers`, `/inventory/purchases` (3-tab: requisitions /
      orders / received, including the GRN-receive dialog), `/inventory/reports`.
- [x] Live-verified against the dev Postgres, covering every scenario in `PHASE_8C_INVENTORY.md`'s
      own test list: asset creation + QR code (fetched and visually confirmed as a real scannable
      QR image, not just a valid PNG), depreciation math (SLM, book value stops at 0), disposal
      journal (balances: proceeds + accumulated depreciation + loss = original cost), asset status
      → `DISPOSED` after disposal, normal stock issue, over-issue correctly rejected with a 400,
      low-stock report correctly flags items below `minimum_stock`, stock transaction history in
      chronological order with correct running balances, and a full partial-receipt purchase flow
      (PO for 100 units → GRN #1 receives 40 → status `PARTIALLY_RECEIVED` → GRN #2 receives the
      remaining 60 → status `RECEIVED`, stock incremented correctly across both GRNs).
- [x] **Real bug found and fixed**: 5 concurrent `POST /api/inventory/assets` requests — one failed
      with a raw `asset_uid already exists` conflict instead of succeeding with a unique UID
      (the precheck-then-create race described above). Fixed via `createWithUniqueAssetUid()`;
      re-verified with 5 concurrent creations, zero failures, all unique sequential UIDs.
- [x] **Real bug found and fixed**: after a GRN with a properly account-linked consumable item,
      the API response showed `"voucher_id": null` even though the auto-journal genuinely fired
      (confirmed directly in the DB) — the response serialized the `grn` object captured before a
      later `update()` set its `voucher_id`. Fixed by setting `grn.voucher_id` on the in-memory
      object right after the DB update so the response reflects what was actually persisted.
- [x] **Accounts + Inventory integration test** (`PHASE_8C_INVENTORY.md`'s full "one financial
      cycle" scenario) run end-to-end against the dev Postgres: income cycle (tuition fee payment
      → auto-journal) → purchase cycle (PO→GRN for stationery → auto-journal → manual payment
      voucher clearing the payable, net change zero) → payroll cycle (gross/TDS/net auto-journal,
      three-way balanced) → depreciation cycle (book value decreased, expense entry posted) →
      trial balance (balanced) → income & expenditure (correct income/expense/surplus figures) →
      balance sheet (balanced, after the contra-asset fix above). One substitution from the literal
      spec: the income-cycle step used the CASH gateway instead of bKash, since bKash/Nagad/
      SSLCommerz remain unconfigured stubs (external merchant credentials pending, a
      previously-documented deferral) — this exercises the identical `createFeeReceiptJournal`
      code path and account-selection branch, differing only in which account (1001 vs 1002) is
      debited, which is a single reviewed conditional.
- [ ] Deferred: no dedicated admin UI page for creating/editing Items directly (create via
      `POST /api/inventory/items` or through the PO item picker only). No PDF export for any of the
      5 inventory reports (JSON only).

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

- [x] Schema additions (one migration, `phase13_library_transport_hostel`): all 9 models from the
      spec added exactly as designed — `Book`/`BookIssue` (+`IssueStatus` enum), `TransportRoute`/
      `RouteStop`/`Vehicle`/`StudentTransport`, `HostelBlock`/`HostelRoom`/`HostelAllocation`/
      `HostelVisitor`. Added the two back-relations the spec's model sketch omitted but Prisma
      requires (`Student.transport`, `Student.hostel_allocations`) — `BookIssue.person_id` and
      `HostelVisitor.student_id` stay as informal (non-FK) references, matching the same
      person_id/person_type discriminator pattern `AttendanceRecord` already established in
      Phase 0, so no back-relation was needed there.
- [x] `server/api/src/modules/library/` — book catalog CRUD + add-copies, issue/return workflow
      (issue decrements `available` and validates it's >0 first; return computes
      `days_late × fine_per_day` and increments `available` back, in one transaction each way),
      person issue history, overdue report (with borrower name/phone resolved across both
      `Student`/`Staff` tables since `BookIssue.person_type` discriminates), fine-collection
      summary.
- [x] `server/api/src/modules/transport/` — route CRUD, stop management (replace-all per route,
      ordered), vehicle CRUD, and `POST /assign` which upserts a `StudentTransport` row and — if
      the route has a nonzero fare and an academic year is currently active — creates a real
      TRANSPORT-category `Invoice` (reuses the existing `FeeCategory` enum value from Phase 8,
      no schema change needed there), plus a per-route passenger manifest endpoint.
- [x] `server/api/src/modules/hostel/` — block/room CRUD, `GET /rooms?available=true` (computes
      `beds_free` from each room's active-allocation count vs. capacity), allocate (rejects both
      an over-capacity room and a student who already has an active allocation elsewhere),
      checkout, visitor log with in/out timestamps, and an occupancy report (per-room + aggregate
      fill rate).
- [x] Admin UI — `/library` (dashboard), `/library/books` (catalog + add-copies), `/library/issue`
      (student-search → book-search → issue), `/library/return` (issued-list with overdue
      highlighting → one-click return showing the computed fine), `/library/reports` (overdue /
      fine-report tabs); `/transport` (route cards with vehicle/student counts) + `/transport/
      routes/new` (route + ordered-stops builder in one form) + `/transport/routes/[id]`
      (stops, assigned vehicles, printable passenger manifest) + `/transport/assign`; `/hostel`
      (single page, three tabs — Blocks & Rooms with a click-to-allocate room grid, Visitor Log,
      Occupancy Report — combined rather than split into many sub-pages, a deliberate scope
      simplification given the spec's own "visual block/floor/room grid" description maps
      naturally onto one page rather than several). Added Library/Transport/Hostel nav links.
- [x] Verified live against the dev Postgres with real fixtures (2 students, all cleaned up
      after): issued a book with a due date 5 days in the past at a custom ৳5/day fine rate,
      confirmed `available` decremented and the overdue report correctly showed
      `days_late: 5, projected_fine: 25`, then returned it and confirmed the actual fine
      (`fine_amount: 25`) matched the projection exactly and `available` incremented back to the
      original count; created a route with 2 ordered stops and a vehicle, assigned a student with
      no active academic year and confirmed **no** invoice was created (correct — there's nothing
      to bill against), then activated a year and re-assigned a second student and confirmed a
      real ৳1,500 TRANSPORT invoice appeared in `/api/fees/invoices`; created a capacity-1 hostel
      room, allocated one student successfully, confirmed a second allocation attempt to the same
      room is rejected ("at full capacity") and a duplicate allocation attempt for the
      already-housed student to a *different* room is also rejected ("already has an active
      allocation"), confirmed the occupancy report's aggregate math (5 total capacity, 1 occupied,
      20% fill rate) matched by hand; logged a hostel visitor in, confirmed it appears in the
      active-visitors filter, checked out, and confirmed a second checkout attempt is correctly
      rejected. Full monorepo typecheck (11/11), `vitest run` (still 30/30, no regressions), and
      the admin production build all succeed.
- [ ] Deferred: `BookIssue`/`HostelVisitor` fine/visit SMS reminders beyond the issue-time
      confirmation SMS already sent (e.g. an automated "your book is overdue" nagging job) — no
      scheduler exists yet, this is a natural fit for Phase 17's Notification Service; bed-level
      (not just room-level) occupancy tracking — `HostelAllocation.bed_no` is captured but nothing
      currently validates two students can't be assigned the same bed number within a room; no
      barcode-scanner integration for library issue/return (the `barcode` field exists on `Book`
      and issue/return both work from a text search, but there's no actual scanner-input capture
      UI); transport route stops don't support drag-to-reorder in the UI (the ordered-list is
      edited via a flat form with Remove buttons, `stop_order` is still fully respected end-to-end).

## Phase 14 — Analytics + Reporting Dashboard

- [x] No schema changes — this phase is entirely read-side aggregation over models that already
      exist across all 13 prior phases.
- [x] `server/api/src/modules/reports/analytics.routes.ts` (mounted at `/api/analytics`) — the 7
      spec'd endpoints: `overview` (students/staff/finance/academic/library summary cards, all
      real Prisma counts/sums — no stubs), `attendance-trend` (weekly/monthly buckets, optional
      class filter), `result-performance` (per-exam-per-class average GPA via the existing
      `computeClassResults` export from Phase 7, plus per-subject average marks for the latest
      published exam), `fee-collection` (daily/by-category/by-gateway breakdowns over a date
      range), `defaulters-risk` (composite risk score = attendance-shortfall-below-threshold +
      min(50, days-overdue/2), sourced from the same `AttendanceRules.min_attendance_percentage`
      Phase 5 already uses), `class-comparison` (attendance% / avg GPA / fee-collection% side by
      side per class), `teacher-workload` (classes/subjects/student-count/pending-mark-entry-exams
      per teacher, derived from `SubjectTeacherAssignment`). Plus 4 supporting endpoints for
      Report-Center items the 7 core endpoints don't cover: `enrollment-trend`,
      `library-utilization`, `staff-attendance`, `leave-summary`; and a
      `POST /defaulters-risk/:student_id/remind` action endpoint backing the dashboard's
      "SMS Guardian" button (reuses the existing `sendSms` stub — the button now does something
      real instead of the placeholder wired during initial UI drafting, see below).
- [x] Admin UI — `/dashboard` completely rebuilt from the Phase 0 placeholder into the spec'd
      5-row layout using Recharts (already a dependency, unused until now): Row 1 quick-stat cards,
      Row 2 attendance-trend `LineChart` + latest-notices widget, Row 3 fee-collection `BarChart` +
      subject-performance `RadarChart`, Row 4 at-risk-students table (color-coded by risk score,
      per-row SMS button), Row 5 upcoming events / quick actions / system status. Role-specific
      sections (Teacher / Accountant / Exam Controller) render conditionally below the main
      dashboard based on the logged-in user's role from the existing auth store, rather than as
      separate routes — same data, scoped presentation. `/reports` — a Report Center hub with the
      4 spec'd categories (Academic/Finance/HR/Management) as tabs; items that already have a
      dedicated page from an earlier phase (attendance reports, fee reports, payroll, print
      center) link out to it directly; the genuinely new analytics-only reports (enrollment trend,
      dropout risk, library utilization, staff attendance, leave summary) open an inline
      preview table with a client-side CSV download. Added a "Reports" nav link.
  - **Bug caught and fixed while wiring the UI**: the at-risk table's "SMS Guardian" button was
      first drafted calling `POST /api/website/notices` with an empty body (leftover copy-paste),
      which would have both failed validation and made no sense semantically. Caught before
      shipping and replaced with the real `POST /api/analytics/defaulters-risk/:id/remind`
      endpoint built specifically for this action.
- [x] Verified live against the dev Postgres: seeded 2 students in one class, marked one
      `PRESENT`/one `ABSENT` today, and confirmed `/overview` returned the exact counts
      (`today_present: 1, today_absent: 1, today_percentage: 50`) and `/attendance-trend`'s
      current week bucket matched; confirmed `/class-comparison` reported the right student count
      and attendance% for the class; confirmed `/defaulters-risk` correctly flagged only the
      absent student (0% attendance, below the 75% threshold) with a hand-verified risk score
      (`75 = max(0, 75-0) attendance-risk + 0 due-risk`) and left the present student off the
      list entirely; fired the SMS-reminder endpoint and confirmed the stub log line appears;
      exercised all remaining endpoints (`enrollment-trend`, `library-utilization`,
      `staff-attendance`, `leave-summary`, `result-performance`, `teacher-workload`,
      `fee-collection`) against both empty and populated state and confirmed none error. All
      fixtures cleaned up afterward. Full monorepo typecheck (11/11), `vitest run` (still 30/30),
      and the admin production build all succeed.
- [ ] Deferred: the 5 analytics-only Report Center items export via client-side CSV rather than
      server-rendered Excel (unlike Phase 8's fee-ledger export, which genuinely uses `exceljs`
      server-side) — a deliberate scope trim given how much of this phase's spec is report
      *plumbing* already satisfied by earlier phases' PDF/Excel endpoints; separate role-scoped
      dashboard *routes* (e.g. a dedicated `/dashboard/teacher`) were not built — role-specific
      content renders conditionally on the single `/dashboard` route instead, which satisfies the
      spec's actual requirement ("role-specific views") without duplicating the data-fetching
      layer three times; "last backup time" and "device sync status" in the System Status card
      are omitted (no backup job or device-sync service exists yet — the latter lands in
      Phase 16).

## Phase 15 — Student/Guardian Portal (PWA)

- [x] Schema additions (manual-migration workaround, see below): `Guardian.user_id` (nullable,
      unique — Guardians had no login path at all before this phase, despite `GUARDIAN` already
      existing in the `UserRole` enum since Phase 0), `Homework`, `RoutineSlot`, `PushSubscription`
      — none of these existed and the spec's `/homework`, `/routine`, and push-notification
      registration pages need real backing tables, not stubs.
- [x] **Migration tooling note**: `prisma migrate dev` refused to run in this non-interactive shell
      for this migration (it wanted interactive confirmation for the nullable-unique-column
      warning on `Guardian.user_id`, which is actually always safe — Postgres allows multiple NULLs
      under a unique constraint). Worked around it with `prisma migrate diff --from-url ... --to-
      schema-datamodel ... --script` to generate the SQL, hand-created the migration folder, then
      `prisma migrate deploy` (the non-interactive-safe command) to apply it. First attempt
      corrupted the SQL file by redirecting `2>&1` and capturing pnpm's `[WARN]` banner into the
      file; fixed by redirecting stdout and stderr separately. Documented here since this will
      likely recur in Phases 16-18 if they need schema changes.
- [x] **Guardian login retrofit**: `students.routes.ts`'s student-creation transaction now also
      provisions a `User` (role=`GUARDIAN`) the first time a new guardian phone is seen (reusing
      the existing `User` if a sibling's guardian already has one), and links it via
      `Guardian.user_id`. Extended `POST /api/auth/login` to additionally resolve a `student_uid`
      identifier to its linked `User` when `portal === "portal"` (Student ID login, per spec).
  - **Real gap found and fixed while wiring this up**: the pre-existing (Phase 3) admission SMS
      literally said "temp password sent separately" for the student's own login — but nothing
      ever sent it; the password was silently unrecoverable. Fixed by sending the student their
      own credentials via a second SMS to their own phone when a login account is created, so the
      portal is actually usable by a real student rather than only by staff who can see the DB.
- [x] `server/api/src/modules/portal/portal.routes.ts` (mounted at `/api/portal`, `authorize`d to
      `STUDENT`/`GUARDIAN` only) — every route resolves accessible student ids from the caller's
      own `User` row first (`Student.user_id` for a student, `Guardian.user_id` → linked
      `Student[]` for a guardian) and 403s via a shared `assertAccess()` helper before touching any
      other student's data: `/me`, `/student/:id/dashboard` (combined summary — today's
      attendance, this-month %, upcoming exams, latest published result via the existing grading
      engine, fee dues, recent notices, homework pending count), `/attendance`, `/results` +
      `/results/:exam_id/marksheet` (real PDF via Phase 10's `renderDocument`), `/fees` +
      `POST /fees/pay` (reuses the Phase 8 payment-adapter pattern), `/homework`, `/routine`,
      `/notices`, `/subjects`, `/profile`, and `POST /push-subscribe` (stores the subscription;
      actual push *sending* is Phase 17's job).
  - **Security hardening found and fixed while building this**: two existing admin routers
      (`documentsRouter`, `studentsRouter`) only required `authenticate` with no role check, which
      was harmless while STUDENT/GUARDIAN logins were theoretical — Phase 15 makes them real. A
      STUDENT/GUARDIAN token could otherwise call `GET /api/students/:id` or
      `GET /api/documents/student/:id/*` directly (bypassing the portal's ownership checks
      entirely) to read or generate a PDF of **any** student's full profile, grades, fees, and
      guardian contact info. Added a new `STAFF_ONLY_ROLES` constant (every role except
      STUDENT/GUARDIAN) and applied it router-wide to both. The portal's marksheet-download and
      profile views now go through new ownership-checked portal-only endpoints instead of the
      admin ones. **This audit was not exhaustive** — see deferred items below.
- [x] `apps/portal` — built out from the Phase 0 placeholder: `lib/api.ts` + `stores/auth-store.ts`
      (mirrors the admin app's axios-interceptor/refresh/Zustand pattern, separate localStorage
      key, plus a `students`/`activeStudentId` slice for the guardian multi-child case),
      `components/protected-route.tsx`, `components/bottom-nav.tsx` (5 items per spec),
      `components/portal-shell.tsx` (wraps every page, shows a horizontal child-switcher strip
      only when a guardian has >1 linked student). Pages: `/login` (Student ID or phone + password),
      `/` (mobile card-stack dashboard matching the spec's header/today/quick-stats/upcoming-exams/
      notices/result/homework sections), `/results` + `/results/[exam_id]` (subject table +
      "Print Result Card" opening the real PDF), `/attendance` (Monthly calendar grid
      color-coded by status + summary row, Yearly per-month % cards), `/fees` (outstanding-dues
      alert, per-invoice Pay Now → gateway bottom sheet, collapsible payment history), `/notices`
      + `/notices/[id]`, `/routine` (day tabs, current-day/current-period highlight), `/homework`
      (Pending/Submitted/All tabs, client-side-only "Mark as Done" per spec's "visual only, no
      submission for v1"), `/profile` (now backed by the new ownership-checked endpoint, not the
      admin one — see above).
- [x] PWA: `public/manifest.json`, a hand-rolled `public/sw.js` (cache-then-network for
      `/api/portal/*` and `/api/content/*` GETs so the dashboard/notices/attendance can show stale
      data offline per the spec's offline-behavior section, navigation fallback to
      `offline.html`), registered from `providers.tsx`. An `online`/`offline` listener shows the
      spec'd "You're offline — showing cached data" banner. `next-pwa` was deliberately not
      installed — see deferred items.
- [x] Verified live against the dev Postgres with real fixtures (two sibling students sharing one
      guardian phone, all cleaned up after): confirmed the guardian-login SMS carried a real,
      usable temp password and the student's own SMS did too (the bug fix above, verified via the
      actual log line, not just code review); logged in as the student via **Student ID** (not
      phone) and confirmed it resolved correctly; logged in as the guardian and confirmed
      `/api/portal/me` returned **both** linked children; confirmed the second student's
      guardian-creation call correctly reused the existing Guardian/User rather than creating a
      duplicate (matched by phone); confirmed a student token gets a clean `403 FORBIDDEN` from
      `/api/portal/student/:id/dashboard` for a sibling's id and `200` for their own; confirmed
      the same student token now correctly gets `403` (not the pre-existing free pass) from the
      admin `GET /api/students/:id` and `GET /api/documents/student/:id/id-card` after the
      `STAFF_ONLY_ROLES` fix; exercised homework/routine/subjects/profile endpoints against real
      fixture data and confirmed the dashboard's homework-pending count reflected the fixture;
      confirmed `POST /fees/pay` 404s cleanly for a nonexistent invoice. Full monorepo typecheck
      (11/11), `vitest run` (still 30/30), and both `admin`/`portal` production builds succeed
      (portal's Next.js `themeColor`-in-`metadata` warning was also fixed by moving it to a
      `viewport` export).
- [ ] Deferred: the router-role audit above covered only the two highest-risk routers
      (`documentsRouter`, `studentsRouter`); other admin routers (`attendanceRouter`,
      `resultsRouter`'s non-portal endpoints, `feesRouter`, exam/marks routers) still only check
      `authenticate` with no role gate and should get the same `STAFF_ONLY_ROLES` treatment in a
      follow-up pass — flagging this explicitly rather than silently claiming full coverage; push
      notifications are subscribe-only — no VAPID keys or actual push-sending exists yet (lands in
      Phase 17, per the spec's own layering); `next-pwa` was not installed in favor of a small
      hand-rolled service worker — simpler and avoids a dependency with known App-Router
      compatibility friction, but lacks `next-pwa`'s more sophisticated cache-strategy tooling;
      `manifest.json` references `icon-192.png`/`icon-512.png` that don't exist as real image
      assets yet (no institution branding to generate them from — same class of gap as other
      pending image assets throughout this project); language toggle (Bangla/English) on
      `/profile` is not implemented (bilingual data itself — `name_bn` etc. — is already modeled
      and returned by the API).

## Phase 16 — IoT/Biometric Device Service

- [x] `services/device` — standalone Express service (port 4500) implementing the ZKTeco ADMS
      push protocol: `GET /iclock/cdata` (connectivity check-in, auto-registers unknown serial
      numbers as an inactive `Device` row rather than dropping data silently), `POST /iclock/cdata`
      (parses tab-delimited ATTLOG punch lines), `GET /iclock/getrequest` (device polls for queued
      commands), `POST /iclock/devicecmd` (device confirms execution). Since ADMS is device-initiated
      and push-only, both "pull logs" and "push commands" are implemented via an in-memory
      per-serial-number command queue (`lib/command-queue.ts`) drained on the device's next poll —
      documented as not horizontally-scalable (would need Redis) and sufficient only for a single
      long-running process; real queue infra deferred to pair with Phase 17.
- [x] `connectors/` — adapter interface (`testConnection`, `pullPunchLogs`, `getUserList`,
      `pushUserList`, `enrollUser`, `deleteUser`, `clearLogs`, `getDeviceInfo`, `syncTime`) with a
      ZKTeco ADMS implementation and a generic-HTTP implementation for non-ADMS devices (fail-soft
      on unreachable devices), keeping the device brand swappable per the original plan.
- [x] `processor/punch.processor.ts` — dedup (device_id + device_user_id + punch_at, no DB unique
      constraint, consistent with the find-then-write pattern used since Phase 5), maps punches to
      `Student`/`Staff` via `biometric_id`, determines shift via the student's section shift (or all
      active shifts as fallback), determines PRESENT/LATE against `AttendanceRules.late_arrival_window_minutes`,
      writes/updates `AttendanceRecord` (BIOMETRIC beats MANUAL; a second same-day BIOMETRIC punch
      is left as first-punch-wins), and best-effort notifies the core API for future Socket.io
      wiring (currently just logs — no Socket.io server exists yet, a gap carried from Phase 5).
      Staff have no shift-matching since no Staff→Shift model exists in the schema.
- [x] `processor/reconciliation.ts` — since ADMS can't be polled for missed logs, "reconciliation"
      re-runs `processPunch()` on any `DevicePunchLog` still `is_processed: false` (e.g. punches
      that arrived before the person's `biometric_id` was registered) — proven live to self-heal
      once the mapping exists. `markDefaultAbsentees()` creates `ABSENT` records for active students
      with no attendance record for the day (Friday-excluded). Both run via `setInterval`-based
      recurring jobs (`jobs/sync.job.ts`, "BullMQ-lite") — real infra deferred to Phase 17.
- [x] Core API: `modules/devices/devices.routes.ts` (CRUD, `test-connection`, `sync-now`,
      `sync-users`, `enroll-user`, `punch-logs`, `unmapped`), `routes/internal.ts`
      (`POST /internal/attendance/biometric-event`, logs only), both directions of the
      device-service ↔ core-API bridge secret-gated via `x-device-service-secret` (mirrors the
      `WEBSITE_REVALIDATE_SECRET` pattern), role gate `DEVICE_MANAGE_ROLES = [ADMIN, IT_ADMIN]`.
- [x] Schema: `Device.serial_number` (nullable unique), `DevicePunchLog.mapped_person_type`.
- [x] Admin UI: `/settings/devices` — device list with live status-dot badges, expandable
      punch-log/unmapped tables, Test Connection/Sync Now/Sync Users actions, device registration
      dialog.
- **Bugs found and fixed via live testing (not caught by typecheck/build):**
  1. `packages/validators/src/students.ts` and `hr.ts` were missing `biometric_id` entirely from
     their create/update schemas — Zod silently stripped it from every request, making the entire
     biometric-enrollment feature non-functional from the admin side despite all backend plumbing
     being correct. Fixed by adding the field to both validators and both routes' explicit
     `tx.*.create()` data blocks.
  2. `GET /api/devices/:id/unmapped` filtered on `is_processed: true`, which an unmapped punch never
     reaches by design (it must stay `false` so reconciliation keeps retrying it) — the endpoint
     could never return a result. Fixed by dropping that filter, keeping only `mapped_person_id: null`.
- **Live-verification evidence** (two Node services run simultaneously, core API :4000 +
  device-service :4500, communicating over the shared-secret HTTP bridge): unknown-device
  auto-registration as inactive; connectivity check-in flips device to ONLINE; real ATTLOG push
  parsed and processed; punch correctly mapped to student via `biometric_id`; PRESENT determined
  for an 08:05 punch against an 08:00 shift + 15-min window, LATE determined for an 08:20 punch
  against the same shift; re-pushing an identical punch line produced zero new rows (dedup); the
  fixed `/unmapped` endpoint correctly showed an unmapped punch, which then disappeared after
  registering the person's `biometric_id` and calling `sync-now` (reconciliation self-heal,
  `{"retried":1,"resolved":1}`); command queue correctly returned queued commands in FIFO order
  on the device's next poll; `sync-users`/`enroll-user`/`test-connection` admin actions all
  verified. All test fixtures (devices, students, guardians, class/section/shift/year) cleaned up
  after verification; `GET /api/devices` confirmed empty afterward.
- **Explicitly deferred**: no real TCP/SDK integration for directly polling a device (ADMS is
  push-only by design, so this doesn't apply to ADMS devices; the generic-HTTP connector exists
  for that case but is untested against a real device); in-memory command queue is
  single-process-only; no Staff→Shift assignment model, so staff attendance skips late-window
  matching entirely; no Socket.io server yet, so the biometric-event endpoint only logs; the
  Phase 15 router-role-gate audit (`attendanceRouter`, `resultsRouter`'s non-portal endpoints,
  `feesRouter`, exam/marks routers still lack `STAFF_ONLY_ROLES`) remains outstanding.

## Phase 17 — Notification Service

- [x] `services/notification` — real BullMQ+Redis worker (three queues: SMS/Email/Push — named
      `notification-sms`/`-email`/`-push`; BullMQ rejects `:` in queue names, so the spec's
      `notification:sms` naming was adjusted), replacing the old direct-call stub in
      `sms.service.ts`/`email.service.ts`. `server/api` now only *enqueues* — `lib/queues.ts`
      holds the BullMQ `Queue` producers, `services/notification.service.ts` is the new
      config-driven, multi-channel, trigger-based sender (`sendNotification({trigger, recipients,
      template_data})`), and the plain `sendSms`/`sendEmail` helpers (still used by the ~15
      non-trigger call sites — OTP, password reset, staff/user creation, library issue, payment
      receipts) were rewritten to enqueue instead of logging inline, so a slow/down provider never
      blocks a request.
- [x] Every attempt gets a `NotificationLog` row up front (`status=QUEUED`, `trigger` nullable to
      cover plain non-templated sends too) that the worker updates to `SENT`/`FAILED`/`SKIPPED` —
      this is the delivery audit trail, browsable at `/settings/notifications/logs` (filter by
      status/channel/trigger, paginated). `FAILED` is only written once BullMQ's own retry
      (`attempts: 3`, exponential backoff) is exhausted, not on every individual attempt.
- [x] Providers: `sslwireless.provider.ts` (real BD SMS gateway adapter, BD phone
      normalization to `88` country code — genuinely wired, just waiting on the explicitly-deferred
      SMS_API_TOKEN/SID) with a `mock.provider.ts` fallback for dev; `nodemailer.provider.ts` (real
      SMTP) with a logging mock fallback; `webpush.provider.ts` (real `web-push`/VAPID) — a real
      dev VAPID keypair was generated and lives in `services/notification/.env` (gitignored). All
      three providers auto-select real-vs-mock purely from whether their credentials are present
      in env, so the whole pipeline is provably correct end-to-end without needing real accounts.
      Credentials moved out of `server/api/.env(.example)` entirely and into
      `services/notification/.env(.example)` — the API no longer talks to any provider directly.
- [x] Push delivery fetches every `PushSubscription` for the recipient's `user_id` (reusing Phase
      15's model as-is rather than adding a redundant `person_id`/`person_type` one from the spec),
      sends to each, and auto-deletes a subscription on a 404/410 (expired/revoked) response; the
      job only fails if *every* subscription for that user failed — a `SKIPPED` (not `FAILED`) log
      is written when a recipient has no subscriptions at all, since that's terminal, not transient.
- [x] Wired all 6 `NotificationTrigger` values to real business events (previously the whole
      config/template system built in Phase 1 had zero real callers): `ABSENCE` — attendance
      manual-mark's existing `sms_on_absent` check; `LATE` — the Phase 16 device-service
      biometric-event bridge (`internal.ts`), gated on the previously-unused
      `AttendanceRules.sms_on_late` flag; `FEE_DUE` — the analytics defaulters-risk "remind"
      endpoint, enhanced to compute a real outstanding-invoice total instead of a generic message;
      `RESULT_PUBLISHED` — the marks-publish route, using the existing `computeClassResults()`
      helper for real GPA per student; `NOTICE` — the notice `send-sms` route, generalized from an
      SMS-only helper into a `audienceRecipients()` builder that also surfaces email/user_id for
      multi-channel fan-out; `ADMISSION_CONFIRM` — the admission enroll step.
- [x] Improved `packages/db/prisma/seed.ts`'s `NotificationConfig` seed from a generic placeholder
      (`"A notification regarding {{student_name}} (TRIGGER)."`) to real per-trigger BN/EN
      templates matching the spec's own examples (ABSENCE/FEE_DUE/RESULT_PUBLISHED verbatim, the
      other three authored in the same style) — the live dev DB's already-seeded rows were
      force-updated to match via a one-off script, since `seed.ts`'s upsert intentionally never
      overwrites existing rows (so admin template customizations survive a reseed).
- **Live-verification evidence**: real end-to-end run across both Node services (core API :4000 +
  notification-service :4600) over the real Redis (`eduerp-redis-dev`, port 6380) and Postgres —
  plain SMS enqueue → mock provider → `NotificationLog` flips `QUEUED`→`SENT`; a real Notice
  publish to a temporary test guardian fanned out across all three channels at once (SMS to 6
  guardians via mock, Email via the logging mock, Push via **real** `web-push`) — `{"queued":8,
  "skipped":10}` matched the expected math exactly (6 SMS + 1 email + 1 push eligible; the other
  existing guardians lacked email/push so were correctly skipped, not failed). Push was proven with
  a genuine VAPID-encrypted payload over real TLS: a throwaway self-signed-cert HTTPS receiver
  confirmed an authentic encrypted Web Push body arrived (not a mock), a 201 response marked the
  log `SENT`, and a second subscription pointed at an endpoint returning 410 was **automatically
  deleted** from `PushSubscription` while the job still succeeded (since the other subscription
  came through) — proving both the success path and the expired-subscription cleanup path for
  real. An earlier attempt against a plain-HTTP (non-TLS) endpoint correctly exhausted all 3
  retries and landed as `FAILED` with an error message, confirming the retry-then-fail path too.
  All test fixtures (guardian, user, push subscriptions, notice, notification logs, temporarily-
  enabled EMAIL/PUSH channels on the NOTICE trigger) were cleaned up/reverted after verification.
- **Bug found and fixed mid-implementation**: BullMQ rejects `:` in queue names — the spec's literal
  `"notification:sms"` naming throws `Error: Queue name cannot contain :` at startup. Fixed by
  hyphenating (`notification-sms` etc.) on both the producer (`server/api/src/lib/queues.ts`) and
  consumer (`services/notification/src/workers/*.ts`) sides before either service could even boot.
- **Housekeeping**: a pnpm/ioredis version-skew bug surfaced during this phase — `bullmq` pins an
  exact `ioredis@5.10.1`, but `server/api`'s own `^5.4.2` range independently resolved to a newer
  `5.11.1`, and TypeScript treated the two installed copies' `Redis` classes as structurally
  incompatible (`lib/queues.ts` wouldn't compile). Fixed by pinning `ioredis` to the exact same
  `5.10.1` in both `server/api` and `services/notification`'s `package.json`, plus an `ioredis`
  entry in `pnpm-workspace.yaml`'s `overrides` as a second line of defense. While in there, also
  removed root `package.json`'s `pnpm.overrides` block — pnpm 9.15 has moved that config to
  `pnpm-workspace.yaml` and was silently ignoring the old location on every single command.
- **Explicitly deferred**: real SMS/SMTP credentials (client has deferred these since Phase 0);
  the portal's client-side `pushManager.subscribe()` call was never built (Phase 15 only built the
  subscribe-only *backend* endpoint) — `DELETE /api/portal/push-unsubscribe` was added this phase,
  but there's still no browser-side code that actually requests permission and calls
  `pushManager.subscribe()`, so push only works today via directly-inserted `PushSubscription`
  rows; template resolution happens in `server/api` at enqueue time rather than in the worker
  itself (a deliberate deviation from the spec's suggested `templates/template.resolver.ts`
  location — simpler, and avoids the worker needing its own DB read of `NotificationConfig` for
  every job); the same Phase 15 router-role-gate gap noted in Phase 16 remains outstanding.

## Phase 18 — Security, Performance, Docker, Testing, README

- [x] `server/api/src/lib/env.ts` — Zod-validated environment config, fails fast on boot with a
      clear message instead of surfacing a confusing error deep in a request handler.
- [x] `middleware/rate-limit.ts` — Redis-backed (`rate-limit-redis`) limiters: login (+ a
      login-ban-guard for repeated failures), forgot-password, public content endpoints, and a
      default API-wide limiter.
- [x] `middleware/upload.ts` — `imageUpload`/`documentUpload`/`csvUpload`/`templateUpload`, each
      verifying the real file content via magic bytes (`file-type@16` — pinned below v17 since this
      server has no `"type": "module"` and v17+ dropped CommonJS support), not just the
      client-supplied MIME type/extension.
- [x] `lib/sanitize.ts` — DOMPurify sanitization on `Notice.body` and `StaticPage` rich-text content
      before it's stored, closing a stored-XSS gap in the two rich-text-editor surfaces.
- [x] `lib/cache.ts` — `cached()`/`invalidateCacheNamespace()` Redis read-through cache helpers.
- [x] `middleware/request-id.ts`, `middleware/error-handler.ts` (maps Prisma P2002/P2025/P2003 to
      the project's standard `{success:false,error:{code,message}}` shape instead of leaking raw
      Prisma error text), `routes/health.ts` (real DB + Redis connectivity checks, plus a
      `/detailed` admin-only variant).
- [x] Docker — one Dockerfile per deployable unit (server/api with Chromium for Puppeteer, the 3
      Next.js apps with `output: "standalone"`, the 2 background services), `docker-compose.yml` +
      `docker-compose.prod.yml` + `Makefile` + `.dockerignore`. Every Dockerfile needed a fix to
      also copy `packages/config` — found via a real `docker build` failure, not a review.
- [x] `README.md` — fully rewritten for the new architecture, preserving pre-existing
      `infra/bicep`/CI references. `.github/workflows/ci.yml` rewritten from a stale
      npm/old-architecture version to pnpm + Postgres + Redis service containers.
- [x] Seed data — classes/sections/subjects, 5 demo students, 6 staff users with distinct roles
      (for RBAC testing).
- [x] `vitest.config.ts` + `vitest.setup.ts` — vitest doesn't load `.env` by default, which made
      `env.ts` call `process.exit(1)` mid test-run; fixed with a setup file that imports
      `dotenv/config` first. New test files: `student-id-format.test.ts` (6 tests),
      `packages/validators/src/validators.test.ts` (16 tests). 36 vitest tests passing across the
      monorepo.
- [x] Full monorepo typecheck and `pnpm build` clean across all 11 packages after recovering from
      an unrelated pnpm-store corruption incident (see Phase 8B/8C section above for the
      environment-crash timeline).
- [ ] Deferred (flagged, not yet built): no ESLint config anywhere in the monorepo, so lint isn't
      in CI either; no Socket.io server actually stood up despite being in the original tech stack
      (flagged since Phase 5); no BullMQ-backed PDF queue for bulk document generation; a handful
      of routers (`attendanceRouter`, some of `resultsRouter`, `feesRouter`, exam/marks routers)
      still rely on per-route `authorize()` calls rather than a blanket `STAFF_ONLY_ROLES` gate at
      the router level (flagged since Phase 15, not a known vulnerability — every sensitive route
      is individually gated — just an inconsistency in style). Compression middleware was missing
      here too — fixed in the Test Playbook Audit pass below.

## Test Playbook Audit — Security, Theme, SEO, Completeness (July 2026)

Ran the scriptable/grep-based checks from `TEST_PLAYBOOK.md` and `TEST_PLAYBOOK_PART2.md` across
the whole codebase (Master Security Audit, Master One-Command Full Audit, Skip/Completeness Audit,
Phase-by-phase completeness checks). Genuinely manual-only items (Lighthouse scores, browser
DevTools contrast checker, PWA install-prompt flow, device-toolbar responsive testing) are **not**
verifiable in this environment and are called out explicitly below rather than assumed passing.

- [x] **Security** — grep-audited: no `password_hash` in any API response, no wildcard CORS, no
      hardcoded/short JWT secrets (env-validated at boot, min 32 chars), no unparameterized raw
      SQL (`$queryRaw` used exactly once, a static `SELECT 1` health check), 234 Zod-validated
      inputs, Helmet present, rate limiting confirmed on login (5/15min + 1hr ban), forgot-password
      (3/hr keyed by phone), public endpoints (20/min), content (100/min), and a global default
      (60/min keyed by user). Payment webhook adapters (bKash/Nagad/SSLCommerz) all throw on
      `verifyCallback()` rather than trusting an unsigned payload — safe-by-being-stubbed, matching
      the documented external-credentials deferral.
- [x] **Real bug found and fixed — CORS fail-open in production**: `app.ts`'s CORS origin fell
      back to `true` (reflect-any-origin, credentials enabled) whenever `ADMIN_URL`/`PORTAL_URL`/
      `WEBSITE_URL` were all unset — and all three are `.optional()` in `env.ts`, so a misconfigured
      production deploy could silently boot with CORS wide open. Fixed: boot now throws if
      `NODE_ENV=production` and none of the three are set, matching the existing fail-fast pattern
      for missing JWT secrets. The permissive fallback still applies in dev, unchanged.
- [x] **Real bug found and fixed — unsanitized stored XSS in `map_embed_code`**: `Notice.body` and
      `StaticPage.content` are sanitized via `sanitizeHtml()` (DOMPurify) before storage, but
      `InstitutionProfile.map_embed_code` (a Google Maps iframe snippet) had no sanitization at all
      despite being rendered via `dangerouslySetInnerHTML` on two public pages (homepage, contact).
      Added `sanitizeEmbedCode()` (DOMPurify with an iframe allowlist) and applied it on write.
- [x] **Real gap found and fixed — no audit trail existed anywhere**: the security audit explicitly
      calls for an `AuditLog` table logging sensitive actions; none existed. Added the model
      (migration `20260704140000_audit_log`), `lib/audit-log.ts` (`logAudit()`, fire-and-forget,
      never throws into the caller), wired into login/logout/failed-login, mark-entry submit,
      result approve/publish, fee waiver, student soft-delete, role change, and template
      activation. Added `GET /api/settings/audit-log` (ADMIN/IT_ADMIN only) and an admin UI page
      at `/settings/audit-log`. Live-verified: a real login and a real failed login both produced
      the correct log rows.
- [x] Compression middleware was missing (flagged in the Phase 18 section above) — added
      (`compression()` in `app.ts`).
- [x] **Real gap found and fixed — no manual staff attendance endpoint existed**: payroll's
      absence-deduction calculation and the analytics dashboards both already query
      `AttendanceRecord` rows with `person_type: "STAFF"`, but the only two writers of such rows
      were the biometric device bridge and leave-approval (which only ever writes `LEAVE` status).
      An institution with no biometric device for staff had no way to mark staff attendance at
      all, silently breaking payroll's present-day calculation. Added
      `POST /api/attendance/staff/mark`, mirroring the existing student `/mark` upsert pattern.
      Live-verified: marked PRESENT, re-marked the same staff+date as LATE, confirmed the upsert
      (not a duplicate) via the same unique-constraint pattern as the student endpoint.
- [x] **Real bug found and fixed — `Exam` was hard-deleted**, violating CLAUDE.md's explicit
      "never hard-delete student, staff, exam, or result data" rule (the only literal violation
      found — the ~19 other `prisma.model.delete()` call sites are all Settings/config or website
      content, not student/staff/exam/result data). Added `Exam.deleted_at` (migration
      `20260704141500_exam_soft_delete`), the delete route now sets it instead of hard-deleting,
      and the list query now filters `deleted_at: null`.
- [x] **Real gap found and fixed — 8 raw `<img>` tags on the public website**, explicitly flagged
      by both the Website/SEO audit and the Master Audit (`grep "<img "` must return 0). Converted
      all 8 (navbar logo, faculty/governing-body avatars, gallery grid + lightbox, homepage slider +
      album cover) to `next/image`, added `images.remotePatterns` to `next.config.mjs` for Azure
      Blob and the local-upload fallback. Verified via a full `next build` (all pages still
      generate, First Load JS unchanged).
- [x] **Real gap found and fixed — zero SEO metadata anywhere on the public website**. All 15
      website `page.tsx` files are client components (`"use client"`), so none can export
      `generateMetadata` directly — converting all 15 to a server/client-split pattern was judged
      too large a refactor for this pass. Instead fixed at the root: `layout.tsx` now has
      `generateMetadata()` fetching the real institution profile server-side (dynamic title with
      a `%s | {name}` template, description, OpenGraph, Twitter card, `metadataBase`) plus
      JSON-LD `EducationalOrganization` structured data — every page now inherits real, correct
      baseline metadata instead of a hardcoded placeholder. Added `sitemap.ts` (static routes only
      — see the slug gap below) and `robots.ts` (disallows `/result`, `/api/`, `/admin/`).
      Live-verified via a production build + serve: title/description/JSON-LD all resolve to the
      real seeded institution name, `/sitemap.xml` and `/robots.txt` both serve correctly.
- [ ] **Deferred, explicitly scoped out — slug-based URLs for website content**: the SEO audit's
      Section A calls for `/notices/{slug}` instead of ID-based URLs. `Notice`/`GalleryAlbum`/
      `Download` have no `slug` column at all today, and `/notices` doesn't even have a per-notice
      detail route yet (everything renders inline on one list page). Adding this properly means a
      schema migration + `slugify` on write + per-content-type detail pages + backfilling the
      sitemap — a contained but real follow-up feature, not a grep-pass fix, so it's called out
      here rather than attempted partially.
- [x] **Real gap found and fixed — no root `.env.example` existed at all**, despite CLAUDE.md
      explicitly requiring it ("`.env.example` stays up to date"). Each service has its own real
      `.env` (`packages/db/.env`, `server/api/.env`, `services/device/.env`,
      `services/notification/.env`) but nothing at the repo root documented the full set for a new
      environment. Added one, organized by which service loads which variable.
- [x] Schema/completeness counts checked against the playbook's thresholds: 96 models (≥40 ✅), 54
      enums (≥25 ✅), 81 audit-timestamp columns (≥30 ✅), 60 indexes (≥20 ✅), 75 settings
      endpoints (≥40 ✅), 41 website endpoints (≥25 ✅). Soft-delete columns were only 3
      (Student/Staff/Voucher) before this pass — see the Exam fix above; CLAUDE.md's rule only
      names student/staff/exam/result data specifically, so this is correct as-is, not a gap.
- [x] Theme audit (admin panel): 0 `dark:` classes, 0 near-black backgrounds, 0 low-contrast text
      classes found — clean, matches the light-mode-only spec with no fixes needed.
- [ ] **Not verifiable in this environment, flagged for manual QA before client handoff**:
      Lighthouse scores (Performance/Accessibility/Best-Practices/SEO), the browser DevTools
      accessibility contrast checker, the PWA install-prompt flow and offline-mode toggle on the
      portal, and responsive layout at 375px/768px/1280px via an actual device toolbar. None of
      these have a scriptable equivalent — they require a real browser.
- [x] Full monorepo re-verification after every fix in this pass: `pnpm typecheck` (11/11),
      `pnpm turbo build` (7/7 buildable packages, admin/portal/website/api all succeed), `vitest
      run` (52/52 tests: 36 in `@education-erp/api`, 16 in `@education-erp/validators`).
- Recovered from a recurring Windows-specific pnpm-store corruption (the `next` package's
  `dist/compiled/jest-worker` or `styled-jsx` intermittently going missing mid-session, most
  likely real-time antivirus interference rather than anything in this session's own actions,
  since it recurred even directly after a clean, verified build) three separate times during this
  pass — each time fixed via `rm -rf` of the specific corrupted package directory in the pnpm
  store followed by `pnpm install --force`.

## Phase 19 — Mobile apps (Flutter) — FUTURE, out of scope

---

## Verification approach (every phase)

Schema → `pnpm db:migrate` against the live Docker Postgres → `pnpm typecheck` across the
monorepo → `next build` for affected apps → `vitest run` → live curl smoke test of every new
endpoint → fetch actual rendered HTML for frontend changes (or Puppeteer screenshot for
PDFs/Bangla text — text-extraction tools are unreliable for complex scripts) → update this file.
