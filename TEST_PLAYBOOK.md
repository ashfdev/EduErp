# 🧪 Education ERP — Complete Testing Playbook
# Phase-by-Phase QA · Security · UI/UX · SEO · Bilingual · Theme

---

## HOW TO USE THIS FILE

Each section has two parts:
1. **Manual checklist** — things you verify with your eyes/browser
2. **Claude Code prompt** — paste into Claude Code to auto-fix/audit issues

Always run the Claude Code prompt FIRST, then do the manual checks.

---

---

# ════════════════════════════════════════════════
# 🎨 THEME & VISUAL STANDARD (Read Before All Tests)
# ════════════════════════════════════════════════

```
The correct theme for this project:
✅ Light mode ONLY (no dark mode unless explicitly requested later)
✅ Primary: Blue (#1a3c4a deep navy OR #2563eb standard blue — pick one, use everywhere)
✅ Secondary: White (#ffffff) and light gray (#f8fafc, #f1f5f9)
✅ Accent: Light blue (#e0f2fe, #bfdbfe) for highlights
✅ Text on white: #0f172a (near black) — NEVER light gray on white
✅ Text on blue bg: #ffffff — NEVER dark text on dark bg
✅ All Bangla text: Noto Sans Bengali font loaded
✅ No text should be invisible — minimum contrast ratio 4.5:1 (WCAG AA)
```

---

---

# ════════════════════════════════════════════════
# PHASE 0 TEST — Foundation & Schema
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 0 Audit

```
Read CLAUDE.md. Run the following Phase 0 audit and fix every issue found.

AUDIT CHECKLIST — run each check and report pass/fail:

1. MONOREPO STRUCTURE
   - [ ] Run: ls -la apps/ packages/ server/ services/
   - [ ] Verify: apps/admin, apps/portal, apps/website all exist
   - [ ] Verify: server/api exists
   - [ ] Verify: packages/db, packages/types, packages/validators, packages/ui all exist
   - [ ] Verify: turbo.json exists at root
   - [ ] Verify: pnpm-workspace.yaml exists at root
   - [ ] Verify: .env.example exists at root with ALL variables from CLAUDE.md

2. PRISMA SCHEMA
   - [ ] Run: pnpm --filter=db prisma validate → must show "The schema at prisma/schema.prisma is valid"
   - [ ] Count models: grep "^model " packages/db/prisma/schema.prisma | wc -l → must be >= 40
   - [ ] Check all enums exist: grep "^enum " packages/db/prisma/schema.prisma | wc -l → must be >= 25
   - [ ] Verify soft delete: grep "deleted_at" packages/db/prisma/schema.prisma | wc -l → must be >= 5
   - [ ] Verify audit columns: grep "created_at" packages/db/prisma/schema.prisma | wc -l → must be >= 30
   - [ ] Verify indexes: grep "@@index" packages/db/prisma/schema.prisma | wc -l → must be >= 20

3. MISSING MODELS CHECK
   Run: grep -c "model InstitutionProfile\|model StudentIdConfig\|model GradingScale\|model GradeRange\|model ExamTypeConfig\|model FeeRules\|model AttendanceRules\|model AuthorityConfig\|model AuthoritySignature\|model DocumentTemplate\|model NotificationConfig\|model AcademicYear\|model Shift\|model Department\|model Class\|model Section\|model Subject\|model SubjectTeacherAssignment\|model User\|model Guardian\|model Student\|model StudentAcademicHistory\|model StudentSubject\|model Staff\|model AttendanceRecord\|model Device\|model DevicePunchLog\|model Exam\|model ExamSubjectConfig\|model MarkEntry\|model ExamSeatPlan\|model ResultPublication\|model FeeStructure\|model Invoice\|model Payment\|model Notice\|model SliderImage\|model GalleryAlbum\|model GalleryImage\|model AdmissionCycle\|model AdmissionApplication\|model DocumentTemplate" packages/db/prisma/schema.prisma
   → Count must be >= 40. If any are missing, add them now.

4. SEED DATA
   - [ ] Run: pnpm db:seed
   - [ ] Verify: no errors, completes successfully
   - [ ] Check: admin user created (phone: 01700000000)
   - [ ] Check: default grading scale exists with 7 grade ranges
   - [ ] Check: 3 exam types created

5. DATABASE CONNECTION
   - [ ] Run: pnpm --filter=db prisma db pull → must not error
   - [ ] Run: pnpm --filter=db prisma studio → must open browser

Fix any failures found. Report what was fixed.
```

---

---

# ════════════════════════════════════════════════
# PHASE 1 TEST — Settings System
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 1 Audit

```
Read CLAUDE.md. Run Phase 1 settings audit. Fix all issues.

API TESTS (use curl or write supertest tests):

1. INSTITUTION PROFILE API
   curl -X GET http://localhost:4000/api/settings/institution -H "Authorization: Bearer {token}"
   Expected: 200 with InstitutionProfile object including type, name_en, eiin fields
   
   curl -X PUT http://localhost:4000/api/settings/institution \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{"name_en": "Test School", "type": "SCHOOL", "eiin": "123456"}'
   Expected: 200 with updated profile

2. STUDENT ID CONFIG
   curl -X GET http://localhost:4000/api/settings/student-id-config -H "Authorization: Bearer {token}"
   Expected: 200 with config including prefix, separator, sequence_digits

   curl -X POST http://localhost:4000/api/settings/student-id-config/preview \
     -d '{"prefix":"ALh","include_year":true,"year_format":"2","separator":"-","sequence_digits":4}'
   Expected: 200 with { preview: "ALh-26-0001" } or similar

3. GRADING SCALE
   curl -X GET http://localhost:4000/api/settings/grading-scales -H "Authorization: Bearer {token}"
   Expected: array with at least 1 scale containing 7 GradeRange items

   POST new scale → PUT ranges → verify no gaps in 0-100 range

4. TYPE CHANGE TEST
   PUT /api/settings/institution/type with {"type":"UNIVERSITY"}
   GET /api/settings/config → verify: has_departments=true, term_class="Semester", term_principal="Vice Chancellor"
   PUT /api/settings/institution/type with {"type":"SCHOOL"}
   GET /api/settings/config → verify: term_class="Class", term_principal="Headmaster"

5. MISSING ENDPOINTS CHECK
   Run: grep -r "router\." server/api/src/modules/settings/ | grep -E "GET|POST|PUT|DELETE" | wc -l
   Must be >= 40 settings endpoints total.

UI CHECKS (manual — open browser):

6. SETTINGS SIDEBAR
   - Open http://localhost:3000/settings/institution
   - [ ] Settings secondary sidebar visible with all groups
   - [ ] All 4 groups visible: Institution, Customization, Documents & Signatures, System
   - [ ] Click all sidebar links — none return 404

7. STUDENT ID PREVIEW
   - Open /settings/student-id
   - [ ] Change prefix to "ALh" → preview updates instantly without save
   - [ ] Toggle "include year" → preview updates
   - [ ] Change separator to "/" → preview shows ALh/26/0001
   - [ ] Preview box is clearly visible, NOT hidden behind white-on-white

8. GRADING EDITOR
   - Open /settings/grading → click "Create New Scale"
   - [ ] Can add grade rows
   - [ ] Validation shows error on gap between ranges
   - [ ] "Apply BD Board" preset fills in all 7 rows correctly
   - [ ] Save disabled when validation errors exist
   - [ ] All text clearly readable (dark text on light background)

9. INSTITUTION TYPE SELECTOR
   - /settings/institution → Basic Info tab
   - [ ] 4 cards visible with icons: School 🏫 College 🎓 University 🏛️ Madrasah 🕌
   - [ ] Clicking UNIVERSITY → confirmation dialog appears
   - [ ] Dialog explains what labels will change
   - [ ] After confirm → page reflects new terminology

10. THEME CHECK — SETTINGS PAGES
    - [ ] Background: white or very light gray (#f8fafc)
    - [ ] Sidebar: white with blue active state
    - [ ] Active nav item: blue text (#2563eb) with light blue bg (#eff6ff)
    - [ ] All form labels: dark (#1e293b), clearly visible
    - [ ] Input borders: visible (#cbd5e1), not invisible
    - [ ] Save buttons: solid blue (#2563eb), white text
    - [ ] NO light gray text on white background anywhere

Fix all failures. Report what was fixed.
```

