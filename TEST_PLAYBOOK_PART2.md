# 🧪 Education ERP — Testing Playbook Part 2
# Phases 4, 12–18 · Performance · Database · API · Master Prompts

> This file continues from TEST_PLAYBOOK.md
> Read CLAUDE.md before using any prompt here.

---

---

# ════════════════════════════════════════════════
# PHASE 4 TEST — Subjects & Teacher Assignment
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 4 Audit

```
Read CLAUDE.md. Run Phase 4 subject + teacher assignment audit. Fix all issues.

API TESTS:

1. SUBJECT CREATION
   POST /api/subjects
   Body: { class_id, name_en:"Physics", name_bn:"পদার্থবিজ্ঞান", code:"PHY", 
           subject_type:"THEORY", is_compulsory:true, full_marks:100, pass_marks:33 }
   Expected: 201 with created subject
   
   POST same code again for same class → Expected: 409 CONFLICT (unique code per class)
   POST same code for DIFFERENT class → Expected: 201 OK (code can repeat across classes)

2. SUBJECT REORDER
   PUT /api/subjects/reorder
   Body: [{ id: sub1, display_order: 3 }, { id: sub2, display_order: 1 }]
   GET /api/subjects?class_id={id} → verify returned in display_order ASC

3. TEACHER ASSIGNMENT
   POST /api/subjects/assign
   Body: { subject_id, staff_id, section_id, academic_year_id }
   Expected: 201

   POST same assignment again → Expected: 409 (unique per subject+section+year)

   PUT /api/subjects/assign/{id} with different staff_id → Expected: 200 (change teacher)

4. ASSIGNMENT IN STUDENT PROFILE
   GET /api/students/{id} → check subjects array
   Each subject must include: { assigned_teacher: { name_en, designation } }
   If no teacher assigned: assigned_teacher should be null (not crash)

5. DELETE BLOCKED IF MARK ENTRIES EXIST
   Create mark entries for a subject
   DELETE /api/subjects/{id} → Expected: 400 with message "Cannot delete — exam records exist"

6. SUBJECT INHERITANCE ON CLASS CHANGE
   Create student in Class 9 → note compulsory subjects assigned
   Change student to Class 10 (PUT /api/students/{id} with current_class_id = class10.id)
   GET /api/students/{id}/subjects → 
   Expected: Class 10 compulsory subjects NOW assigned
   Expected: Class 9 historical subjects RETAINED in StudentSubject with academic_year_id of old year

UI TESTS:

7. SUBJECTS PAGE (/settings/subjects)
   - [ ] Left panel shows class list grouped by academic year
   - [ ] Click Class 9 → right panel shows its subjects
   - [ ] Drag-to-reorder works (drag handle visible, reorder saves on drop)
   - [ ] Each subject row shows: name, code badge, type badge, marks
   - [ ] "Expand" on subject → shows teacher assignments table
   - [ ] Per section row: teacher name shown OR "Not Assigned" in orange
   - [ ] Teacher search combobox: type teacher name → results appear, select → saves

8. SUBJECT BADGES
   - [ ] Compulsory badge: blue/green with white text
   - [ ] Optional badge: gray with dark text
   - [ ] Theory / Practical / Both type badges clearly colored
   - [ ] Code badge: monospace font, visible contrast

9. EMPTY STATE
   - [ ] New class with no subjects: shows "No subjects added. Click + to add."
   - [ ] Subject with no teacher: shows "Not Assigned" (not blank/invisible)

Fix all failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 12 TEST — HR & Payroll
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 12 Audit

```
Read CLAUDE.md. Run Phase 12 HR and payroll audit. Fix all issues.

API TESTS:

1. STAFF UID GENERATION
   POST /api/hr/staff with user info + staff info
   Expected: staff_uid auto-generated as "STAFF-2026-0001" or similar format
   
   Create 2 staff → check unique UIDs (no duplicates even in rapid succession)

2. LEAVE BALANCE CALCULATION
   Create leave type: "Casual Leave", days_allowed: 10, is_paid: true
   Apply leave for 3 days (from_date to to_date spanning 3 working days)
   Approve it
   GET /api/hr/leaves/balance/{staff_id}
   Expected: { leave_type: "Casual Leave", total_allowed: 10, used: 3, remaining: 7 }

3. LEAVE EXCEEDS BALANCE
   Apply for 15 days (exceeds 10 allowed)
   Expected: 400 error "Insufficient leave balance. Available: 7 days, Requested: 15 days"

4. LEAVE → ATTENDANCE LINK
   After approving leave for 3 days:
   GET /api/attendance?person_id={staff_id}&date={leave_date}
   Expected: AttendanceRecord exists with status=LEAVE, source=MANUAL (auto-created by leave approval)

5. PAYROLL CALCULATION TEST
   Setup: Staff with salary structure: basic=20000, house_rent=8000, medical=2000, pf=10%, tds=5%
   Working days in test month: 26
   Staff attendance: present=24, absent=2 (so 2 days deducted)
   
   POST /api/hr/payroll/calculate for that month
   Expected PayrollRecord:
     gross = basic + house_rent + medical = 30000
     per_day = 30000 / 26 ≈ 1153.85
     absence_deduction = 2 × 1153.85 ≈ 2307.69
     pf = 30000 × 10% = 3000
     tds = 30000 × 5% = 1500
     deductions = 2307.69 + 3000 + 1500 = 6807.69
     net = 30000 - 6807.69 = 23192.31
   
   Verify these numbers match within ±1 BDT (floating point rounding)

6. PAYROLL STATUS FLOW
   After calculate: status=DRAFT
   PUT /api/hr/payroll/{id} → edit bonus amount → recalculates → still DRAFT
   POST /api/hr/payroll/finalize for that month → status=FINALIZED
   Try PUT /api/hr/payroll/{id} after finalize → Expected: 403 "Cannot edit finalized payroll"
   POST /api/hr/payroll/mark-paid → status=PAID

7. PAYSLIP PDF
   GET /api/documents/payroll/payslip/{payroll_record_id}
   Check PDF:
   - [ ] Staff name visible
   - [ ] Month/Year shown correctly
   - [ ] Earnings table: all components listed
   - [ ] Deductions table: PF, TDS, absence deduction
   - [ ] NET SALARY in large font at bottom
   - [ ] Accountant signature block present
   - [ ] Institution logo and name in header

UI TESTS:

