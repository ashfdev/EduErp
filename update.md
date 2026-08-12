# EduErp — Progress Update & Next Plan

*Last updated: 2026-07-23*

This file is a durable, human-readable handoff document — separate from the internal Claude plan
file — recording (1) what has been completed and pushed so far, and (2) the full next plan
("Plan Fourteen") that was designed and researched but **not yet implemented**. No code has been
written for Plan Fourteen; this is planning/documentation only, per explicit instruction. We will
code later.

---

## Part 1 — What We Did So Far

Everything through **Plan Thirteen** (including its Phase L-O addendum) is built, committed, and
pushed to `origin/main` — latest commit `99390f0`.

### Highlights of Plan Thirteen (the Edufy-style UX overhaul)
- **Phase A** — Grouped, collapsible sidebar navigation (Dashboard / Academic / Students /
  Admission / Finance / HR & Staff / Campus / Communication / System groups).
- **Phase B (B1-B4)** — Full admin-panel density redesign: a new shared dense `Table` component
  (`packages/ui`) plus compact `Card`/`Button`/`Input` variants, rolled out across every list page
  in the app — Dashboard, Students, Fees, Attendance, HR, Examination, Marks, Results, Accounts,
  Admission, Settings (12 files), HR remaining (7 files), Library, Transport, Hostel, Inventory,
  Website — roughly 40+ hand-rolled tables converted to the shared component.
- **Phase C** — Student Add/Edit form: new fields (middle/nick name, other phone, passport no,
  religion/nationality dropdowns, split Present/Permanent address), plus a new in-wizard Documents
  step and `StudentDocument` model.
- **Phase D** — Student List: richer columns (photo, action menu), Session filter, and a real bug
  fix (export route now respects `program_id`/`department_id`).
- **Phase E** — Employee/Staff Attendance admin page, built on the already-correct biometric
  punch pipeline.
- **Phase F** — Full reusable Fee Waiver system: `WaiverType`/`StudentWaiver`/
  `InvoiceWaiverApplication` models, auto-apply hooked into invoice generation, a dedicated
  "Waiver Setup" admin page, and a Waiver report tab. **Confirmed fully working** (see Plan
  Fourteen notes below — the "not working" report turned out to be a discoverability issue, not a
  bug).
- **Phase G** — Fees Reports suite (Student-wise Due, Class-wise/Student-wise Summary, Datewise
  Payments, Fee Collection Summary, Fee Generations log, Student-wise Waivers).
- **Phase H** — Gate Pass / Visitor Management (`Visitor` model, log-in/check-out flow).
- **Phase I** — Dashboard widget expansion (staff/student present-today, on-leave-today, gender
  split, admission-status donut, fund balance, etc).
- **Phase J** — Student Leave Request with dual-mode Settings-driven approval (Class-Teacher-only
  vs. All-Subject-Teachers), including `AttendanceRules.leave_approval_mode`.
- **Phase K** — Teacher Proxy/Substitute Management (`RoutineSubstitution` model, admin assign UI,
  teacher-portal "Substituting for X" badge, a scoped ownership exception for subject-wise
  attendance marking).
- **Phase L-O addendum** — HR nav/dashboard fixes (missing `nav.employeeAttendance` i18n key,
  richer HR dashboard KPIs), a full multi-step Staff/Faculty Add wizard (mandatory photo,
  structured address, staged documents), a richer 6-step Student Add wizard (mandatory photo,
  structured Present/Permanent address, mandatory guardian NID/phone/occupation, staged documents,
  a real Review recap step, "No documents on file" warning badges), and a downloadable/printable
  Gate Pass Visitor Slip PDF.

