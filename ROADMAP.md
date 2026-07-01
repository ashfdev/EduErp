# Education ERP — Full Build Checklist

Status: **Phases 0-4 are done** — platform foundation, Foundation/SIS/Auth/Attendance, Fee &
Finance + Payroll, Exams/Results/Documents/MCQ/Certificate Verification, and Website Maintenance.
A follow-up pass also closed several Phase 1/2 loose ends (late-fee engine, installments, bulk SMS
reminders, Excel export, grading scale selector, document vault + a local-storage dev fallback,
and a Supertest suite codifying the golden paths). All verified against a live Postgres database
(not just typecheck/build) — see "Verified" notes per section. Everything below Phase 4 is what
remains. Organized by phase; each module lists Data model / Core API / Admin Web / Portal-PWA /
Public Site / Integration / Test tasks so nothing gets silently skipped.

Legend: `[ ]` not started · `[~]` partially done / stubbed · `[x]` done and verified

---

## Before any phase can go to real production: external accounts & credentials

These cannot be built or faked — they have to come from you. Nothing downstream that depends on
them can be "fully functional" (as opposed to sandbox-tested) without these:

- [ ] **Azure subscription** (or confirm continuing with Azure) — for App Service, PostgreSQL Flexible Server, Blob Storage, Key Vault. Dev DB currently runs in a local Docker Postgres container (`EduErp` db, port 5433). File uploads work without Azure too now — `lib/blob.ts` falls back to signed local-disk storage — so this is genuinely just a production-deployment blocker, not a "can't test the feature" blocker anymore.
- [~] **Pilot institution details**: legal name (Bangla+English), EIIN, board affiliation, logo, address, actual academic year dates — currently seeded with placeholder "AshDevs Demo School" data
- [ ] **bKash merchant account** (sandbox keys to start; production keys later) — https://developer.bka.sh — adapter interface exists (`lib/payments/bkash.ts`) but returns "not configured" until real `BKASH_APP_KEY` etc. are set, and the actual sandbox call is still unimplemented even once configured (see Phase 2 notes)
- [ ] **Nagad merchant account** (sandbox → production) — same status as bKash
- [ ] **SSLCommerz / AamarPay account** (aggregator fallback) — same status
- [ ] **SMS gateway account** — SSL Wireless / Mim SMS / Bulk SMS BD (API key + Sender ID) — `lib/notify.ts` currently just console-logs
- [ ] **Domain name** for the pilot institution's public site + admin subdomain
- [ ] **Biometric device** make/model at the pilot institution (assumed ZKTeco/ADMS per PRD default — confirm)
- [ ] Digital signature images (Principal/Exam Controller/etc.) and institution seal, once known

Everything else below can be built and tested against sandboxes/seed data without these.

---

## Phase 1 — Foundation completion: SIS, full Auth, Manual Attendance — **DONE**

### 1.1 Auth & RBAC — done
- [x] Forgot-password flow (`/api/v1/auth/forgot-password`, `/reset-password` — OTP via the notify stub, hashed reset tokens, 30-min expiry)
- [x] Granular permission matrix: `RolePermission` DB table + `requirePermission(module, action)` middleware, falls back to PRD §3 defaults (`lib/permissions.ts`) when no tenant override exists. Institution Admin can view/edit via `GET/PUT /api/v1/settings/permissions`. Verified live: default-deny → admin grants override → allowed, end-to-end.
- [x] Super Admin impersonation (`/api/v1/auth/impersonate`) — mandatory reason, audit-logged, short-lived token with no refresh token
- [x] 2FA (TOTP): setup/verify/disable + login enforcement, verified live with a real generated TOTP code (otplib v13)
- [x] Fixed a pre-existing bug found while building this: `/api/v1/auth/sessions` and `/sessions/:id/revoke` had **no auth middleware at all** — any caller could enumerate/revoke any session. Now requires auth and scopes to the caller's own sessions.

### 1.2 Settings Module — done
- [x] Institution profile, academic years (single-active enforcement, verified live), shifts, holiday calendar, user management (create/disable/reset-password + session revoke on reset), audit log viewer, permission-matrix viewer/editor
- [ ] `Tenant` provisioning flow for Super Admin to create a *new* institution (today there's one seeded tenant; multi-tenant onboarding UI doesn't exist yet — fine for single-institution launch, needed before onboarding a 2nd tenant)
- [ ] Grading scale selector — deferred to Phase 3 (belongs with the grading engine)