8. STAFF LIST (/hr/staff)
   - [ ] Photo avatar visible (initials fallback if no photo)
   - [ ] Staff UID shown in monospace badge
   - [ ] Designation and Department shown
   - [ ] Role badge colored per role type
   - [ ] "Inactive" staff visually distinct (grayed out row or badge)

9. STAFF PROFILE TABS (/hr/staff/:id)
   - [ ] Profile tab: all info sections visible
   - [ ] Leave tab: leave balance summary cards visible
     - Card per leave type: "Used 3 of 10 days" with progress bar
   - [ ] Payroll tab: month-by-month payroll history table
     - "Download Payslip" link per month
   - [ ] Attendance tab: same calendar view as student

10. PAYROLL PAGE (/hr/payroll)
    - [ ] Month/Year selector at top
    - [ ] "Calculate Payroll" button → shows progress ("Processing 12 staff...")
    - [ ] After calculation: table shows all staff with calculated amounts
    - [ ] Net salary column: large, bold numbers
    - [ ] Status column: "Draft" (orange) → "Finalized" (blue) → "Paid" (green)
    - [ ] "Download All Payslips" → downloads merged PDF

11. LEAVE MANAGEMENT (/hr/leave)
    - [ ] Pending requests tab shows count badge
    - [ ] Each request: staff name, type, dates, days, reason, Approve/Reject buttons
    - [ ] After approve: moves to Approved tab immediately (optimistic UI)
    - [ ] Rejected requests show reason dialog on click

Fix all failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 13 TEST — Library, Transport & Hostel
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 13 Audit

```
Read CLAUDE.md. Run Phase 13 audit for all 3 supporting modules. Fix all issues.

════ LIBRARY TESTS ════

API TESTS:

1. BOOK ISSUE FLOW
   POST /api/library/books → create book { title:"Physics", total_copies:3, available:3 }
   POST /api/library/issues/issue → { book_id, person_id:student_id, person_type:"STUDENT", due_date:"+14days" }
   Expected: 201, book.available decrements to 2
   
   GET /api/library/books/{id} → available: 2 ✅

2. RETURN + FINE CALCULATION
   Return on due date: POST /api/library/issues/{id}/return
   Expected: fine_amount = 0
   
   Issue another copy, set due_date = 7 days AGO
   POST /api/library/issues/{id}/return
   Default fine_per_day = 2, overdue = 7 days
   Expected: fine_amount = 14, fine_paid = false
   
   After return: book.available increments back ✅

3. OVER-ISSUE PREVENTION
   Book total_copies = 1, available = 0 (all issued)
   POST /api/library/issues/issue → Expected: 400 "No copies available"

4. PERSON LIBRARY HISTORY
   GET /api/library/issues/person/{student_id}
   Expected: array of all books this student has ever borrowed
   
   Check this also appears in student 360° profile (/api/students/{id})
   student.library.issued_books should show currently issued books
   student.library.total_fines should show unpaid fine total

UI TESTS:

5. LIBRARY DASHBOARD (/library)
   - [ ] Stats cards: Total Books | Active Issues | Overdue | Total Fines
   - [ ] "Overdue" count shown in red

6. ISSUE BOOK (/library/issue)
   - [ ] Student/staff search combobox with photo avatar
   - [ ] Book search (ISBN or title)
   - [ ] Selected book shows cover, available copies count
   - [ ] Due date picker (default: today + 14 days)
   - [ ] "Issue" button → success toast
   - [ ] If book unavailable: "Issue" disabled with tooltip "No copies available"

7. RETURN BOOK (/library/return)
   - [ ] Search by student name or scan barcode
   - [ ] Shows all currently issued books for selected person
   - [ ] If overdue: red warning card "Overdue by X days. Fine: ৳Y"
   - [ ] "Mark Returned" → fine amount confirmed → receipt generated

════ TRANSPORT TESTS ════

API TESTS:

8. ROUTE SETUP + STUDENT ASSIGNMENT
   POST /api/transport/routes → { name: "Pahartali Route", fare: 300 }
   POST stops → 3 stops in order
   POST /api/transport/assign → { student_id, route_id, pickup_stop: "Stop 2" }
   
   GET /api/transport/routes/{id}/students → shows assigned student ✅
   GET /api/students/{id} → transport tab shows route and pickup stop ✅

9. FARE → INVOICE LINK
   Assign student to route with fare=300
   Expected: Transport invoice automatically created (or admin can generate)
   GET /api/fees/invoices?student_id={id} → should have a TRANSPORT category invoice

UI TESTS:

10. TRANSPORT PAGE (/transport)
    - [ ] Route cards with vehicle + student count
    - [ ] Click route → student manifest table
    - [ ] "Print Manifest" → PDF with passenger list per route
    - [ ] "Add Student" → search student → assign stop

════ HOSTEL TESTS ════

API TESTS:

11. ROOM ALLOCATION
    Create block → room (capacity: 4) → allocate student to room
    GET /api/hostel/rooms/{id}/residents → shows student ✅
    Allocate 5th student to room with capacity 4 → Expected: 400 "Room is full"

12. VISITOR LOG
    POST /api/hostel/visitors → { student_id, visitor_name, relation, phone, purpose }
    Expected: in_time = now, out_time = null
    PUT /api/hostel/visitors/{id}/checkout → out_time = now ✅
    
    GET /api/hostel/reports/occupancy → room fill rates ✅

UI TESTS:

13. HOSTEL VISUAL GRID (/hostel)
    - [ ] Blocks shown as expandable cards
    - [ ] Each room shown as a colored tile:
      - Green: has available beds
      - Orange: almost full (>=75% occupied)
      - Red: fully occupied
    - [ ] Click room tile → drawer/modal shows residents list
    - [ ] "Allocate Student" button in room detail
    - [ ] Visitor log tab: real-time in/out log

Fix all library, transport, and hostel failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 14 TEST — Analytics Dashboard
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 14 Audit

```
Read CLAUDE.md. Run Phase 14 analytics audit. Fix all issues.

API TESTS:

1. OVERVIEW ENDPOINT PERFORMANCE
   GET /api/analytics/overview
   Time the response: must return in < 500ms
   
   If slow: add Redis caching (5 min TTL) and database query optimization
   Check: uses Promise.all() for parallel DB queries (not sequential awaits)