---

---

# ════════════════════════════════════════════════
# PHASE 2 TEST — Auth System
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 2 Audit

```
Read CLAUDE.md. Run Phase 2 auth audit. Fix all issues.

SECURITY TESTS:

1. BRUTE FORCE PROTECTION
   Run 6 login attempts with wrong password in rapid succession:
   Expected: 6th attempt returns 429 Too Many Requests (rate limit)
   
   Check: express-rate-limit is configured for /api/auth/login
   Check: limit is 5 per 15min per IP

2. JWT SECURITY
   - [ ] Access token expires in 15 minutes (check jwt.sign options)
   - [ ] Refresh token expires in 7 days
   - [ ] JWT_ACCESS_SECRET is at least 32 characters
   - [ ] JWT_REFRESH_SECRET is DIFFERENT from access secret
   - [ ] Tokens are NOT stored in localStorage (check Zustand store — use httpOnly cookie OR memory)
   
   Actually for this app: access_token in memory (Zustand), refresh_token in httpOnly cookie
   If currently in localStorage: FIX to use httpOnly cookie for refresh_token

3. PASSWORD RULES
   curl -X POST http://localhost:4000/api/auth/change-password \
     -d '{"old_password":"Admin@1234","new_password":"weak","confirm_password":"weak"}'
   Expected: 400 error with message about password requirements
   
   - [ ] Min 8 chars enforced
   - [ ] Must contain uppercase
   - [ ] Must contain lowercase  
   - [ ] Must contain number
   - [ ] Password not returned in ANY API response (grep responses for "password")

4. ROLE ISOLATION
   Login as ACCOUNTANT → try GET /api/students → Expected: 403 FORBIDDEN
   Login as TEACHER → try PUT /api/settings/institution → Expected: 403 FORBIDDEN
   Login as STUDENT (portal) → try GET /api/hr/staff → Expected: 403 FORBIDDEN

5. EXPIRED TOKEN
   Wait for access token to expire (or manually set short expiry in test)
   Make request with expired token → Expected: 401 with code "TOKEN_EXPIRED"
   Check: frontend auto-refreshes and retries → original request succeeds

6. LOGOUT INVALIDATION
   POST /api/auth/logout with refresh_token
   Try POST /api/auth/refresh with same token → Expected: 401 (token invalidated in Redis)

UI TESTS:

7. LOGIN PAGE DESIGN
   - Open http://localhost:3000/login
   - [ ] Background: white or light blue gradient — NOT dark
   - [ ] Institution logo visible on left panel (if set in settings)
   - [ ] Form card: white background with subtle shadow
   - [ ] "Sign In" button: solid blue, white text, clearly clickable
   - [ ] Password field has show/hide eye icon
   - [ ] "Forgot Password?" link visible in blue
   - [ ] Error state: red alert box visible (NOT hidden light red text)
   - [ ] Mobile (375px): login form takes full width, left panel hidden
   - [ ] Loading state on submit: spinner or disabled state on button

8. FORGOT PASSWORD FLOW
   - [ ] Step 1: phone input → "Send OTP" button
   - [ ] Step 2: 6-digit OTP input (each digit in separate box or single field)
   - [ ] Countdown timer shows "Resend in 1:58"
   - [ ] Step 3: new password + confirm with show/hide
   - [ ] Step 4: success message with redirect

9. AFTER LOGIN REDIRECT
   Login as ADMIN → redirects to /dashboard ✅
   Login as ACCOUNTANT → redirects to /fees ✅
   Login as TEACHER → redirects to /attendance/mark ✅

Fix all security issues first, then UI issues. Report everything fixed.
```

---

---

# ════════════════════════════════════════════════
# PHASE 3 TEST — Student Module
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 3 Audit

```
Read CLAUDE.md. Run Phase 3 student module audit. Fix all issues.

API TESTS:

1. STUDENT UID GENERATION
   POST /api/students with class_id (valid class from seed data)
   Expected response includes student_uid matching format from StudentIdConfig
   
   If StudentIdConfig has prefix="ALh", year included, 4 digits:
   Expected: student_uid = "ALh-26-0001" (or current sequence)
   
   Create 3 students in rapid succession → check no duplicate UIDs
   (Test concurrent ID generation — use Promise.all with 5 simultaneous POST requests)

2. 360° PROFILE COMPLETENESS
   GET /api/students/{id}
   Check response has ALL these keys:
   personal, academic, subjects, attendance, results, fees, library, transport, hostel
   
   - [ ] academic.history is array (empty ok if new student)
   - [ ] subjects is array with subject_name_en and assigned_teacher
   - [ ] attendance.current_year_summary has percentage field
   - [ ] fees.outstanding_total is a number (0 ok)

3. SUBJECT INHERITANCE
   Create student → assign to Class 9 Section A
   GET /api/students/{id}/subjects
   Expected: all compulsory subjects of Class 9 auto-assigned (is_inherited=true)
   Optional subjects NOT auto-assigned (is_inherited=false, requires explicit selection)

4. GUARDIAN DEDUP
   Create student 1 with father_phone: 01711111111
   Create student 2 with same father_phone: 01711111111
   Check: same Guardian record used for both (not duplicated)

5. SOFT DELETE
   DELETE /api/students/{id}
   GET /api/students/{id} → Expected: 404 (soft deleted, not visible)
   Check DB: student record has deleted_at set, status=INACTIVE
   Check: User account is_active=false

UI TESTS:

6. STUDENT LIST PAGE (/students)
   - [ ] Table loads with data (not empty on seed data)
   - [ ] Search by name works (type partial name → results filter)
   - [ ] Search by student UID works
   - [ ] Class filter narrows results
   - [ ] Student photo shown as avatar (initials if no photo)
   - [ ] Status badge clearly colored: green=Active, gray=Inactive
   - [ ] Pagination works (previous/next buttons)
   - [ ] Row click navigates to student profile

7. CREATE STUDENT FORM (/students/new)
   - [ ] Progress indicator shows Step 1 of 5
   - [ ] "Next" button disabled until required fields filled
   - [ ] Date of birth: Bengali students should be able to select dates before 2010
   - [ ] Photo upload: shows crop preview
   - [ ] Step 4 (Subjects): compulsory subjects shown as checked + disabled
   - [ ] Optional subjects shown as unchecked checkboxes
   - [ ] Step 5: full summary visible before submit
   
8. STUDENT 360° PROFILE (/students/:id)
   - [ ] Header shows student photo, name, UID badge clearly
   - [ ] All 8 tabs present and clickable
   - [ ] Attendance tab: monthly calendar renders correctly
   - [ ] Each day in calendar: colored square, hover shows status
   - [ ] Results tab: shows result table (empty state message if no results yet)
   - [ ] Fees tab: shows outstanding dues in red if any
   - [ ] "Print ID Card" button visible in header

9. BULK IMPORT
   - [ ] Upload CSV button opens file picker
   - [ ] After upload: preview table shows parsed data
   - [ ] Invalid rows highlighted in red with error reason
   - [ ] "Confirm Import" only available after review

10. RESPONSIVE CHECK — STUDENT PAGES
    Test at widths: 375px (mobile), 768px (tablet), 1280px (desktop)
    - [ ] 375px: student list stacks vertically, table scrolls horizontally
    - [ ] 375px: student profile tabs scroll horizontally (no wrapping to 2 rows)
    - [ ] 768px: 2-column layout on profile detail sections
    - [ ] 1280px: full table visible without horizontal scroll

11. THEME CHECK — STUDENT PAGES
    - [ ] "Student UID" badge: blue background, white text — readable
    - [ ] Status badges: contrasting colors (green bg + white text for Active)
    - [ ] Table header: light blue (#eff6ff) or white with blue text — NOT invisible
    - [ ] Action buttons: visible, not washed out
    - [ ] Form labels: dark color, clearly visible

Fix all failures. Report everything fixed.
```

---

---

# ════════════════════════════════════════════════
# PHASE 5 TEST — Attendance
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 5 Audit