### Everything before Plan Thirteen
Plans One through Twelve (Phases 21 through 97, plus several standalone-lettered plans) cover the
full build-out of this ERP: Settings system, Auth/RBAC, Student/Staff/Subject/Attendance/
Examination/Results/Fees/Accounts(double-entry)/Inventory(assets+stock)/Admission/Document
generation/Website maintenance/HR+Payroll/Library+Transport+Hostel/Analytics dashboard/Student-
Guardian Portal/Public Website/IoT biometric device service/Notification service/Production
hardening, plus many follow-on rounds of owner-reported bug fixes and feature requests: university
course/CGPA modeling, discipline/quiz/health-record/complaint/PTM/assignment/appraisal/live-
transport-tracking modules, result-lookup redesign, auto-routine generation, bulk credential
delivery, i18n infrastructure, academic Groups/Streams (Science/Commerce/Arts), an editable
role/permission matrix, subject-wise attendance tracking (replacing blanket daily attendance for
academic purposes), real entry/exit tracking for biometric punches, and a large batch of
targeted correctness fixes (mark-approval-vs-Groups bug, admit-card clearance bypass, document
generation UX, payroll onboarding gaps, and more).

**Nothing is currently uncommitted or unpushed.** `git log` on `main` and `origin/main` are in
sync as of `99390f0`.

---

## Part 2 — What's Next: Plan Fourteen

Triggered by the owner reviewing a competing product ("Edufy") via 16 reference screenshots and
listing 20 numbered items in one message. This was researched via 3 parallel codebase-exploration
passes plus a dedicated design pass on the two highest-risk pieces (the fee category/sub-category/
fine engine, and a per-teacher mark-entry lock) before anything was written down as a plan. The
full, detailed version of this plan (with exact schema snippets, migration safety analysis, and
route-by-route detail) lives in the Claude plan file at
`C:\Users\PC\.claude\plans\amar-ei-project-e-snappy-thacker.md` under the heading
**"Plan Fourteen — Search Parity, Richer HR/Student Records, Proxy Visibility, Fee Engine
Overhaul, Per-Teacher Mark Correction, Payroll Detail, and Professional Document Design
(Phases A-O)"**. This file is the condensed, human-readable version of that same plan.

### What research corrected before finalizing this plan
- The **Waiver system was already fully built and working**, not broken — the owner's actual
  problem was not being able to find/use it (discoverability), not a backend bug.
- The **payroll absence-deduction bug from an earlier session is already fixed** — nothing to
  redo there; only genuinely new capability (overtime/late-fee/proxy-pay) needs adding.
- A **real, previously-unknown security bug was found**: any staff role can currently fetch any
  other employee's payslip PDF by ID (no ownership scoping) — folded into Phase J as a fix.
- **Notices already have working View/Download PDF everywhere** — not the gap the owner meant.
  The actual gap is the **Routine** (class timetable): zero PDF/print/download capability
  anywhere, and it's a flat list, not a visual grid.

### Three confirmed decisions (resolved directly with the owner)
1. **Fee structure/collection: build the full system** matching the reference screenshots — a Fee
   Category → Sub-Category catalog, a separate Fine-rule engine (multi-class targeting), and a
   redesigned Fee Collection page. This is the single largest item in the plan (Phase N).
2. **Mark-entry correction: build a real per-teacher/per-class override**, not just a UI wrapper
   around the existing exam-wide "Reopen" — more precise, materially higher risk (Phase M).
3. **Payment gateway credentials: build real admin-editable credential storage** (masked at
   rest), even though the actual bKash/Nagad/SSLCommerz integrations stay deferred stubs.

### The 15 phases (A through O)