2. ATTENDANCE TREND DATA
   GET /api/analytics/attendance-trend?period=MONTHLY&weeks_back=8
   Expected: { labels: ["Week 1", ...8 items], data: [78, 82, 75, ...8 items] }
   All numbers: 0-100 (percentage), not raw counts

3. FEE COLLECTION CHART DATA
   GET /api/analytics/fee-collection?from_date=2026-07-01&to_date=2026-07-31
   Expected: { daily: [{date, amount}...31], by_category: [...], gateway_breakdown: [...] }
   Sum of daily.amount should equal sum of by_category totals

4. AT-RISK STUDENTS
   GET /api/analytics/defaulters-risk
   Student with attendance=60% AND dues overdue should appear
   Student with attendance=80% AND no dues should NOT appear
   Check: composite risk_score logic is correct

5. DASHBOARD LOAD TIME
   Open /dashboard in browser → DevTools → Network → measure time to interactive
   Target: < 3 seconds on localhost (< 5 seconds on production)
   
   If slow: 
   - Check: all API calls use Promise.all (parallel, not serial)
   - Check: skeleton loading state shows immediately
   - Check: charts render progressively (data arrives last)

UI TESTS:

6. DASHBOARD LAYOUT (/dashboard)
   - [ ] 4 stat cards visible in row 1
   - [ ] Each card shows number + label + sub-info (e.g. "Present today: 234")
   - [ ] Attendance trend chart: line chart with week labels on X axis
   - [ ] Chart lines have distinct colors (not all same color)
   - [ ] Fee collection chart: bar chart, Y axis shows ৳ currency
   - [ ] Charts render within 1 second of page load
   
   At 375px (mobile):
   - [ ] Cards stack to 1 column (full width)
   - [ ] Charts render at mobile-appropriate size (not cut off)
   - [ ] Chart labels readable (not overlapping)

7. AT-RISK TABLE
   - [ ] Students color-coded: red (critical <60%) / orange (warning 60-75%) / yellow (caution 75-80%)
   - [ ] "SMS Guardian" button per row → sends attendance SMS
   - [ ] Bulk "SMS All At-Risk" button → confirmation dialog showing count

8. ROLE-SPECIFIC VIEWS
   Login as CLASS_TEACHER → /dashboard
   - [ ] Shows "My Classes Today" widget (not campus-wide)
   - [ ] Shows "My Pending Mark Entries"
   - [ ] Does NOT show financial data
   
   Login as ACCOUNTANT → /dashboard
   - [ ] Shows fee collection charts
   - [ ] Shows defaulter count
   - [ ] Does NOT show academic performance data

9. RECHARTS RENDERING
   Open browser DevTools → Console
   - [ ] No "Warning: Each child in a list should have a unique key" errors
   - [ ] No "Cannot read properties of undefined" errors from chart data
   - [ ] Charts handle empty data gracefully (shows "No data" state, not crash)

10. REPORTS PAGE (/reports)
    - [ ] All report categories visible (Academic / Finance / HR / Management)
    - [ ] Click any report → filter panel appears
    - [ ] "Generate" button → loading state → table appears
    - [ ] "Download PDF" → file downloads (not 0 bytes)
    - [ ] "Download Excel" → .xlsx file downloads and opens

Fix all failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 15 TEST — Student/Guardian Portal (PWA)
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 15 Portal Audit

```
Read CLAUDE.md. Run Phase 15 portal PWA audit. Fix all issues.

PWA TESTS:

1. PWA INSTALLABILITY
   Open apps/portal (port 3001) in Chrome
   DevTools → Application → Manifest
   - [ ] Manifest valid (no errors)
   - [ ] name: "School Name Student Portal" (uses institution name)
   - [ ] short_name: "Portal"
   - [ ] icons: at least 192×192 and 512×512 PNG
   - [ ] theme_color: institution primary_color
   - [ ] background_color: white
   - [ ] display: "standalone"
   
   Chrome address bar → "Install app" icon should appear
   Click install → app opens as standalone window (no browser chrome)

2. SERVICE WORKER
   DevTools → Application → Service Workers
   - [ ] Service worker registered (not "none")
   - [ ] Status: "activated and is running"
   
   Network tab → Go offline (toggle offline mode)
   Reload portal → 
   - [ ] Shows cached content (not blank white page)
   - [ ] Shows "You're offline — showing cached data" banner
   - [ ] Dashboard still renders with last-loaded data

3. OFFLINE ATTENDANCE CACHE
   Load /attendance page while online
   Go offline
   Navigate back to /attendance
   - [ ] Last attendance calendar still visible
   - [ ] "Cached data from X hours ago" note shown

AUTHENTICATION TESTS:

4. STUDENT LOGIN
   Use credentials from seed: student created in Phase 3 integration test
   Login with student_uid + password
   - [ ] Dashboard loads with correct student data
   - [ ] name_bn shown in greeting if lang=BN
   - [ ] Role check: student CANNOT navigate to /admin/*

5. GUARDIAN LOGIN
   Guardian linked to 2 students
   Login with guardian phone + password
   - [ ] Student selector shows both students (switch between them)
   - [ ] Switching student: all data changes to selected student
   - [ ] Guardian CANNOT see other students' data (not linked to them)

6. SESSION PERSISTENCE
   Login → close browser tab → reopen portal
   - [ ] Still logged in (tokens persisted correctly)
   - [ ] After JWT access token expires: auto-refresh happens seamlessly

UI TESTS:

7. BOTTOM NAVIGATION (mobile)
   At 375px:
   - [ ] Bottom nav bar: Home | Results | Attendance | Fees | Notices
   - [ ] Active tab highlighted in blue
   - [ ] Each icon has label text below
   - [ ] Active icon: filled, inactive: outline
   - [ ] Tapping each tab navigates correctly
   - [ ] No overlap between bottom nav and page content (content has bottom padding)

8. DASHBOARD (/portal)
   - [ ] Greeting: "Good morning, [Name in BN/EN based on lang]"
   - [ ] Today's attendance status card: Present (green) / Absent (red) / Not Marked (gray)
   - [ ] "This month: 87%" progress bar visible
   - [ ] Upcoming exam card: shows next exam name + days remaining countdown
   - [ ] Outstanding fee alert: red card if dues > 0
   - [ ] Recent notices: 3 cards visible
   - [ ] All cards tappable (navigate to detail)
   
   At 375px:
   - [ ] Cards stack vertically, full width
   - [ ] No horizontal overflow
   - [ ] Text is readable (14px minimum)

9. ATTENDANCE CALENDAR (/portal/attendance)
   - [ ] Month/year picker works
   - [ ] Calendar grid: 7 columns (days of week), rows = weeks
   - [ ] Color squares: Green/Red/Orange/Blue/Gray
   - [ ] Legend below calendar explains colors
   - [ ] Summary line: "Present: 20 | Absent: 2 | Late: 1 | 87%"
   - [ ] Tap a day square → shows tooltip/popup with: date, status, source (Biometric/Manual)

10. RESULTS PAGE (/portal/results)
    - [ ] Exam list with GPA badges
    - [ ] GPA badge color: green (A+/A), yellow (B/C), red (D/F)
    - [ ] Tap exam → accordion/drawer opens with subject table
    - [ ] Subject table shows: subject name | marks | grade | GPA
    - [ ] "Print Result Card" button → opens PDF in browser
    - [ ] If no results published: "No results available yet" message

11. FEES PAGE (/portal/fees)
    - [ ] Outstanding dues: red card showing total amount
    - [ ] Invoice list: pending invoices first, then paid
    - [ ] "Pay Now" button on pending invoices
    - [ ] Tap "Pay Now" → bottom sheet: bKash | Nagad icons
    - [ ] After payment: invoice shows "Paid" badge in green
    - [ ] "Receipt" link on paid invoices → opens PDF

12. PUSH NOTIFICATIONS
    On first login, browser asks notification permission
    Accept permission
    Admin publishes a new notice → student/guardian receives push notification
    Tap notification → opens portal to /notices ✅

13. LANGUAGE IN PORTAL
    Toggle to BN:
    - [ ] Bottom nav labels in Bangla: "হোম | ফলাফল | উপস্থিতি | ফি | নোটিশ"
    - [ ] Dashboard greeting in Bangla
    - [ ] Date displayed in Bangla format: "১ জুলাই, ২০২৬"
    - [ ] Student name in Bangla (name_bn field)
    - [ ] Number localization: attendance "৮৭%" (optional — using Bangla numerals)

Fix all failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 16 TEST — IoT Biometric Device Service
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 16 Audit

```
Read CLAUDE.md. Run Phase 16 biometric device service audit. Fix all issues.