```
Read CLAUDE.md. Run Phase 5 attendance audit. Fix all issues.

API TESTS:

1. MARK ATTENDANCE
   POST /api/attendance/mark with:
   { class_id, section_id, shift_id, date: "today", records: [{student_id, status:"PRESENT"}, {student_id2, status:"ABSENT"}] }
   Expected: 200 with { saved: 2, conflicts: [] }

2. DUPLICATE PREVENTION
   Mark same students PRESENT on same date+shift again
   Expected: overwrites (upsert), not duplicate records in DB
   Check: DB has exactly 1 AttendanceRecord per person+date+shift+period

3. CONFLICT DETECTION
   Manually insert a BIOMETRIC AttendanceRecord for a student
   Then POST /api/attendance/mark with MANUAL source for same student+date
   Expected: response includes { conflicts: [{ student_id, conflict_reason: "Biometric record exists" }] }
   If override_reason provided: manually saves with override flag

4. PERCENTAGE CALCULATION
   GET /api/attendance/student/{id}?academic_year_id={id}
   Expected: attendance.percentage = (present_days / total_working_days) × 100
   Verify calculation is correct for a student with known records

5. DEFAULTERS REPORT
   GET /api/attendance/defaulters?threshold=75&academic_year_id={id}
   Expected: only students with percentage < 75

6. EXPORT
   GET /api/attendance/reports/monthly-sheet?class_id={id}&section_id={id}&month=7&year=2026
   Expected: Excel file download (Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

UI TESTS:

7. MARK ATTENDANCE PAGE (/attendance/mark)
   - [ ] Class → Section → Shift dropdowns cascade correctly
   - [ ] "Load Students" shows grid (not empty or errored)
   - [ ] "Mark All Present" → all radio buttons switch to P (green)
   - [ ] Clicking individual A (absent) → row turns red
   - [ ] Student with biometric record: shows fingerprint icon badge
   - [ ] Save button shows loading state
   - [ ] Success toast: "Saved successfully. X Present, Y Absent."
   - [ ] Keyboard shortcut: pressing 'P' marks present (test if implemented)

8. ATTENDANCE CALENDAR (student profile)
   - [ ] Monthly calendar renders as a grid
   - [ ] Green squares = present
   - [ ] Red squares = absent  
   - [ ] Orange squares = late
   - [ ] Gray squares = holiday or no class
   - [ ] Legend visible below calendar
   - [ ] NO invisible squares (light green on white = BAD)
   - [ ] Color contrast sufficient (not pastel on white)

9. REPORTS PAGE (/attendance/reports)
   - [ ] Daily Register tab: date picker works, table loads
   - [ ] Monthly Sheet tab: grid renders correctly
   - [ ] Download PDF button → browser downloads a file
   - [ ] Download Excel button → downloads .xlsx file
   - [ ] File is not empty/corrupted (open it and verify)

Fix all issues. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 6+7 TEST — Exam, Marks & Results
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 6+7 Audit

```
Read CLAUDE.md. Run Phase 6+7 exam and result audit. Fix all issues.

GRADING ENGINE UNIT TESTS:
Create and run test file: server/api/src/utils/grading.engine.test.ts

Test cases to write and verify pass:
  describe("BD Board Grading") {
    it("100 marks → A+ (5.00)")    { expect(calculateGrade(100, bdScale)).toEqual({grade:"A+", point:5.00}) }
    it("90 marks → A+ (5.00)")     { expect(calculateGrade(90, bdScale)).toEqual({grade:"A+", point:5.00}) }
    it("89 marks → A (4.00)")      { expect(calculateGrade(89, bdScale)).toEqual({grade:"A", point:4.00}) }
    it("80 marks → A (4.00)")      { expect(calculateGrade(80, bdScale)).toEqual({grade:"A", point:4.00}) }
    it("79 marks → A- (3.50)")     { expect(calculateGrade(79, bdScale)).toEqual({grade:"A-", point:3.50}) }
    it("70 marks → A- (3.50)")     { expect(calculateGrade(70, bdScale)).toEqual({grade:"A-", point:3.50}) }
    it("69 marks → B (3.00)")      { expect(calculateGrade(69, bdScale)).toEqual({grade:"B", point:3.00}) }
    it("60 marks → B (3.00)")      { expect(calculateGrade(60, bdScale)).toEqual({grade:"B", point:3.00}) }
    it("59 marks → C (2.00)")      { expect(calculateGrade(59, bdScale)).toEqual({grade:"C", point:2.00}) }
    it("50 marks → C (2.00)")      { expect(calculateGrade(50, bdScale)).toEqual({grade:"C", point:2.00}) }
    it("49 marks → D (1.00)")      { expect(calculateGrade(49, bdScale)).toEqual({grade:"D", point:1.00}) }
    it("33 marks → D (1.00)")      { expect(calculateGrade(33, bdScale)).toEqual({grade:"D", point:1.00}) }
    it("32 marks → F (0.00)")      { expect(calculateGrade(32, bdScale)).toEqual({grade:"F", point:0.00}) }
    it("0 marks → F (0.00)")       { expect(calculateGrade(0, bdScale)).toEqual({grade:"F", point:0.00}) }
    it("absent → Ab (0.00)")       { expect(calculateGrade(null, bdScale, true)).toEqual({grade:"Ab", point:0.00}) }
  }
  
  describe("4th Subject Rule") {
    it("drops lowest optional subject GPA from overall calculation") {
      // 5 subjects: 4 compulsory + 1 optional
      // Optional gets F → overall GPA calculated without it
    }
    it("does not drop compulsory subject even if lowest") { ... }
  }
  
  describe("Position Calculation") {
    it("same GPA gets same position") {
      // 3 students same GPA → all rank 1, next rank is 4
    }
    it("orders by total marks as tiebreaker") { ... }
  }

Run: pnpm test → ALL tests must pass (green).

API FLOW TESTS:

1. FULL EXAM FLOW
   Create exam → set mark window open → submit marks → approve → publish
   At each step: verify status transitions correctly
   At DRAFT: mark entry endpoint returns 403 (window not open)
   At MARK_ENTRY: teacher can enter marks
   After APPROVE: marks are read-only
   After PUBLISH: GET /api/results/public/lookup returns results

2. MARK VALIDATION
   POST /api/marks/submit with marks_theory = 110 (exceeds full_marks 100)
   Expected: 400 validation error "Marks cannot exceed full marks"
   
   POST with marks_theory = -5
   Expected: 400 validation error

3. TEACHER SCOPE
   Login as Subject Teacher for "Mathematics"
   Try to submit marks for "Physics" (different subject)
   Expected: 403 FORBIDDEN

4. PUBLIC RESULT LOOKUP
   GET /api/results/public/lookup?roll_no=0001&registration_no=TEST001&exam_id={id}
   If result is published + is_public=true → returns result data
   If result not published → returns 404 or empty

UI TESTS:

5. MARK ENTRY GRID (/marks/:exam_id/:class_id/:section_id)
   - [ ] Grid loads with student names and empty mark inputs
   - [ ] Deadline countdown timer visible and counting down
   - [ ] Enter 95 in theory → cell turns green (pass)
   - [ ] Enter 20 in theory → cell turns red (fail)
   - [ ] "Ab" checkbox → cell turns yellow, marks cleared
   - [ ] Tab key moves to next cell (keyboard navigation)
   - [ ] After submit: cells become read-only with "Submitted" badge
   - [ ] Submit button shows loading state

6. RESULT DISPLAY
   - [ ] Result table: all subjects visible
   - [ ] Grade badges colored: A+ = green, F = red, etc.
   - [ ] GPA clearly displayed in large font
   - [ ] Position shown as "1st" / "2nd" etc.
   - [ ] "Print Result Card" → PDF opens/downloads

Fix all failures including test failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 8 TEST — Fee & Finance
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 8 Audit