### 1.3 Student 360° Profile — done
- [x] `SubjectTeacherAssignment`, `StudentAcademicHistory` models
- [x] Student CRUD, auto UID generation (verified: sequential `ASH-2026-0000N`), guardian create/link
- [x] Admin UI: Personal, Guardian, Health Record, Academic History, Discipline tabs
- [x] Promotion workflow, verified live (history logged, class/section/status updated)
- [x] Health record fields + UI (chronic conditions, emergency contact — vaccination JSON has a schema field but no dedicated UI yet)
- [x] Discipline/remarks log, admin/class-teacher only (permission-gated, verified live)
- [x] Photo upload wired to the student record (upload → PATCH `photoUrl` → shown on profile), verified live
- [x] Document vault UI (`components/DocumentVault.tsx`, shared with staff) — verified live including a local-storage dev fallback (see §1.6)

### 1.4 Staff Profile & Assignment — done
- [x] Staff CRUD, auto UID generation, subject/class/section assignment
- [x] Gap-fix: staff had no `PATCH /:id` at all — added, plus a staff detail page (photo, documents, assignments) that didn't exist before
- [x] Document vault UI + photo upload, same as students, verified live

### 1.5 Manual Attendance — done
- [x] `AttendanceRecord` model, bulk mark (mark-all-present + exceptions), daily register, monthly grid, defaulter report — all verified live including the upsert tenant-scoping fix
- [ ] Teacher UI is a plain web form, not offline-first — PWA-level local-queue-then-sync behavior (PRD §6.2 "works offline-first on teacher's phone") isn't built; that belongs with portal-pwa, not admin-web
- [x] PDF export of the register — lands with Phase 3's Document Service (marksheet/tabulation patterns reusable); Excel export pattern now proven via the Phase 2 fee-ledger export

### 1.6 File Storage & Document Service bring-up — done
- [x] Azure Blob SDK wired, upload endpoint, malware-scan interface (stubbed — not real scanning, clearly flagged in code), signed/expiring download URLs
- [x] **Local-storage dev fallback** (gap-fix): when `AZURE_STORAGE_CONNECTION_STRING` isn't set, uploads write to local disk with an HMAC-signed URL scheme mirroring Azure SAS tokens — genuinely working (not a stub), verified live end-to-end (upload → list → signed URL → tampered-token rejection all confirmed). Mirrors the CASH-gateway pattern: a real local option alongside the real cloud integration.
- [x] Puppeteer PDF service — live since Phase 3 (marksheet + tabulation), Bangla font visually verified

### 1.7 Tests & seed data — mostly done
- [x] Seed script (`prisma/seed.ts`) — demo tenant, admin, 3 students, class/section/shift/academic year
- [x] Every Phase 1-4 endpoint smoke-tested live against a real Postgres
- [x] Supertest suite (`src/golden-path.test.ts`) codifying the golden paths: auth, student/attendance/fee/exam flows, and the permission-matrix override mechanism — 11 automated tests, run as part of `npm test`
- [ ] Playwright e2e — still not started, lower priority now that the Supertest suite covers the same flows at the API level

---

## Phase 2 — Fee & Finance + Payroll — **DONE** (core flows; gateways stubbed)