SERVICE STRUCTURE TESTS:

1. SERVICE BUILDS
   cd services/device && pnpm build
   Expected: no TypeScript compilation errors
   
   cd services/device && pnpm dev
   Expected: ADMS server starts on port 4500, "Device service listening on :4500"

2. ADMS ENDPOINT SIMULATION
   Simulate a ZKTeco device connecting:
   
   GET http://localhost:4500/iclock/cdata?SN=TESTDEVICE001
   Expected: 200 with "GET OPTION FROM: TESTDEVICE001"
   
   POST http://localhost:4500/iclock/cdata?SN=TESTDEVICE001&table=ATTLOG
   Body (raw text): "123\t2026-07-01 08:23:45\t0\t1\t0\t0\n"
   Expected: 200 "OK: 1 logs received"
   Check: DevicePunchLog record created in DB

3. PERSON MAPPING
   Seed student with biometric_id = "123"
   POST punch with device_user_id = "123"
   Expected: DevicePunchLog.mapped_person_id = student.id

4. SHIFT-AWARE MATCHING
   Shift A: 07:30–12:30, Shift B: 12:30–17:30
   Student in Section A (Shift A assignment)
   
   Send punch at 07:45 → Expected: AttendanceRecord with shift=ShiftA, status=PRESENT
   Send punch at 08:30 → Expected: DEDUP (already has record for today+ShiftA), skip
   
   Student in Section B (Shift B)
   Send punch at 07:45 → Expected: AttendanceRecord with shift=ShiftB → status=PRESENT
   (Student came early — matched to their shift not the time window)

5. LATE DETECTION
   AttendanceRules.late_arrival_window_minutes = 15
   Shift starts at 07:30
   
   Punch at 07:44 (within 15 min) → status=PRESENT
   Punch at 07:46 (beyond 15 min) → status=LATE

6. DEDUPLICATION
   Send same punch log twice (same device + sequence_no):
   POST /iclock/cdata with "123\t2026-07-01 08:23:45\t0\t1\t0\t0\n"
   POST same again
   Check: DevicePunchLog count = 1 (not 2)
   Check: AttendanceRecord count = 1 (not 2)

7. OFFLINE RECONCILIATION
   Set device.last_sync_at = 2 days ago
   Run reconciliation job manually
   Expected: pulls logs from 2 days ago, processes any missed punches
   Check: no duplicate AttendanceRecords created

8. UNMAPPED ID ALERT
   Send punch with device_user_id = "999" (no student/staff has biometric_id="999")
   Check: DevicePunchLog created with mapped_person_id = null
   Check: log entry shows "Unmapped biometric ID: 999 from device TESTDEVICE001"

9. SOCKET.IO REAL-TIME EVENT
   Open admin dashboard in browser
   Send a device punch via ADMS endpoint
   Expected: dashboard shows live punch notification within 2 seconds
   (Use browser DevTools → Network → WS to monitor Socket.io frames)

UI TESTS:

10. DEVICE MANAGEMENT PAGE (/settings/devices)
    - [ ] Device list table: name, type, location, status badge, last sync
    - [ ] Online devices: green pulsing dot on status badge
    - [ ] Offline devices: gray static dot
    - [ ] "Test Connection" button → shows result in < 3 seconds
    - [ ] "Sync Now" → progress indicator → shows "Synced X punches"
    - [ ] "View Punch Logs" → paginated table of raw logs
    - [ ] "View Unmapped" → list of device IDs not linked to any person

11. LIVE ATTENDANCE FEED (on /attendance/mark page)
    - [ ] When biometric punch comes in: student row updates automatically
    - [ ] Fingerprint icon appears on punched student's row
    - [ ] No manual page refresh needed

12. REGISTER NEW DEVICE DIALOG
    - [ ] Device type selector: Fingerprint / RFID / GPS
    - [ ] IP address + Port fields
    - [ ] "Test Connection Before Saving" button
    - [ ] If connection fails: clear error message "Cannot reach device at {IP}:{port}"
    - [ ] Cannot save without successful connection test

Fix all failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 17 TEST — Notification Service
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 17 Audit