```
Read CLAUDE.md. Run Phase 8 fee module audit. Fix all issues.

SECURITY TESTS:

1. PAYMENT WEBHOOK SECURITY
   POST /api/payments/callback/bkash WITHOUT valid signature
   Expected: 400 or 401 — must NOT update any invoice
   
   Check bkash.adapter.ts: verifies HMAC signature before processing
   Check: webhook endpoint is NOT behind JWT auth (it's called by payment gateway)
   but DOES verify gateway-specific signature

2. AMOUNT MANIPULATION
   POST /api/payments/initiate with { invoice_id, gateway: "BKASH", amount: 1 }
   System must use invoice.amount_due from DB, NOT client-provided amount
   Expected: payment initiated with correct amount from DB

3. DOUBLE PAYMENT PREVENTION
   After successful payment, simulate second payment webhook for same transaction_id
   Expected: second webhook returns 200 but does NOT create duplicate Payment record
   (Check: transaction_id has @unique constraint + upsert logic)

BUSINESS LOGIC TESTS:

4. LATE FEE CALCULATION
   Set FeeRules: late_fee_type=FIXED, late_fee_amount=50, grace_period_days=5
   Create invoice with due_date = 10 days ago
   POST /api/fees/collect for this invoice
   Expected: fine_amount = 50 included in response
   
   Set late_fee_type=DAILY, late_fee_amount=10, late_fee_daily_cap=200
   Invoice 30 days overdue → fine should be capped at 200 (not 300)

5. PARTIAL PAYMENT
   Invoice amount_due = 1000
   POST /api/fees/collect with amount = 400
   GET /api/fees/invoices/{id} → status=PARTIAL, amount_paid=400, remaining=600
   POST collect again with amount = 600 → status=PAID, amount_paid=1000

6. WAIVER
   POST /api/fees/invoices/{id}/waive with { reason: "Scholarship" }
   Expected: status=WAIVED, visible in student profile fees tab

UI TESTS:

7. FEE COLLECTION PAGE (/fees/collect)
   - [ ] Student search works by name and UID
   - [ ] Selecting student shows all outstanding invoices
   - [ ] Fine amount shown separately if applicable
   - [ ] Total calculated correctly
   - [ ] "Collect" button → receipt appears after success
   - [ ] Receipt has print button

8. FEE DASHBOARD (/fees)
   - [ ] "Today's Collection" card shows correct number
   - [ ] "Outstanding Total" card visible
   - [ ] Numbers not overlapping or cut off at any screen size

Fix all failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 9 TEST — Online Admission
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 9 Audit

```
Read CLAUDE.md. Run Phase 9 admission audit. Fix all issues.

SECURITY TESTS:

1. ADMISSION FORM INJECTION
   POST /api/admission/apply with:
   personal_info.name: "<script>alert('xss')</script>"
   Expected: sanitized in DB, NOT stored as raw HTML
   
   personal_info.name: "'; DROP TABLE students; --"
   Expected: Prisma parameterized query handles safely

2. FILE UPLOAD SECURITY
   Upload a .php file renamed as photo.jpg
   Expected: server checks magic bytes (MIME type), rejects non-image
   
   Upload a 20MB image
   Expected: 413 error (exceeds limit)

3. SEAT COUNT ENFORCEMENT
   Set AdmissionCycle.seat_count = 2
   Submit 3 applications → Expected: 3rd returns 409 (seats full) OR is waitlisted

4. CLOSED ADMISSION
   Set cycle.is_open = false
   POST /api/admission/apply → Expected: 400 "Admission is closed"
   
   Set close_date = yesterday
   POST /api/admission/apply → Expected: 400 "Admission deadline has passed"

5. AUTO-ENROLL TEST
   POST /api/admission/applications/{id}/enroll
   Check: Student record created with all admission form data pre-populated
   Check: subject inheritance ran (compulsory subjects assigned)
   Check: application.status = ENROLLED
   Check: welcome SMS queued (check Redis queue)

UI TESTS:

6. PUBLIC ADMISSION FORM (apps/website /admission/:cycle_id)
   - [ ] Form fields match form_config from cycle
   - [ ] Compulsory subjects pre-checked and disabled
   - [ ] Optional subjects checkable
   - [ ] Photo upload works on mobile (camera capture button)
   - [ ] Progress steps visible at top
   - [ ] Back button works (doesn't lose filled data)
   - [ ] On submit: loading state shown
   - [ ] Success page: application ID large and copyable
   - [ ] Mobile (375px): form takes full width, no horizontal scroll

7. ADMIN ADMISSION PANEL (/admission)
   - [ ] Merit list sorting works (highest marks at top)
   - [ ] "Shortlist" action → status badge updates immediately (optimistic UI)
   - [ ] Bulk select + bulk shortlist works
   - [ ] "Print Admit Cards" → downloads PDF with all cards

Fix all failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 10 TEST — Document Generation
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 10 Audit

```
Read CLAUDE.md. Run Phase 10 document generation audit. Fix ALL issues.

DOCUMENT GENERATION TESTS:

For each document type, generate and manually inspect the PDF output:

1. STUDENT ID CARD
   GET /api/documents/student/{seed_student_id}/id-card
   Check generated PDF:
   - [ ] Institution logo present (not broken/missing)
   - [ ] Student name in both EN and BN (Bangla renders correctly, NOT boxes/squares)
   - [ ] Student UID visible (e.g. ALh-26-0001)
   - [ ] Class and Section shown
   - [ ] Blood group shown
   - [ ] QR code present on back
   - [ ] "If found, return to..." text on back
   - [ ] Principal signature slot present on back
   - [ ] Card dimensions: correct ID card size (not A4)

2. MARKSHEET
   GET /api/documents/result/{exam_id}/marksheet/{student_id}
   Check:
   - [ ] Institution header: logo + name in BN + EIIN
   - [ ] Student photo shown (not broken)
   - [ ] All subjects listed with marks
   - [ ] Grade and GPA per subject
   - [ ] Overall GPA in large font
   - [ ] Position in class shown
   - [ ] 3 signature blocks at bottom (Class Teacher / Exam Controller / Principal)
   - [ ] Signature images rendered (if uploaded) or blank lines
   - [ ] Institution seal position correct
   - [ ] Bangla text in student name, father name: renders as Bangla (NOT boxes)

3. TRANSFER CERTIFICATE
   GET /api/documents/student/{id}/transfer-cert
   Check:
   - [ ] Numbered fields (1-15) in BD TC format
   - [ ] TC serial number generated
   - [ ] All student fields populated from DB
   - [ ] "Reason for leaving" field filled
   - [ ] Principal signature block present
   - [ ] Certificate date shown
   - [ ] Institution seal position correct

4. BANGLA RENDERING TEST (Critical)
   Open any generated PDF
   - [ ] Bangla characters show as actual Bangla letters (আলহুমাইরা, রহিম, etc.)
   - [ ] NOT showing as: □□□□□□ (empty boxes = font not loaded)
   - [ ] NOT showing as: ???????????? (encoding error)
   
   If Bangla broken: Check Puppeteer template includes:
   <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali&display=swap" rel="stylesheet">
   AND Puppeteer waitUntil: 'networkidle0' to ensure font loads

5. BULK GENERATE TEST
   GET /api/documents/result/{exam_id}/marksheets/class/{class_id}
   (Generates marksheet for all 20 seed students)
   - [ ] Response is a single merged PDF
   - [ ] All 20 students present (check page count = 20)
   - [ ] No page has missing data

6. TEMPLATE SELECTION
   Upload a custom template via POST /api/settings/templates
   Set as active via PUT /api/settings/templates/{id}/activate
   Generate document → verify custom template is used (not default)

7. AUTHORITY SIGNATURES
   Upload a signature image for Principal role
   Generate marksheet → verify signature image appears in bottom signature block
   Remove signature → generate again → verify blank line appears (not broken image)

UI TESTS:

8. BULK PRINT PANEL (/documents/print)
   - [ ] All document type icons visible in left sidebar
   - [ ] Click each type → right panel filters change appropriately
   - [ ] "Preview First Document" → PDF renders in modal
   - [ ] "Download All" → progress bar shown during generation
   - [ ] Downloaded file is a valid PDF (not 0 bytes)
   - [ ] Excel download works for attendance sheets

Fix all failures. Bangla rendering MUST work before moving on.
```

---

---

# ════════════════════════════════════════════════
# PHASE 11 TEST — Website & SEO
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 11 Audit (Full SEO + Slug + Bilingual + Theme)

```
Read CLAUDE.md. Run Phase 11 website audit. This is critical — fix every single issue.

═══ SECTION A — SLUG & URL STRUCTURE ═══

Check all public website routes:

1. VERIFY SLUG PATTERN
   All public pages must use clean slugs, NOT ID-based URLs:
   ✅ CORRECT: /notices/admission-notice-2026
   ❌ WRONG:   /notices/clx82hd00002abc123
   
   ✅ CORRECT: /gallery/annual-sports-day-2026
   ❌ WRONG:   /gallery/clx82hd00002abc123
   
   ✅ CORRECT: /downloads/syllabus-2026
   ❌ WRONG:   /downloads/clx82hd00002abc123

   FIX: Add slug field to Notice, GalleryAlbum, Download, StaticPage models:
   - slug: String @unique (auto-generated from title using slugify library)
   - Install: pnpm --filter=db add slugify
   
   In API: when creating notice/album/download:
     import slugify from 'slugify'
     const slug = slugify(title, { lower: true, strict: true, locale: 'bn' })
     // If duplicate: append -2, -3 etc.

   Update all routes in apps/website to use slugs:
   app/notices/[slug]/page.tsx (not [id])
   app/gallery/[slug]/page.tsx
   app/downloads/[category]/page.tsx

2. CANONICAL URLS
   Every page must have: <link rel="canonical" href="https://school.edu.bd/notices/slug" />
   Check: apps/website/app/layout.tsx has metadataBase set
   Check: every page.tsx has generateMetadata function

═══ SECTION B — SEO OPTIMIZATION ═══

3. METADATA ON EVERY PAGE
   Check each public page has generateMetadata() returning:
   
   Homepage:
   { title: "{Institution Name}", description: "...", openGraph: {...}, twitter: {...} }
   
   Notice detail page:
   { title: "{Notice Title} | {Institution Name}", description: first 160 chars of notice body }
   
   Result lookup:
   { title: "Result Lookup | {Institution Name}", noIndex: true } (results should not be indexed)
   
   Run: grep -r "generateMetadata\|metadata" apps/website/app/ | wc -l
   Must be >= 15 (one per page)

4. STRUCTURED DATA (JSON-LD)
   Add to homepage:
   <script type="application/ld+json">
   {
     "@context": "https://schema.org",
     "@type": "EducationalOrganization",
     "name": "{institution.name_en}",
     "url": "{institution.website_url}",
     "address": { "@type": "PostalAddress", "addressLocality": "{district}", "addressCountry": "BD" },
     "telephone": "{phone_primary}",
     "logo": "{logo_url}"
   }
   </script>
   
   Add BreadcrumbList structured data on inner pages

5. SITEMAP
   Create: apps/website/app/sitemap.ts
   Must include:
   - Static pages (/, /about, /faculty, /gallery, /downloads, /contact, /result)
   - Dynamic: all published notices (/notices/[slug])
   - Dynamic: all public gallery albums (/gallery/[slug])
   Priority: homepage=1.0, notices=0.8, others=0.6
   Change frequency: notices=daily, pages=monthly

6. ROBOTS.TXT
   Create: apps/website/app/robots.ts
   Allow: all public pages
   Disallow: /result (privacy), /api/*, /admin/*
   Sitemap: https://school.edu.bd/sitemap.xml

7. PAGE SPEED
   All images: use Next.js <Image> component (not <img>)
   Sliders: lazy load images below the fold
   Fonts: add to <link rel="preload"> in layout
   No render-blocking scripts

═══ SECTION C — BILINGUAL (BN + EN) ═══

8. LANGUAGE SWITCHER
   - [ ] Language toggle visible in navbar (BN | EN buttons or globe icon)
   - [ ] Switching to EN: all UI labels change to English
   - [ ] Switching to BN: all UI labels change to Bangla
   - [ ] Language preference saved in localStorage → persists on page refresh
   - [ ] URL does NOT change on language switch (not /en/ prefix — preference-based)

9. CONTENT BILINGUAL
   - [ ] Institution name: shows name_en or name_bn based on language
   - [ ] Notices: if body_bn exists and lang=BN → show BN body; else EN
   - [ ] Static pages: content_bn or content_en based on lang
   - [ ] Faculty names: name_bn in BN mode, name_en in EN mode
   - [ ] Dates: in BN mode show as "১ জুলাই, ২০২৬"; EN mode as "1 July 2026"

10. BANGLA FONT ON WEBSITE
    - [ ] Noto Sans Bengali loaded in apps/website
    - [ ] BN text renders correctly in browser (not boxes)
    - [ ] Font loads in <head> with preconnect to Google Fonts
    - [ ] Heading font for BN: Noto Sans Bengali (NOT Playfair which has no BN)
    
    Check: apps/website/app/layout.tsx has:
    import { Noto_Sans_Bengali, Playfair_Display, Inter } from 'next/font/google'
    Apply: className={lang === 'BN' ? notoBengali.className : inter.className}

11. RIGHT-TO-LEFT (not needed for Bangla — BN is LTR, confirm this is NOT set to RTL)
    Check: no dir="rtl" in layout (Bangla is left-to-right)

═══ SECTION D — THEME & VISUAL QUALITY ═══

12. LIGHT MODE ENFORCEMENT
    - [ ] Check: NO dark mode CSS in apps/website (no dark: Tailwind classes)
    - [ ] Check: NO prefers-color-scheme: dark media queries
    - [ ] Check: html element has no class="dark"
    - [ ] Background: white (#fff) or near-white (#f8fafc) everywhere
    
    If dark mode exists: Remove all dark: prefixed classes from website.
    Add to layout: <html lang="bn" className="light">

13. BLUE & WHITE COLOR SCHEME
    
    Current palette must be:
    Primary blue: #1a3c4a (deep navy) or #2563eb (modern blue)
    Light blue: #eff6ff or #e0f2fe (for hover states, highlights)
    White: #ffffff (main backgrounds)
    Near-black text: #0f172a or #1e293b (body text)
    Medium gray: #64748b (secondary text, captions)
    
    Check every section of the homepage:
    - [ ] Navbar: white background, blue text/logo
    - [ ] Hero slider: images show correctly, overlay text is white on dark overlay
    - [ ] Stats bar: blue background, white text (or white bg, blue text)
    - [ ] Notice widget: white card, dark text, blue "Read More" link
    - [ ] Footer: dark blue (#1a3c4a) background, white text
    - [ ] Buttons: blue fill (#2563eb), white text — NOT gray or black buttons
    - [ ] Links: blue color (#2563eb) — NOT unstyled black text

14. TEXT CONTRAST VERIFICATION
    Using browser DevTools → Accessibility → check each text element:
    
    MUST PASS (WCAG AA = 4.5:1 minimum):
    - [ ] Body text (#1e293b on #fff): ratio ~21:1 ✅
    - [ ] Secondary text (#64748b on #fff): ratio ~4.7:1 ✅ (borderline — if fails use #475569)
    - [ ] Blue links (#2563eb on #fff): ratio ~4.6:1 ✅
    - [ ] White text on blue (#2563eb): ratio ~4.6:1 ✅
    
    MUST FIX if failing:
    - ❌ Light gray (#94a3b8) on white: ratio ~2.8:1 — replace with #64748b or darker
    - ❌ Blue on blue: any button with blue text on blue bg — change to white text
    - ❌ White on white: any invisible text

15. RESPONSIVE WEBSITE CHECK
    Test apps/website at these widths:
    
    375px (iPhone SE):
    - [ ] Navbar: hamburger menu (no desktop links visible)
    - [ ] Slider: full width, text readable (not tiny)
    - [ ] Notice cards: full width, not cut off
    - [ ] Footer: single column stacked
    
    768px (iPad):
    - [ ] 2-column layout for cards/stats
    - [ ] Faculty grid: 2-3 columns
    
    1280px (Desktop):
    - [ ] Full navbar with links
    - [ ] 3-4 column faculty grid
    - [ ] Stats in one row
    
    All widths:
    - [ ] No horizontal scroll bar on any page
    - [ ] Images don't overflow containers
    - [ ] Text doesn't overflow cards

16. HIDING CONTENT CHECK (Critical)
    On each page, check that NO content is accidentally invisible:
    
    Common issues to check and fix:
    - [ ] White text on white background (visibility: CSS color same as bg)
    - [ ] Element with height: 0 or overflow: hidden cutting off text
    - [ ] Text too small to read (< 12px on mobile, < 14px on desktop)
    - [ ] Logo image: shows actual logo, not broken image icon
    - [ ] Favicon: set in layout, shows in browser tab

17. ISR REVALIDATION TEST
    Step 1: Load /notices in browser → note current notice list
    Step 2: Go to admin → create new notice → publish it
    Step 3: Admin publish triggers revalidation webhook
    Step 4: Wait 2 seconds → reload /notices in browser
    Expected: NEW notice appears WITHOUT full page rebuild
    
    If revalidation fails:
    - Check: WEBSITE_REVALIDATE_SECRET matches in both .env files
    - Check: /api/revalidate route in apps/website exists
    - Check: API calls revalidation after publish action
    - Check: ISR revalidation logs in Next.js console

18. PUBLIC RESULT LOOKUP TEST
    - [ ] /result page: form shows "Roll Number" + "Registration Number" fields
    - [ ] Submit with valid roll/registration → shows result table
    - [ ] Submit with invalid roll → shows "No result found" message (not error crash)
    - [ ] Result page is NOT indexed by search engines (check robots.ts)
    - [ ] No student's private info (guardian NID, address) visible on public result

Fix ALL failures in this phase. This is the customer-facing face of the product.
```

---

---

# ════════════════════════════════════════════════
# SECURITY MASTER AUDIT
# ════════════════════════════════════════════════

## Claude Code Prompt — Full Security Audit

```
Read CLAUDE.md. Run a comprehensive security audit across the entire codebase. Fix all issues.

════ AUTHENTICATION & SESSION ════

1. JWT SECRETS
   grep -r "JWT_SECRET\|jwt.sign\|jwt.verify" server/api/src/
   - [ ] No hardcoded secrets (no string literals as secrets)
   - [ ] Secrets loaded from process.env
   - [ ] Access and refresh secrets are DIFFERENT variables

2. SENSITIVE DATA IN RESPONSES
   grep -r "password_hash\|password\b" server/api/src/modules/
   - [ ] No route returns password_hash field
   - [ ] User select statements explicitly exclude: password_hash
   
   Check Prisma queries: ensure all user.findMany / user.findFirst use:
   select: { id, name_en, role, phone, ... } // NEVER include password_hash

3. API KEY EXPOSURE
   grep -r "API_KEY\|SECRET\|TOKEN" server/api/src/ --include="*.ts"
   - [ ] No hardcoded API keys
   - [ ] All secrets via process.env
   - [ ] .env file NOT committed to git (check .gitignore)

════ INPUT VALIDATION ════

4. ZOD VALIDATION COVERAGE
   grep -r "validate\|zodSchema\|z\.object" server/api/src/modules/ | wc -l
   Must be >= 30 (every POST/PUT endpoint must validate)
   
   For any endpoint missing validation: add Zod schema + validate middleware

5. FILE UPLOAD VALIDATION
   Check storage.service.ts:
   - [ ] Validates MIME type via magic bytes (not just extension)
   - [ ] Enforces size limits per file type
   - [ ] Generates new filename (doesn't use original filename — prevents path traversal)
   - [ ] Files stored in Azure Blob (not local disk which could be served directly)

6. SQL INJECTION
   grep -r "\$queryRaw\|\$executeRaw" server/api/src/ 
   If any found: verify they use Prisma.sql template literal (parameterized)
   NOT string concatenation: Prisma.$queryRaw(`SELECT * FROM users WHERE id = '${id}'`) ❌
   CORRECT: Prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}` ✅

7. XSS PREVENTION
   Notice body and page content allow HTML (rich text editor)
   Check: HTML is sanitized before storage using DOMPurify or similar
   Check: Apps/website renders notice body with:
   <div dangerouslySetInnerHTML={{ __html: sanitize(notice.body) }} />
   NOT: <div dangerouslySetInnerHTML={{ __html: notice.body }} />
   
   Install if missing: pnpm --filter=api add isomorphic-dompurify

════ RATE LIMITING ════

8. RATE LIMIT COVERAGE
   Check middleware/rateLimit.ts exists and is applied to:
   - [ ] /api/auth/login: 5 per 15min per IP
   - [ ] /api/auth/forgot-password: 3 per hour per phone
   - [ ] /api/admission/apply: 3 per hour per IP (prevent spam applications)
   - [ ] /api/content/*: 100 per minute per IP
   - [ ] All authenticated routes: 60 per minute per user

════ SECURITY HEADERS ════

9. HELMET.JS
   Check server/api/src/app.ts:
   - [ ] app.use(helmet()) is called
   - [ ] Content-Security-Policy is set
   - [ ] X-Frame-Options: DENY (prevents clickjacking)
   - [ ] X-Content-Type-Options: nosniff

10. CORS CONFIG
    Check: CORS allows ONLY:
    - process.env.ADMIN_URL (e.g. https://admin.school.edu.bd)
    - process.env.PORTAL_URL
    - process.env.WEBSITE_URL
    NOT: origin: '*' (this is a critical security issue)

════ TENANT DATA ISOLATION (even though single tenant, good habits) ════

11. ENVIRONMENT SEPARATION
    - [ ] Dev database is separate from production
    - [ ] Production .env never committed
    - [ ] Seed data only runs in development (NODE_ENV check in seed.ts)

════ PAYMENT SECURITY ════

12. GATEWAY WEBHOOK VERIFICATION
    Check each gateway callback handler:
    - [ ] bKash: verifies HMAC-SHA256 signature from header
    - [ ] Nagad: verifies merchant signature
    - [ ] SSLCommerz: verifies store ID + hash validation
    - [ ] None accept unverified webhooks and update invoices

════ AUDIT LOGGING ════

13. SENSITIVE ACTION LOGS
    The following actions must be logged to an AuditLog table (add if missing):
    - Login / logout
    - Mark entry submission
    - Result approval / publication
    - Fee waiver
    - Student deletion
    - Role change
    - Template activation
    
    Create model AuditLog { id, action, user_id, target_type, target_id, metadata_json, created_at }
    Add logging to each sensitive action in service layer

Report: list of every security issue found and what fix was applied.
Rate severity: CRITICAL / HIGH / MEDIUM / LOW for each.
```

---

---

# ════════════════════════════════════════════════
# RESPONSIVE & THEME MASTER AUDIT
# ════════════════════════════════════════════════

## Claude Code Prompt — Full UI/UX Audit

```
Read CLAUDE.md. Run comprehensive UI/UX audit on apps/admin and apps/website. Fix all issues.

════ THEME ENFORCEMENT (Admin Panel) ════

1. COLOR AUDIT
   Run this check across all TSX files in apps/admin:
   grep -r "bg-gray-[89]\|bg-slate-[89]\|bg-zinc-[89]" apps/admin/app/ → should be 0 results (no near-black bg in light mode)
   grep -r "text-gray-[23]\|text-slate-[23]" apps/admin/app/ → should be 0 results (no near-invisible text)
   grep -r "dark:" apps/admin/app/ → all results: ensure they don't accidentally invert colors
   
   Required admin color scheme:
   Page background: bg-slate-50 (#f8fafc)
   Sidebar: bg-white with border-r border-slate-200
   Cards: bg-white with shadow-sm
   Active nav: bg-blue-50 text-blue-700
   Primary buttons: bg-blue-600 hover:bg-blue-700 text-white
   Danger buttons: bg-red-600 hover:bg-red-700 text-white
   Secondary buttons: bg-white border border-slate-300 text-slate-700
   Table header: bg-slate-50 or bg-blue-50 with text-slate-700 font-medium
   Table rows: bg-white hover:bg-slate-50

2. LIGHT MODE LOCK
   Check apps/admin/app/layout.tsx:
   <html lang="bn"> (NOT <html lang="bn" data-theme="dark">)
   
   Check tailwind.config.ts:
   darkMode: 'class' (good — means dark mode only applies if class="dark" on html)
   Confirm: html element NEVER gets class="dark" applied
   
   Check: NO useSystemTheme or dark mode toggle component exists in admin

3. CONTRAST CHECKER
   For each text color used, verify:
   text-slate-900 on bg-white: ✅ 21:1
   text-slate-700 on bg-white: ✅ ~7:1
   text-slate-500 on bg-white: ✅ ~4.7:1 (barely passes — increase to slate-600 if possible)
   text-slate-400 on bg-white: ❌ ~3:1 FAILS — change to slate-500 minimum
   text-blue-600 on bg-white: ✅ ~4.6:1
   text-white on bg-blue-600: ✅ ~4.6:1
   
   FIX any failing contrast automatically.

════ RESPONSIVE AUDIT — ADMIN PANEL ════

4. SIDEBAR BEHAVIOR
   At 1280px+: sidebar visible (260px fixed left)
   At 768px-1279px: sidebar collapsible (toggle button)
   At < 768px: sidebar hidden, accessible via hamburger menu
   
   Check: CSS uses @media or Tailwind responsive prefixes
   Check: Content area adjusts: ml-0 (mobile) → ml-[260px] (desktop)

5. DATA TABLES RESPONSIVENESS
   At 375px (mobile): tables should:
   - Scroll horizontally (overflow-x-auto wrapper)
   - OR convert to card view (one card per row)
   - NOT overflow the viewport (no horizontal page scroll)
   
   Test student list table at 375px:
   - [ ] Horizontal scroll within table container (not whole page)
   - [ ] Table still usable on mobile (even if cramped)

6. FORMS RESPONSIVENESS
   Test /students/new at 375px:
   - [ ] Single column layout (not 2-column squished)
   - [ ] Input labels above inputs (not side by side)
   - [ ] Date picker opens correctly on mobile
   - [ ] File upload drop zone usable on mobile
   - [ ] "Next" button visible without scrolling (or easily reachable)

7. DASHBOARD CARDS RESPONSIVENESS
   At 375px: 1 column (full width cards)
   At 768px: 2 columns
   At 1280px: 4 columns
   
   Check /dashboard shows stats cards correctly at all widths
   Check: numbers in cards don't get cut off (overflow: hidden clipping text)

════ RESPONSIVE AUDIT — WEBSITE ════

8. NAVBAR (website)
   At 375px:
   - [ ] Logo visible and not oversized
   - [ ] Hamburger menu icon visible (3 lines or similar)
   - [ ] Desktop nav links: hidden
   - [ ] Hamburger click: slide-in drawer opens with all nav links
   - [ ] Drawer has close button (X)
   - [ ] Language toggle accessible in drawer
   
   At 768px+:
   - [ ] All nav links visible horizontally
   - [ ] No hamburger menu
   - [ ] Language toggle in top right

9. HOMEPAGE HERO SLIDER
   At 375px:
   - [ ] Slider takes full width
   - [ ] Text overlay readable (contrast over image)
   - [ ] Title font size appropriate (not 48px on mobile)
   - [ ] Call-to-action button visible and tappable (min 44×44px touch target)
   - [ ] Slider navigation dots visible

10. NOTICE BOARD WIDGET
    At 375px:
    - [ ] Cards stack vertically
    - [ ] Title text doesn't overflow (text-ellipsis applied)
    - [ ] Date badge visible
    - [ ] "Download" button doesn't overflow card

11. FOOTER
    At 375px:
    - [ ] 1 column (not 3 cramped columns)
    - [ ] Social media icons properly sized (24×24px min)
    - [ ] "Powered by AshDevs" visible
    - [ ] All text readable (not tiny)

════ FONT & TYPOGRAPHY ════

12. BANGLA FONT LOADING
    Open browser DevTools → Network tab → filter by "font"
    Load any page with Bangla content
    - [ ] "NotoSansBengali" font request visible and status 200
    - [ ] Font loads before Bangla text renders (no FOUT/boxes)
    
    Check: preconnect and preload in <head>:
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

13. FONT SIZE STANDARDS
    Body text: 14-16px (not smaller)
    Small text/captions: 12px minimum
    Table cell text: 14px minimum
    Headings: h1=28-32px, h2=22-24px, h3=18-20px
    
    Check: no text smaller than 12px on any screen size
    grep -r "text-\[8px\]\|text-\[10px\]\|text-xs" apps/admin/app/ 
    text-xs in Tailwind = 12px — acceptable minimum, but use sparingly

14. BANGLA FONT IN ADMIN PANEL
    Some text in admin will be Bangla (student names, institution name BN, etc.)
    Check: Noto Sans Bengali is also loaded in apps/admin/app/layout.tsx
    Not just apps/website — admin also needs Bangla font

════ INTERACTION & UX ════

15. LOADING STATES
    Every data fetch must show loading state (skeleton or spinner):
    - [ ] Student list: skeleton rows while loading
    - [ ] Dashboard stats: skeleton cards while loading
    - [ ] Form submit: button disabled + spinner
    - [ ] PDF generation: progress indicator (not silent hang)

16. ERROR STATES
    - [ ] When API returns error: show error message (not silent failure)
    - [ ] Network error: "Connection failed. Please try again." toast
    - [ ] Empty list: "No students found" with illustration/icon (not blank page)
    - [ ] 404 page: exists in apps/admin/app/not-found.tsx and apps/website/app/not-found.tsx

17. TOAST NOTIFICATIONS
    All success/error actions show toast:
    - [ ] Attendance saved → success toast (green)
    - [ ] Notice published → success toast
    - [ ] API error → error toast (red) with message
    - [ ] Toast duration: 4 seconds, auto-dismiss
    - [ ] Toast not blocking content (positioned bottom-right or top-right)

Report: every issue found with severity. Apply all fixes.
```

---

---

# ════════════════════════════════════════════════
# SKIP/COMPLETENESS AUDIT
# ════════════════════════════════════════════════

## Claude Code Prompt — Check Nothing Was Skipped

```
Read CLAUDE.md and PHASE_PROMPTS.md and PHASE_PROMPTS_PART2.md.
Run a completeness audit — check every feature mentioned in those files is implemented.

Run these checks:

════ SETTINGS COMPLETENESS ════
Check that ALL settings endpoints exist:
endpoints=("institution" "institution/type" "institution/logo" "config" "student-id-config" "student-id-config/preview" "grading-scales" "exam-types" "fee-rules" "attendance-rules" "signatures" "authority-config" "templates" "notifications" "academic-years" "shifts" "departments" "classes" "sections" "subjects" "users")
for ep in "${endpoints[@]}"; do
  grep -r "\"\/api\/settings\/$ep\"" server/api/src/ || echo "MISSING: /api/settings/$ep"
done

════ STUDENT ENDPOINTS ════
Required: GET /api/students, GET /api/students/:id (360°), POST, PUT, DELETE, 
          POST /bulk-import, POST/:id/promote, POST /bulk-promote,
          GET/:id/subjects, POST/:id/subjects/extra
grep -r "router\.\(get\|post\|put\|delete\)" server/api/src/modules/students/ | wc -l
Must be >= 10

════ ATTENDANCE ENDPOINTS ════
Required: POST /mark, GET (class), GET /student/:id, GET /defaulters, 
          GET /daily-summary, reports/daily-register, reports/monthly-sheet,
          reports/bulk-export, reports/blank-sheet, POST /staff/mark
grep -r "router\." server/api/src/modules/attendance/ | wc -l
Must be >= 10

════ EXAM + MARKS ENDPOINTS ════
grep -r "router\." server/api/src/modules/examination/ server/api/src/modules/marks/ | wc -l
Must be >= 15

════ WEBSITE CONTENT ENDPOINTS ════
grep -r "router\." server/api/src/modules/website/ | wc -l
Must be >= 25

Public endpoints check:
grep -r "\/api\/content\/" server/api/src/ | wc -l
Must be >= 10

════ DOCUMENT TYPES COVERAGE ════
templates=("student-id-card" "staff-id-card" "admit-card" "registration-card" "marksheet" "report-card" "tabulation-sheet" "testimonial" "transfer-certificate" "attendance-blank" "fee-receipt" "payslip")
for t in "${templates[@]}"; do
  ls server/api/src/templates/defaults/$t.html 2>/dev/null || echo "MISSING TEMPLATE: $t.html"
done

════ ADMIN UI PAGES COVERAGE ════
pages=("settings/institution" "settings/student-id" "settings/grading" "settings/exam-types" "settings/fee-rules" "settings/attendance-rules" "settings/signatures" "settings/signature-mapping" "settings/templates" "settings/users" "settings/notifications" "settings/academic" "settings/departments" "settings/subjects" "students" "students/new" "attendance/mark" "attendance/reports" "examination" "marks" "results" "fees" "fees/structures" "fees/collect" "fees/reports" "admission" "documents/print" "website/notices" "website/sliders" "website/gallery" "website/downloads" "website/pages" "website/governing-body" "hr/staff" "hr/leave" "hr/payroll" "library" "transport" "hostel" "reports" "dashboard")
for p in "${pages[@]}"; do
  ls apps/admin/app/\(dashboard\)/$p/page.tsx 2>/dev/null || echo "MISSING PAGE: /admin/$p"
done

════ WEBSITE PUBLIC PAGES ════
pages=("" "notices" "gallery" "downloads" "about" "faculty" "governing-body" "result" "admission" "contact" "events")
for p in "${pages[@]}"; do
  ls apps/website/app/$p/page.tsx 2>/dev/null || echo "MISSING WEBSITE PAGE: /$p"
done

════ GRADING ENGINE TESTS ════
ls server/api/src/utils/grading.engine.test.ts || echo "MISSING: grading engine unit tests"
pnpm test 2>&1 | grep -E "PASS|FAIL|Tests:"

════ ENVIRONMENT VARIABLES ════
required_vars=("DATABASE_URL" "REDIS_URL" "JWT_ACCESS_SECRET" "JWT_REFRESH_SECRET" "AZURE_STORAGE_CONNECTION_STRING" "SMS_API_TOKEN" "BKASH_APP_KEY" "NAGAD_MERCHANT_ID" "SSLCOMMERZ_STORE_ID" "ADMIN_URL" "PORTAL_URL" "WEBSITE_URL" "API_URL" "WEBSITE_REVALIDATE_SECRET")
for v in "${required_vars[@]}"; do
  grep "$v" .env.example || echo "MISSING FROM .env.example: $v"
done

Report: list everything missing. Build/create everything missing before considering phase complete.
```

---

---

# ════════════════════════════════════════════════
# FINAL INTEGRATION TEST
# ════════════════════════════════════════════════

## Claude Code Prompt — End-to-End Integration Test

```
Read CLAUDE.md. Run the full end-to-end integration test.
This simulates a real institution using the system for one semester.

Start all services: pnpm dev
Verify running: apps/admin (3000), apps/portal (3001), apps/website (3002), server/api (4000)

════ TEST SCENARIO: FULL SEMESTER FLOW ════

STEP 1 — INITIAL SETUP
  Login as ADMIN (01700000000 / Admin@1234)
  Go to /settings/institution → verify institution profile loaded from seed
  Go to /settings/student-id → set prefix="ALh", year=true, digits=4, separator="-"
  Expected: preview shows "ALh-26-0001"
  Go to /settings/grading → verify BD Board standard scale exists
  Go to /settings/exam-types → verify 3 exam types exist

STEP 2 — CREATE ACADEMIC STRUCTURE
  /settings/academic → create "2026-2027" academic year → set as active
  Create shifts: Morning (07:30-12:30), Day (12:30-17:30)
  Create class: "Class 9" → create sections: "A" (Morning shift), "B" (Day shift)
  Create subjects for Class 9: Bangla 1st Paper, English, Mathematics, Physics, Chemistry, Biology (optional)
  
  Go to /settings/subjects → assign teachers to subjects (use seed teachers)
  Expected: each subject in each section has a teacher assigned

STEP 3 — ENROLL STUDENTS
  /students/new → create 5 students, assign to Class 9 Section A
  Check each has student_uid format "ALh-26-00{n}"
  Check each student's subjects tab: compulsory subjects auto-assigned

STEP 4 — MARK ATTENDANCE
  /attendance/mark → select Class 9, Section A, Morning shift, today
  Mark 4 students Present, 1 Absent
  Check: SMS queue has 1 message queued (for absent student's guardian)
  Check: student profile attendance tab shows today's record

STEP 5 — EXAMINATION + MARKS + RESULTS
  /examination → create "Half Yearly 2026" exam for Class 9
  Set mark entry window: open now, closes in 2 hours
  Login as Subject Teacher (01700000004) → go to /marks
  Enter marks for Mathematics: 85, 72, 90, 55, 45 for 5 students
  Login as EXAM_CONTROLLER → /marks/{exam_id}/approve → approve Class 9
  Publish result → set is_public=true
  
  Check: /results in admin shows result table correctly
  Check: apps/website /result → search for student roll → shows result ✅
  Check: student portal /results shows the published result

STEP 6 — FEE COLLECTION
  /fees/structures → create "Monthly Tuition" fee, ৳500/month for Class 9
  /fees/invoices/generate → generate for July 2026, Class 9
  Check: 5 invoices created, one per student
  /fees/collect → search first student → collect ৳500 → receipt generated
  
  Check: student portal /fees shows paid invoice with receipt link

STEP 7 — WEBSITE CONTENT
  /website/notices → create notice "Annual Sports Day" → publish to website
  /website/sliders → add slider image → set active
  
  Open apps/website (port 3002):
  Check: slider shows new image
  Check: notice board shows "Annual Sports Day" notice
  Check: /notices/annual-sports-day URL works (slug-based) ✅
  Check: Bangla content renders correctly
  Check: Language toggle switches EN↔BN

STEP 8 — DOCUMENT GENERATION
  /documents/print → Student ID Card → Class 9 → Section A → Preview One
  Check: PDF renders with institution logo, student name (EN+BN), UID, class
  
  /documents/print → Marksheet → select Half Yearly exam → Class 9 → Download All
  Check: PDF with 5 pages (one per student), all marks visible

STEP 9 — STUDENT PORTAL VERIFICATION
  Login as student (use student's portal credentials from welcome SMS)
  /                → check dashboard shows class, roll, attendance %, notices
  /attendance      → check calendar shows today as Present
  /results         → check Half Yearly result visible
  /fees            → check July tuition shows as Paid with receipt
  /routine         → check class timetable visible

STEP 10 — SEO VERIFICATION
  curl -I http://localhost:3002/notices/annual-sports-day
  Expected: 200 OK (not 404)
  
  curl http://localhost:3002/sitemap.xml
  Expected: XML with at least 10 URLs including the new notice slug
  
  curl http://localhost:3002/robots.txt
  Expected: User-agent: * with Disallow: /result
  
  View source of http://localhost:3002/notices/annual-sports-day
  Expected: <meta name="description"> with notice content
  Expected: <link rel="canonical"> with correct URL

REPORT RESULTS:
  ✅ Pass / ❌ Fail for each step
  For each failure: what error occurred and what fix was applied
  Final status: READY FOR PRODUCTION or ISSUES REMAINING
```

---

---

## 🔲 Test Completion Checklist

After all prompts have been run, verify:

```
[ ] Phase 0:  Schema complete, seed runs, 40+ models
[ ] Phase 1:  All settings work, student ID preview live, grading editor validates
[ ] Phase 2:  Login works, rate limiting active, JWT secure, no password leaks
[ ] Phase 3:  Student CRUD, UID format correct, subject inheritance works
[ ] Phase 4:  Teacher-subject assignment works per section
[ ] Phase 5:  Attendance marks save, biometric conflict detected, exports work
[ ] Phase 6:  All grading unit tests PASS, mark entry scope enforced
[ ] Phase 7:  Results show publicly, Bangla renders in PDF
[ ] Phase 8:  Fee calc correct, late fee rules apply, payment gateway verified
[ ] Phase 9:  Admission form dynamic, auto-enroll works, slugs on URLs
[ ] Phase 10: All 12 document types generate, Bangla in PDF, signatures overlay
[ ] Phase 11: All website sections controlled from admin, ISR works, SEO complete
[ ] Phase 12: Payroll calculates from attendance, payslip PDF generates
[ ] Phase 13: Library issue/return + fine, transport assignment, hostel allocation
[ ] Phase 14: Dashboard loads in < 2 seconds, charts render correctly
[ ] Phase 15: Portal PWA installable, offline cached data shows
[ ] Phase 16: Biometric punch processed, shift-aware, offline reconciliation runs
[ ] Phase 17: SMS queues and sends, Bangla SMS text correct
[ ] Phase 18: Security audit PASSED, Docker compose up works, all tests green

THEME:
[ ] Light mode only, no dark mode anywhere
[ ] Blue (#2563eb) + White (#fff) primary palette everywhere
[ ] No text invisible (all contrast ratios pass WCAG AA)
[ ] No content hidden due to same-color text/background

SEO:
[ ] Slug-based URLs on all public content
[ ] generateMetadata on every website page
[ ] Sitemap.xml accessible
[ ] Robots.txt correct
[ ] Bangla AND English content on same page

RESPONSIVE:
[ ] No horizontal scroll on any page (375px, 768px, 1280px tested)
[ ] Admin sidebar collapses on mobile
[ ] Website hamburger menu works
[ ] All touch targets >= 44×44px on mobile
```

---
*AshDevs · Education ERP · Complete Testing Playbook · July 2026*