- [x] `FeeStructure` model + API (category × class × section × academic year)
- [x] `Invoice` generation from a fee structure, idempotent (re-running skips students who already have one), scoped to class/section, respects student status=ACTIVE
- [x] Manual/cash collection — fully functional, verified live (partial payment, status transitions PENDING→PARTIAL→PAID)
- [x] Payment adapter interface (`lib/payments/`) — `CASH` gateway fully working; `BKASH`/`NAGAD`/`SSLCOMMERZ` are structured stubs that throw a clear "not configured" error until real credentials exist, and their sandbox call bodies are still TODO even once configured — **do not treat these three as functional**
- [x] `OutboxEvent` worker draining `payment.succeeded` → invoice update, verified live (polling every 5s, not BullMQ — see note below)
- [x] Refund workflow (`RefundRequest`, approval, ledger reversal) — verified live end-to-end
- [x] Scholarship/waiver as a structured entity (`Scholarship` model, percentage or fixed, applied at invoice-generation time) — not yet exercised live with a non-zero scholarship (logic written, worth a follow-up smoke test)
- [x] Daily collection report, defaulter list — verified live
- [x] Payroll: `SalaryStructure`, attendance-linked deductions (computed from real `AttendanceRecord` absent-day counts), bulk payroll run, payslip data endpoint — verified live with correct math (gross/deductions/net all checked by hand against the smoke-test numbers)
- [x] admin-web UI: Fees (Structures/Invoices/Refunds/Reports tabs), Payroll (structure + run + records)

**Closed in a follow-up pass (all verified live):**
- [x] Late-fee rule engine (`lib/lateFee.ts`) — computes per-day accrual, flips status to OVERDUE; verified live (5 days × 10/day = 50 accrued, status transition confirmed)
- [x] Installment plans — split an invoice into N staggered-due-date invoices, verified live (1500 → 3× 500, 30 days apart, original cancelled)
- [x] Bulk SMS reminder to defaulters (`POST /fees/reports/defaulters/remind`) — verified live, correctly found/skipped defaulters
- [x] Excel export of the fee ledger (`exceljs`) — verified live, unzipped the actual .xlsx and confirmed real row data inside, not just a 200 response

**Still not built (real gaps, not oversights):**
- [ ] Receipt PDF — Payment records exist with a `receiptUrl` field, nothing renders into it yet (reuses the Phase 3 Document Service template pattern)
- [ ] Bank reconciliation
- [ ] Double-entry accounting core (trial balance, income/expense statements)
- [ ] Advance/loan tracking against payroll
- [ ] **BullMQ + Redis** — the outbox worker is a plain `setInterval` poll for now; no Redis instance has been provisioned or tested. Swap-in point is `jobs/outbox-worker.ts`, the function signature won't need to change.

---

## Phase 3 — Examination + Result + Document Generation (+ v1 additions: MCQ, Certificate Verification) — **DONE**

- [x] `Exam`, `ExamClass`, `ExamSubjectConfig`, `MarkEntry` (with `attemptNumber` for retakes), `RemarkRequest`, `ExamSeatPlan`, `ResultPublication`, `ExamResult` models
- [x] Exam setup API (types, dates, mark-entry window enforced live, subject full/pass marks, seat plan)
- [x] Mark entry API (window-gated, verified live — a mark-entry POST outside the window is rejected) + moderation workflow (Draft → Submitted → Approved), verified end-to-end
- [x] Grading engine: BD board (A+–F, GPA) + CGPA 4.0 bands, 4th-subject rule (`lib/grading.ts`) — verified live: 92%→A+/5.0, 55%→B/3.0, 78%→A/4.0, all correct. **Caveat**: the CGPA_4 bands and the 4th-subject formula mirror commonly-cited standards but haven't been checked against an actual board/university circular — flagged in code comments, verify before relying on either for a real, disputable result.
- [x] Position/merit rank calculation (class-wide + section-wide, competition ranking with tie handling) — verified live with correct ranks
- [x] Result publish → computes `ExamResult` per student, creates `ResultPublication`, queues a `result.published` outbox event, and registers a `DocumentRegistry` entry per student (feeds the verification portal) — all in one transaction, verified live
- [x] Marks re-check/remark request workflow — verified live (92→95 adjustment, grade recomputed correctly)
- [x] Retake/improvement exam attempt tracking — verified live (`attemptNumber` increments, original attempt preserved)
- [x] Puppeteer Document Service (first real use) — marksheet + tabulation sheet, Noto Sans Bengali embedded and **visually confirmed correct** (screenshot-verified; `pdftotext` extraction of Bengali conjuncts is unreliable and not a valid verification method — documented this pitfall since it looked like a bug at first). Fee receipt PDF and payslip PDF (Phase 2 leftovers) not yet built — same template system, just not wired to those routes yet.
- [~] Bulk print: individual marksheet and class-wide tabulation work; campus-wide (all classes in one export) and Excel parallel export not built
- [x] **Online MCQ/Quiz module**: `Question`/`Quiz`/`QuizAttempt` models, question bank, quiz creation, student start/attempt/submit with randomized order and answer sanitization (correct option never leaked pre-submission), auto-grading — verified live end-to-end including a partially-correct score
- [x] **Certificate Verification Portal**: `DocumentRegistry` with hash + short verification code, QR generation, public no-login `/api/v1/verify/:code` endpoint — verified live, confirmed it returns only safe fields (never raw marks/NID)
- [x] Public result lookup (`/api/v1/public/results/lookup`, no auth) — verified live
- [x] admin-web UI: Exams list/create, Subject Configs, Mark Entry (roster load + save/submit/approve), Results & Publish (with marksheet/tabulation PDF download)