| Phase | Covers | Size |
|---|---|---|
| **A** | Search/filter parity — class/section cascading filters added to Library (issue/return) and Transport (assign/routes/vehicles), matching the pattern already used on the Students list. | Small |
| **B** | Student/Staff profile richness — photo edit *after* creation (backend already supports it, pure UI gap), document replace-in-place (new PUT route), optional Father's/Mother's photo fields, and new `StaffExperience`/`StaffReference` models (repeatable prior-employment/referee rows). | Medium |
| **C** | Proxy/Substitute enhancements — Department/Subject/Group filters on the substitute picker, notifying the *original* teacher too (not just the substitute), student/guardian portal visibility of substitutions, and a "Substitutions Covered" history section on the staff profile. | Medium |
| **D** | Settings — Bulk SMS discoverability fix (already built, just poorly placed in nav) + a genuinely new admin-editable Payment Gateway credentials page (masked/encrypted, never echoes secrets back). | Medium (security-sensitive) |
| **E** | Routine — a real day×period visual grid (admin/portal/public website) replacing today's flat lists, plus a new PDF export/download everywhere (none exists today). | Medium |
| **F** | Fix two confirmed bugs in the Fee Collection Summary report (`by_category` array/Record mismatch; `by_gateway` field-name mismatch causing an always-empty panel) + wire up the missing date-range filter. | Small |
| **G** | Waiver Setup discoverability pass (the system already works — this just makes it easier to find; the visual "why was this waived" display itself lands as part of Phase N). | Small |
| **H** | Reports — add the missing Class/Month-Year/date-range filters to the Invoice report, and surface the already-correct-but-buried Purchase/GRN report (with supplier name) on the dedicated Inventory Reports page. | Small-medium |
| **I** | HR Resign/Rejoin — new `resignation_date`/`resignation_reason`/`rejoin_date` fields on Staff, new admin actions mirroring the existing Student "Mark as Graduated" pattern. | Small-medium |
| **J** | HR Payroll depth — new overtime/late-deduction/substitution-bonus rate fields on Salary Structure (all default 0, fully backward-compatible), formula extension, a real itemized payslip (PDF + in-app breakdown modal), new HR payment reports (employee-wise/period-wise/generation log), and the payslip-ownership security fix. | Medium-large |
| **K** | Extract a shared "letterhead" template partial (logo + institution header) reused across all 20 PDF document types — the foundation Phase L builds on. | Medium |
| **L** | Marksheet/Transcript/Report Card redesign — watermark, a grading-scale legend, and a new admin-configurable "Marksheet Display Settings" checklist (show/hide banner, QR code, per-block details) matching the reference screenshot exactly. | Medium-large |
| **M** | **Per-teacher, per-class/subject mark-entry correction system** — a teacher whose exam is locked can request permission to fix one specific class/subject's marks; only that teacher, only that scope unlocks — everyone else stays locked. Coexists with (doesn't replace) the existing exam-wide Reopen. | **Large, high risk** |
| **N** | **Fee Category → Sub-Category → Fine engine + multi-class Fee Structure assignment + a redesigned Fee Collection page** (matching the reference screenshots' "recurring fee-subcategories" sidebar flow). The single largest, highest-risk item in the whole plan — touches 5 existing call sites that must all change together. | **Largest, highest risk** |
| **O** | A shared "red asterisk / adjustment note" UI component applied to both the new Fee Collection page (waivers/discounts/fines) and the new itemized payslip (deductions) — depends on J and N landing first. | Small |

### How the owner's original 20 items map to phases
1→A, 2→B, 3→C, 4→D, 5→E, 6→F, 7→G, 8→H, 9→I, 10→J, 11→M, 12→N, 13→N, 14→N, 15→J, 16→J, 17→L,
18→K, 19→O, 20→L. **Every item has a home.**

### Recommended sequencing
1. Quick wins first: **A → F → G → H**
2. Independent medium builds, any order: **B → C → D → E → I**
3. Document-design foundation, in order: **K → L**
4. Payroll depth (shares template surface with K, sequence after it): **J**
5. Two hard checkpoints — own dedicated sessions, not bundled with anything else: **M → N**
   (either order relative to each other)
6. Final polish, depends on J and N: **O**

### Why M and N are flagged as the highest risk
- **Phase M** changes real, live mark-entry access control. The non-negotiable check: a teacher
  with no approved correction request must see the *exact same* block message as before this
  phase ever existed — zero behavior change for the common case.
- **Phase N** is the largest schema change in this plan and has a specific, named failure mode:
  5 existing code call sites (invoice generation ×2, admission enrollment, the portal's
  upcoming-dues projection, and the readmission-fee helper) all read a fee structure's target
  class(es) independently. If they're updated inconsistently, the result is silent,
  hard-to-detect disagreement about who owes what — not a crash. All 5 must ship as one unit,
  verified together, never piecemeal.

Both phases are designed so that **any school/class/structure that never opts into the new
capability behaves byte-identically to today** — this was a hard design requirement, not an
afterthought, for exactly this reason.

---

## Next session should start by
Re-reading the full Plan Fourteen detail in the Claude plan file (schema snippets, exact route
lists, migration SQL shape for Phase N's `FeeStructureClass` join table, etc.) and beginning with
Phase A once implementation is greenlit — no code has been written yet for any part of Plan
Fourteen.