```
Read CLAUDE.md. Run Phase 17 notification service audit. Fix all issues.

SERVICE TESTS:

1. SERVICE STARTS
   cd services/notification && pnpm dev
   Expected: workers start, connect to Redis, log "SMS worker ready", "Email worker ready"

2. SMS QUEUE TEST (using mock provider)
   Set SMS_PROVIDER=MOCK in services/notification/.env
   
   POST to Core API: mark a student as ABSENT for today
   Check BullMQ dashboard (or bull-board): SMS job should appear in "notification:sms" queue
   
   Wait for worker to process
   Check: NotificationLog record created with trigger=ABSENCE, status=SENT, channel=SMS
   
   Mock provider should log: "MOCK SMS to 01XXXXXXXXX: [Bangla absence message]"

3. SMS TEMPLATE VARIABLE RESOLUTION
   Trigger: ABSENCE
   Expected SMS (from NotificationConfig template):
   "প্রিয় অভিভাবক, আজ [DATE] তারিখে [STUDENT_NAME] উপস্থিত নেই।"
   
   Variables must be resolved:
   {{student_name}} → actual student name
   {{date}} → actual date in Bengali format
   {{school_phone}} → from InstitutionProfile.phone_primary
   
   Check: no {{variable}} placeholders in the sent message (all resolved)

4. SMS RETRY ON FAILURE
   Set SMS gateway to return error (wrong API key)
   Queue a SMS job
   Check: BullMQ retries 3 times (with exponential backoff)
   After 3 failures: job moves to "failed" queue
   Check: NotificationLog status=FAILED with error_message

5. RATE LIMITING (SMS BLAST)
   POST /api/website/notices/{id}/send-sms to send SMS to all 500 students
   Check: SMS gateway called at max N per second (not all 500 simultaneously)
   Check: BullMQ processes jobs in controlled batches

6. EMAIL TEST
   Trigger a fee receipt email:
   POST /api/fees/collect for a student with email
   Check: email job queued in "notification:email"
   Worker processes → email logged in NotificationLog (SENT or if no SMTP: check error is graceful)

7. PUSH NOTIFICATION TEST
   Register a push subscription for a student in the portal
   Admin publishes a notice
   Check: push notification job queued
   Worker sends web push → browser receives notification (if open in background)

8. BD PHONE NORMALIZATION
   Test various phone formats:
   "01711111111" → should send to "8801711111111" (88 country code added)
   "8801711111111" → should NOT double-add country code "888801711111111"
   "+8801711111111" → should normalize to "8801711111111"
   "01711 111 111" → spaces removed → "8801711111111"
   
   Check sslwireless.provider.ts normalizePhone() function handles all cases

9. NOTIFICATION CONFIG UI (/settings/notifications)
    - [ ] All triggers listed (ABSENCE, LATE, FEE_DUE, RESULT_PUBLISHED, NOTICE, ADMISSION_CONFIRM)
    - [ ] SMS / Email toggles per trigger
    - [ ] BN template textarea shows correctly with Bangla text
    - [ ] Variable hints visible: "Available: {{student_name}}, {{date}}, ..."
    - [ ] "Send Test SMS" button → sends to admin's own phone
    - [ ] Test SMS appears in NotificationLog with status

10. NOTIFICATION LOG VIEW (/settings/notifications/logs)
    - [ ] Table: channel badge | trigger | recipient (phone/email) | status badge | time
    - [ ] Status badges: Sent (green) / Failed (red) / Queued (gray) / Skipped (yellow)
    - [ ] Filter by status, channel, date range works
    - [ ] "Retry Failed" button on failed rows → re-queues the job

Fix all failures. Report.
```

---

---

# ════════════════════════════════════════════════
# PHASE 18 TEST — Production Readiness
# ════════════════════════════════════════════════

## Claude Code Prompt — Phase 18 Production Audit