**Real bugs found and fixed via live testing (not caught by typecheck/build):**
- Students had no way to log in — the login endpoint only checked email/phone, never `studentUid`, despite PRD §5.9 requiring Student ID as the login credential and students having neither email nor phone on file. Fixed to also match `studentUid`/`staffUid`.
- `DocumentRegistry.entityId` was originally just `studentId`, which would collide across different exams for the same student. Changed to `${examId}_${studentId}`.
- The Noto Sans Bengali file-matching filter matched on a substring that also appeared in unrelated files (`latin-400-normal.woff2` contains "bengali" as part of the *package* name) — worked by coincidental sort order, fixed to exact filename match.

**Not built in Phase 3:**
- [ ] Report card (detailed — marksheet + attendance summary + conduct grade + co-curricular)
- [ ] Admit card generation (mentioned in PRD §9 doc list, shares the template system but not built)
- [ ] Excel parallel export alongside PDF
- [ ] Campus-wide (all-classes) tabulation export
- [ ] SMS blast on result publish (outbox event fires; no SMS provider wired yet, same gap as Phase 2/4)
- [ ] Website ISR revalidation on publish (Phase 4 doesn't exist yet)

---

## Phase 4 — Website Maintenance + Notices + Communication — **DONE** (core 9 of 15 sub-modules)

- [x] Slider/Banner management — publish window fields exist and are filtered on the public read side; no drag-reorder UI (uses a plain `order` field, settable but no drag interaction)
- [x] Pages/Content — plain HTML body field (not a Tiptap/Quill rich-text editor — admin pastes/writes HTML directly), Bangla+English fields, SEO meta fields all present and working
- [x] Authority messages (Principal/Chairman/etc.) — CRUD + public rendering
- [x] Governing body/committee management — grouped by `groupName` (Governing Body / Academic Council / Finance Committee)
- [x] Photo gallery (albums + images) — no lightbox JS, no password-protected albums, just a public/private toggle
- [x] Notice board + Daily Notification — audience targeting, pin, expiry, SMS blast wired to the notify stub (still needs a real SMS provider), verified live including the public-only filtered feed
- [x] Download section (categorized files) — verified live, public-site groups by category
- [x] Events/academic calendar — CRUD + typed (HOLIDAY/EXAM/CULTURAL/SPORTS/PARENT_MEETING); no Google Calendar sync, no Hijri display
- [x] Faculty directory — sourced from HR (`Staff.showOnWebsite`/`qualification` gap-fix added), verified live end-to-end (marked a real staff member, saw them on the public page)
- [x] Contact & social settings + contact-form inbox — verified live including CAPTCHA (correct answer accepted, wrong answer rejected, replay rejected)
- [x] **CAPTCHA + rate-limiting** (gap-fix) — self-hosted math CAPTCHA (`lib/captcha.ts`, no external site-key dependency) + `express-rate-limit` applied to `/content`, `/verify`, and `/public` (the latter two were flagged as gaps back when Phase 3 shipped them unprotected — closed now)
- [x] Content API (`/api/v1/content/*`) — public-site fetches through it with Next.js `revalidate` (time-based ISR, not the on-demand webhook-triggered revalidation the PRD describes — see below)
- [x] admin-web UI: Notices / Pages / Sliders / Gallery / Downloads / Authority & Committee / Events / Contact, all in one Website Maintenance page
- [x] public-site pages: homepage (slider + notices), notices, pages/[slug], faculty, gallery, downloads, contact (CAPTCHA form), result lookup, certificate verification — all server-rendered and live-verified (fetched actual rendered HTML, confirmed real institution/notice/faculty data appears, not placeholders)

**Not built:**
- [ ] Rich-text editor (Tiptap/Quill) for Pages — currently a raw HTML textarea, functionally works but not the WYSIWYG editor PRD §4.2 describes
- [ ] Drag-and-drop slide reordering, lightbox gallery viewer, password-protected albums
- [ ] Class routine/timetable + substitute-teacher scheduling — genuinely not started, needs its own data model
- [ ] Diary/Homework — genuinely not started
- [ ] Google Calendar sync, Hijri calendar display for madrasah tenants
- [ ] Template section (theme/font picker) — logo/favicon fields exist on Tenant, no template-switching UI
- [ ] Emergency broadcast alert type — Notice model could carry this today (it's just data), but no dedicated UI/flow distinguishing it from a normal notice
- [ ] Web-push via FCM
- [ ] True on-demand ISR revalidation (webhook-triggered on publish) — current implementation uses Next.js time-based `revalidate` (30s–300s depending on route), which is simpler and works, but isn't the "updates within seconds of publish" behavior the PRD specifically calls out

---

## Phase 5 — Online Admission Module

- [ ] `AdmissionCycle` model + open/close per class/year, seat quota, reserved categories
- [ ] Dynamic form builder (configurable fields per class, standard BD fields pre-seeded)
- [ ] Subject/group selection (compulsory auto-select, elective picker)
- [ ] Public application flow on public-site (with document upload, preview before submit)
- [ ] `AdmissionApplication` pending queue, filter/sort, merit list generation
- [ ] Shortlist actions (Admit/Waitlist/Reject, bulk + individual)
- [ ] Seat confirmation → auto-creates `Student` + `User` in SIS (reuses Phase 1's student-creation logic)
- [ ] Application-status tracker (applicant logs in with application ID)
- [ ] Admit card + Registration card generation (reuses Phase 3 document/template system)
- [ ] Consent capture (guardian data-processing consent) — gap-fix
- [ ] Lottery-draw feature for over-subscribed classes — gap-fix
- [ ] Waitlist auto-promotion when accepted applicant doesn't confirm in N days — gap-fix
- [ ] Sibling/staff-child auto fee-category & quota linkage — gap-fix (reuses Phase 2's Scholarship/fee-structure scoping)

---

## Phase 6 — Biometric/IoT Attendance

- [ ] `Device`, `DevicePunchLog` models (already sketched in PRD ER model — add to schema)
- [ ] IoT/Device microservice: ZKTeco/ADMS push-protocol connector
- [ ] Offline buffer + reconciliation job (dedupe, backfill on reconnect)
- [ ] Shift-aware punch → `AttendanceRecord` matching (reuses the existing `AttendanceRecord` model from Phase 1 — `source: BIOMETRIC` is already a valid enum value, unused until this phase)
- [ ] Socket.io real-time feed to admin dashboard
- [ ] Conflict rule: biometric precedence, manual override with mandatory reason (both retained)
- [ ] Device registration/management UI (Settings §12.6): sync status, health
- [ ] **Confirm actual device brand with pilot institution before building this phase** (still open)

---

## Phase 7 — HR + Payroll polish + ID Cards + Document Templates

- [ ] Leave management: types, apply→HOD/Principal approval, leave balance, auto-reflect in attendance
- [ ] Recruitment: job posting, application tracking (apply→shortlist→interview→offer→joining)
- [ ] Training program tracking
- [ ] Full document/template system (PRD §9): signature & authority management, logo/branding placement, template upload+preview+per-print selection
- [ ] All ID card types (Student front/back, Staff front/back, HR/non-teaching) — QR code linking to profile
- [ ] Testimonial/Character Certificate, Transfer Certificate (BD board format)
- [ ] Extend Certificate Verification Portal (Phase 3) to TC/Testimonial
- [ ] Co-curricular/sports activity & achievement tracking — gap-fix
- [ ] Performance appraisal/KPI cycle (optional, confirm scope) — gap-fix
- [ ] Payroll advance/loan tracking (Phase 2 leftover)

---

## Phase 8 — Library + Transport + Hostel + Inventory

- [ ] Library: book catalog, barcode/QR issue-return, member cards, fine calculation, reservation queue, reports
- [ ] Transport: routes/stops, vehicle+driver details, student-route assignment→fee linkage (reuses Phase 2's `FeeStructure`), optional GPS tracking, driver SMS
- [ ] Hostel: block/floor/room/bed hierarchy, room allocation→fee linkage, visitor log, hostel-specific attendance, warden/duty roster
- [ ] **Inventory/Asset module** (gap-fix — PRD's own Phase 8 title mentions this but never defines it): `InventoryItem`, `AssetRegister`, `PurchaseOrder`, `Vendor` models; procurement flow, stock issue/return, asset depreciation

---

## Phase 9 — Analytics + Mobile Apps + BANBEIS Export

- [ ] Institution admin dashboard (today's attendance, fee collection, upcoming exams/events, quick actions — real data sources already exist from Phases 1–2, just needs an aggregation endpoint + UI)
- [ ] Academic analytics (attendance trend, result performance graph, dropout-risk flagging, subject performance)
- [ ] Finance analytics (collection efficiency, defaulter trend, payroll cost by department — data already in `Invoice`/`Payment`/`PayrollRecord`)
- [ ] Export/print from every dashboard (Excel/PDF) + scheduled report emails
- [ ] Meilisearch for student/staff/document search at scale — gap-fix
- [ ] Read-replica for analytics queries, separate from OLTP load — gap-fix
- [ ] Flutter mobile app (Guardian + Teacher companion) — deferred, PWA covers v1
- [ ] BANBEIS-compatible scheduled export job

---

## Backlog (explicitly deferred, revisit post-v1)

Alumni management · WhatsApp Business notifications · Canteen/tuck-shop · Parent-teacher video
meeting booking · Self-serve multi-tenant billing/subscription module · Custom domain mapping
per tenant · Full university credit-hour/course-registration flow · VAT/Mushak invoicing ·
In-app teacher-guardian chat · Full LMS/video-lecture module

---

## Cross-cutting engineering work (spans every phase, not a phase itself)

- [~] Notification Service: `lib/notify.ts` stub exists (console-logs), used consistently everywhere an SMS would go out (fee reminders, notice blasts, payment receipts) — needs a real SMS provider (SSL Wireless/Mim SMS/Bulk SMS BD) + email + web-push — BullMQ-queued once Redis exists
- [x] Puppeteer Document Service — live since Phase 3 (marksheet + tabulation sheet PDFs), Noto Sans Bengali embedded and visually verified
- [x] Test coverage: `src/golden-path.test.ts` codifies the Phase 1-3 golden paths as 11 automated Supertest tests (auth, students, attendance, fees+outbox, exams+grading+publish, permission matrix) — run via `npm test`. Playwright e2e still not started.
- [ ] Sentry wired into all 4 apps (still just planned)
- [x] Rate limiting + CAPTCHA on public endpoints — closed: `/api/v1/content/*`, `/api/v1/verify/:code`, and `/api/v1/public/results/lookup` all rate-limited via `express-rate-limit`; contact-form submission additionally requires a self-hosted math CAPTCHA (no external site-key dependency)
- [ ] Backup/DR: automated PostgreSQL backups + documented RTO/RPO, tested restore drill before go-live
- [ ] Load test around "result publish day" traffic — still open; the publish endpoint does per-student computation + PDF-document registration in one transaction, worth checking how it holds up at real class sizes (tested so far with 2-3 students)
- [x] `express` upgraded 4→5, `multer` upgraded 1→2 during Phase 1; `uuid` pinned to 11.x via an npm `overrides` entry during Phase 1/2 catch-up (exceljs was pulling in a vulnerable transitive uuid@8) — all proactive CVE fixes, not because something broke
- [x] Fixed during Phase 3 testing: student login never checked `studentUid` (students have no email/phone) — see Phase 3 notes above
- [x] Fixed during Phase 1/2 catch-up: staff had no `PATCH /:id` endpoint at all; local file-storage fallback added so uploads/document-vault are testable without an Azure subscription