```
Read CLAUDE.md. Run Phase 18 production readiness audit. Fix all issues.

════ DOCKER TESTS ════

1. BUILD ALL IMAGES
   docker compose build
   Expected: all images build without errors
   
   Common issues to check and fix:
   - Puppeteer in Docker: needs chromium-browser + --no-sandbox args
   - node_modules not in image: .dockerignore excludes them (correct)
   - env vars: not hardcoded in Dockerfile, passed via docker-compose.yml

2. COMPOSE UP
   docker compose up -d
   Expected: all services start
   
   Check health: docker compose ps
   All services should show "Up" status (not "Exit 1")
   
   If any service fails: docker compose logs {service_name} → check error

3. INTER-SERVICE COMMUNICATION
   Inside Docker network:
   - API can reach PostgreSQL → check via health endpoint
   - API can reach Redis → check queue processing
   - Website can reach API → check /api/content/institution call
   - Notification service can reach Redis → check worker startup log

4. PUPPETEER IN DOCKER
   Generate any PDF while running in Docker:
   curl http://localhost:4000/api/documents/student/{id}/id-card -H "Authorization: Bearer {token}"
   Expected: PDF returns (not 500 error)
   
   Common fix: Dockerfile for API must include:
   RUN apt-get update && apt-get install -y chromium-browser
   ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
   ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

5. ENVIRONMENT VARIABLES
   All services must start with proper env vars
   Create production .env from .env.example
   Verify no placeholder values remain ("your-secret-here", "xxx")

════ DATABASE TESTS ════

6. MIGRATION IN PRODUCTION MODE
   docker exec api sh -c "npx prisma migrate deploy"
   Expected: migration runs without errors
   NOT: prisma migrate dev (never in production)

7. CONNECTION POOL
   Check server/api/src/app.ts or packages/db/src/client.ts:
   PrismaClient should be singleton (not created per-request)
   Correct pattern:
   let prisma: PrismaClient
   if (process.env.NODE_ENV === 'production') {
     prisma = new PrismaClient()
   } else {
     if (!global.prisma) global.prisma = new PrismaClient()
     prisma = global.prisma
   }

8. DATABASE BACKUP CHECK
   Add to README.md:
   pg_dump education_erp > backup_$(date +%Y%m%d).sql
   Verify this command documented

════ PERFORMANCE TESTS ════

9. API RESPONSE TIMES (target benchmarks)
   Use: curl -w "%{time_total}" http://localhost:4000/api/...
   
   GET /api/analytics/overview → target < 500ms (add Redis cache if slower)
   GET /api/students → target < 300ms (paginated 20 records)
   GET /api/students/{id} → target < 800ms (360° profile with joins)
   POST /api/attendance/mark (50 records) → target < 1000ms
   GET /api/results/public/lookup → target < 200ms (add Redis cache)
   PDF generation (single marksheet) → target < 3000ms

   If any endpoint exceeds target:
   - Add Redis caching for read endpoints
   - Add missing DB indexes
   - Use Promise.all for parallel queries
   - Add select to Prisma queries (avoid fetching unnecessary fields)

10. FRONTEND BUILD SIZE
    pnpm --filter=admin build 2>&1 | grep "First Load JS"
    Target: First Load JS < 300kb for any page
    
    If over budget:
    - Check for large libraries imported directly (import * from 'lodash')
    - Use dynamic imports for heavy components (charts, PDF viewer)
    - Check for duplicate dependency versions (pnpm dedupe)

11. IMAGE OPTIMIZATION
    All images on apps/website must use next/image:
    grep -r "<img " apps/website/app/ → should be 0 results (all converted to <Image>)
    
    Institution logo: next/image with width/height
    Gallery images: next/image with sizes prop
    Student photos (portal): next/image

12. LIGHTHOUSE SCORES
    Open Chrome → Lighthouse → Run on apps/website homepage
    Target scores:
    Performance: > 85
    Accessibility: > 90
    Best Practices: > 90
    SEO: > 95
    
    Common fixes for low scores:
    Performance: add loading="lazy" to below-fold images, preload fonts
    Accessibility: all images have alt text, all form inputs have labels
    SEO: all pages have title + description meta

════ ERROR HANDLING TESTS ════

13. 404 PAGES
    Browse to http://localhost:3000/nonexistent-page (admin)
    - [ ] Shows custom 404 page (not Next.js default)
    - [ ] Has "Go to Dashboard" link
    - [ ] Shows institution logo
    
    http://localhost:3002/nonexistent-page (website)
    - [ ] Shows branded 404 page
    - [ ] Has "Go to Homepage" link

14. API ERROR RESPONSES
    Send invalid request to any endpoint:
    Expected response format:
    { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
    NOT: Express default error page (HTML)
    NOT: Stack trace in response body (production mode)

15. NETWORK ERROR IN FRONTEND
    Stop the API server
    Load admin panel → navigate to /students
    Expected: "Unable to load data. Check your connection." error state
    NOT: blank page, NOT: spinner that spins forever

16. LARGE FILE GRACEFUL REJECTION
    Upload a 50MB file to any upload endpoint
    Expected: 413 Payload Too Large with clear message
    NOT: server crash or timeout

════ README & DOCUMENTATION ════

17. README COMPLETENESS
    cat README.md | wc -l → should be >= 150 lines
    
    Check sections exist:
    - [ ] Overview with feature list
    - [ ] Tech stack table
    - [ ] Quick Start (step by step: clone → env → docker → seed → access)
    - [ ] Default credentials table
    - [ ] Environment variables reference
    - [ ] Development guide per app
    - [ ] Deployment checklist
    - [ ] Module status table (all 18 phases)

18. FINAL SANITY: ALL URLS ACCESSIBLE
    Run this URL check:
    
    urls=(
      "http://localhost:3000/login"
      "http://localhost:3000/dashboard"
      "http://localhost:3000/settings/institution"
      "http://localhost:3000/settings/student-id"
      "http://localhost:3000/settings/grading"
      "http://localhost:3000/students"
      "http://localhost:3000/attendance/mark"
      "http://localhost:3000/examination"
      "http://localhost:3000/marks"
      "http://localhost:3000/results"
      "http://localhost:3000/fees"
      "http://localhost:3000/admission"
      "http://localhost:3000/documents/print"
      "http://localhost:3000/website/notices"
      "http://localhost:3000/hr/staff"
      "http://localhost:3000/library"
      "http://localhost:3000/transport"
      "http://localhost:3000/hostel"
      "http://localhost:3000/reports"
      "http://localhost:3001"
      "http://localhost:3002"
      "http://localhost:3002/notices"
      "http://localhost:3002/result"
      "http://localhost:3002/admission"
      "http://localhost:3002/sitemap.xml"
      "http://localhost:3002/robots.txt"
      "http://localhost:4000/api/health"
    )
    
    for url in "${urls[@]}"; do
      status=$(curl -o /dev/null -s -w "%{http_code}" "$url")
      if [ "$status" != "200" ] && [ "$status" != "302" ]; then
        echo "❌ FAIL ($status): $url"
      else
        echo "✅ OK ($status): $url"
      fi
    done

Fix every ❌. Report final results.
```

---

---

# ════════════════════════════════════════════════
# PERFORMANCE DEEP AUDIT
# ════════════════════════════════════════════════

## Claude Code Prompt — Performance Optimization

```
Read CLAUDE.md. Run performance optimization audit. Fix all issues.

════ DATABASE QUERY OPTIMIZATION ════

1. N+1 QUERY DETECTION
   Install prisma-query-logger or enable Prisma logging:
   Add to PrismaClient init:
   log: ['query', 'warn', 'error']
   
   Then load /students (20 records) and count DB queries logged
   If query count > 5 for a 20-record list: N+1 problem
   Fix: use Prisma include to eager-load relations

   Common N+1 locations to check and fix:
   - Student list: should load guardian in one JOIN (include: { guardian: true })
   - Attendance mark page: should load class+section in one query
   - Results page: should not query grade for each subject separately (use include)

2. MISSING INDEXES AUDIT
   Run: pnpm --filter=db prisma db pull (to get current schema)
   
   Then check these commonly slow queries and ensure indexes exist:
   
   attendance search by date + section:
   → @@index([section_id, date]) should exist on AttendanceRecord ✅
   
   student search by class:
   → @@index([current_class_id]) on Student ✅
   
   invoices by student + status:
   → @@index([student_id, status]) on Invoice ✅
   
   marks by exam + class:
   → @@index([exam_id]) on MarkEntry ✅
   
   Add any missing indexes, then run prisma migrate dev.

3. REDIS CACHING IMPLEMENTATION
   Implement caching for these endpoints if not already done:
   
   Cache key pattern: "cache:{endpoint}:{params_hash}"
   TTL rules:
   
   /api/settings/institution → TTL: 3600s (1hr) — changes rarely
   /api/settings/config      → TTL: 3600s
   /api/analytics/overview   → TTL: 300s (5min) — refreshed often
   /api/content/sliders      → TTL: 600s — clear on slider publish
   /api/content/notices      → TTL: 300s — clear on notice publish
   /api/results/public/lookup → TTL: 1800s (30min) — clear on result publish
   /api/subjects?class_id=X  → TTL: 3600s — clear on subject create/update
   
   Cache invalidation pattern:
   After PUT /api/settings/institution: await redis.del("cache:settings:institution")
   After POST /api/website/notices/:id/publish: await redis.del("cache:content:notices*")

4. PARALLEL QUERY OPTIMIZATION
   Check server/api/src/modules/reports/analytics.service.ts:
   
   BAD pattern (sequential, slow):
   const students = await prisma.student.count(...)
   const present = await prisma.attendanceRecord.count(...)
   const fees = await prisma.invoice.sum(...)
   
   GOOD pattern (parallel, fast):
   const [students, present, fees] = await Promise.all([
     prisma.student.count(...),
     prisma.attendanceRecord.count(...),
     prisma.invoice.aggregate(...)
   ])
   
   Fix all sequential awaits in analytics/overview to use Promise.all

5. PDF GENERATION QUEUE
   For bulk PDF requests (> 10 documents):
   Instead of generating synchronously (blocks request for 30+ seconds):
   1. Create a BullMQ job: await pdfQueue.add('bulk-pdf', { doc_type, filters })
   2. Return immediately: { job_id: "abc123", status: "processing", estimated_time: "30s" }
   3. Frontend polls: GET /api/jobs/abc123/status → { status: "complete", download_url: "..." }
   
   Implement: server/api/src/jobs/pdf.job.ts
   Implement: GET /api/jobs/:job_id route

6. NEXT.JS BUILD OPTIMIZATION
   Check apps/admin/next.config.ts:
   - [ ] Images: { domains: ['{azure-blob-url}'] } configured
   - [ ] experimental.optimizeCss: true (if supported)
   
   Check for large client-side bundles:
   pnpm --filter=admin build
   Look for pages > 100kb First Load JS → investigate and split with dynamic imports
   
   Dynamic import example for heavy components:
   const ResultsChart = dynamic(() => import('@/components/ResultsChart'), { ssr: false })

════ FRONTEND PERFORMANCE ════

7. LAZY LOADING IMAGES
   All images below the fold must have loading="lazy":
   
   For next/image: add priority={false} (default, lazy)
   For above-the-fold images (slider first image, logo): add priority={true}
   
   Check apps/website: every <Image> below hero should have loading="lazy" or no priority prop

8. FONT LOADING OPTIMIZATION
   apps/website/app/layout.tsx must have:
   
   import { Inter, Noto_Sans_Bengali, Playfair_Display } from 'next/font/google'
   
   const inter = Inter({ subsets: ['latin'], display: 'swap' })
   const notoBengali = Noto_Sans_Bengali({ subsets: ['bengali'], display: 'swap' })
   const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap' })
   
   display: 'swap' prevents invisible text during font load
   
   Also add to <head>:
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

9. API RESPONSE COMPRESSION
   Check server/api/src/app.ts:
   import compression from 'compression'
   app.use(compression())
   
   If missing: pnpm --filter=api add compression && add to app.ts

10. WEBSOCKET CONNECTION MANAGEMENT
    Socket.io should NOT create a new connection for each page navigation
    Check: Socket.io client initialized ONCE in a global singleton:
    
    lib/socket.ts:
    let socket: Socket | null = null
    export const getSocket = () => {
      if (!socket) socket = io(API_URL, { transports: ['websocket', 'polling'] })
      return socket
    }
    
    NOT: io(API_URL) called in each component's useEffect

Report all optimizations applied with before/after response time measurements where possible.
```

---

---

# ════════════════════════════════════════════════
# 🚀 MASTER: ONE-COMMAND FULL AUDIT
# ════════════════════════════════════════════════

## Use This After ALL Phases Complete

```
Read CLAUDE.md completely. Then run this comprehensive final audit.
Do NOT skip any step. Fix every issue found before marking done.

This is the FINAL quality gate before the system goes to a client.

════ STEP 1: STRUCTURE VERIFICATION ════
Run: ls -la apps/ packages/ server/ services/
Run: pnpm --filter=db prisma validate
Run: pnpm build (all apps must build without errors)
Run: pnpm test (all unit tests must pass)

════ STEP 2: SECURITY QUICK SCAN ════
grep -r "password\b" server/api/src/modules/ | grep "select\|return\|res.json" 
→ MUST return 0 results (no password fields in responses)

grep -rn "origin: '\*'" server/api/src/
→ MUST return 0 results (no wildcard CORS)

grep -rn "JWT_SECRET\s*=\s*['\"][^'\"]\{1,20\}['\"]" server/api/src/
→ MUST return 0 results (no short secrets)

grep -rn "console.log" server/api/src/modules/
→ Should return 0 results (use logger, not console.log)

════ STEP 3: THEME VERIFICATION ════
grep -rn "dark:" apps/admin/app/ | grep -v "\/\/" | wc -l
→ Count dark: classes. If any cause visual issues in light mode: remove them

grep -rn "text-gray-[234]\|text-slate-[234]" apps/admin/app/ | wc -l
→ Each result: verify text is readable (not near-invisible)

grep -rn "bg-gray-[789]\|bg-slate-[789]\|bg-zinc-[789]" apps/admin/app/
→ Verify none are causing near-black backgrounds in light mode

grep -rn "<img " apps/website/app/ | grep -v "\/\/"
→ MUST return 0 (all images use next/image)

════ STEP 4: SEO VERIFICATION ════
find apps/website/app -name "page.tsx" | while read f; do
  if ! grep -q "generateMetadata\|metadata" "$f"; then
    echo "MISSING METADATA: $f"
  fi
done
→ Every page.tsx must have metadata

curl -I http://localhost:3002/sitemap.xml → must return 200
curl -I http://localhost:3002/robots.txt → must return 200

════ STEP 5: SLUG VERIFICATION ════
grep -rn "params\.id\b" apps/website/app/ | grep -v "\/\/"
→ Count results. Each should be slug-based, not DB id. Fix any that use raw DB IDs as URLs.

════ STEP 6: BANGLA RENDERING ════
Generate a marksheet PDF: GET /api/documents/result/{exam_id}/marksheet/{student_id}
Open the PDF and manually verify:
- Student name in Bangla renders as actual letters (not boxes)
- Subject names in Bangla render correctly
- Institution name in Bangla renders correctly
→ If boxes appear: fix Noto Sans Bengali font loading in Puppeteer template

Open apps/website in browser with Bangla content visible
→ Verify Bangla text renders in browser (not boxes)
→ DevTools → Network → filter "font" → NotoSansBengali must show as "200 OK"

════ STEP 7: RESPONSIVE VERIFICATION ════
Open Chrome DevTools → toggle device toolbar → test at 375px:

Admin (/students):
→ No horizontal page scroll
→ Table scrolls within its container
→ Sidebar collapsed/hidden

Website (homepage):
→ Slider takes full width
→ No text overflowing card edges
→ Hamburger menu visible

Portal (/):
→ Bottom navigation visible
→ Cards full width
→ No text cut off

════ STEP 8: CRITICAL USER FLOWS ════
Manually test these 5 flows end-to-end:

FLOW 1 — New Student Enrollment
  Settings → set student ID format → Create student → verify UID format → 
  check subjects auto-assigned → check portal login works

FLOW 2 — Result Publication  
  Create exam → enter marks → approve → publish → 
  check student portal shows result → check public website result lookup works

FLOW 3 — Fee Collection
  Create fee structure → generate invoices → collect payment → 
  check receipt PDF → check student portal shows paid status

FLOW 4 — Notice to Website
  Admin creates notice → publishes → website shows notice in < 5 seconds →
  notice URL is slug-based → SEO metadata present on notice page

FLOW 5 — Attendance + SMS
  Mark 1 student absent → check SMS queued → 
  check student portal shows absent for today → check defaulter report includes student

════ STEP 9: GENERATE FINAL REPORT ════
Create a file: AUDIT_REPORT.md at project root with:
- Date of audit
- Total issues found
- Issues fixed
- Issues remaining (if any)
- Performance benchmarks (API response times)
- Security status: PASS / FAIL with details
- Theme compliance: PASS / FAIL
- SEO compliance: PASS / FAIL
- Responsive compliance: PASS / FAIL
- Bangla rendering: PASS / FAIL
- Overall status: PRODUCTION READY / NOT READY (with reasons)

════ DONE ════
If all steps pass: system is PRODUCTION READY.
If any step fails: fix it, then re-run that step only.
```

---

---

# ════════════════════════════════════════════════
# 🐛 BUG REPORT TEMPLATE
# ════════════════════════════════════════════════

When you find a bug during testing, use this template in Claude Code:

```
I found a bug. Fix it completely.

BUG REPORT:
  Page/Endpoint: [e.g. /students or GET /api/students/:id]
  Description: [what is wrong]
  Expected: [what should happen]
  Actual: [what is happening]
  Steps to reproduce:
    1. [step 1]
    2. [step 2]
  Error message (if any): [paste error]
  Screenshot description: [describe what you see]

After fixing:
  1. Explain what caused the bug
  2. Show the fix applied
  3. Confirm no other places have the same bug (grep for similar patterns)
  4. Add a test case that would have caught this bug
```

---

---

# ════════════════════════════════════════════════
# ✅ COMPLETE TEST STATUS TRACKER
# ════════════════════════════════════════════════

Copy this into your project and check off as you complete each:

```
PHASE TESTS:
[ ] Phase 0  — Schema + seed: all 40+ models, migration runs, seed completes
[ ] Phase 1  — Settings: student ID preview live, grading editor validates, type switching works
[ ] Phase 2  — Auth: rate limiting, JWT security, role isolation, forgot password flow
[ ] Phase 3  — Students: UID format, 360° profile, subject inheritance, responsive list
[ ] Phase 4  — Subjects: code uniqueness, teacher assignment, inheritance on class change
[ ] Phase 5  — Attendance: mark save, dedup, conflict detection, PDF+Excel export
[ ] Phase 6  — Exams: all grading unit tests PASS, mark entry scope enforced
[ ] Phase 7  — Results: public lookup works, Bangla in PDF, tabulation sheet generates
[ ] Phase 8  — Fees: late fee calculation, payment webhook verified, partial payment
[ ] Phase 9  — Admission: form validation, auto-enroll, slug URLs, mobile form works
[ ] Phase 10 — Documents: all 12 templates generate, Bangla renders, signatures overlay
[ ] Phase 11 — Website: ISR works, all SEO checks pass, bilingual, light theme, slugs
[ ] Phase 12 — HR: payroll calculation accurate, payslip PDF, leave → attendance link
[ ] Phase 13 — Library: issue/return/fine, transport assignment, hostel grid
[ ] Phase 14 — Analytics: charts render, role-specific views, < 3s load time
[ ] Phase 15 — Portal: PWA installable, offline works, all 5 tabs functional
[ ] Phase 16 — IoT: ADMS endpoint responds, punch processed, shift-aware, dedup
[ ] Phase 17 — Notifications: SMS queued, templates resolved, Bangla SMS correct
[ ] Phase 18 — Production: Docker builds, all URLs 200, Lighthouse > 85

QUALITY GATES:
[ ] SECURITY: no passwords in responses, CORS locked, rate limiting active
[ ] THEME: light mode only, blue+white, all text contrast passes WCAG AA
[ ] RESPONSIVE: no horizontal scroll at 375px/768px/1280px
[ ] BANGLA: renders correctly in browser AND in PDFs
[ ] SEO: slug URLs, generateMetadata on all pages, sitemap.xml, robots.txt
[ ] BILINGUAL: EN/BN toggle works, content switches, dates localized
[ ] PERFORMANCE: API responses < 500ms, Lighthouse > 85, no N+1 queries
[ ] ERRORS: custom 404 pages, API errors formatted, graceful network failures
[ ] AUDIT LOG: sensitive actions logged (logins, result publish, fee waiver)
[ ] DOCKER: all services start with docker compose up, PDFs work in container

FINAL SIGN-OFF:
[ ] End-to-end integration test passed (all 10 steps in FINAL INTEGRATION section)
[ ] AUDIT_REPORT.md generated and shows PRODUCTION READY
[ ] All team members tested with their own role credentials
[ ] Client demo environment set up and working
```

---

*AshDevs · Education ERP · Testing Playbook Part 2 · July 2026*
