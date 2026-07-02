# 📋 Phase Prompts — Part 2 (Phases 9–18)
# Education ERP — Complete Build Guide Continued

> Read CLAUDE.md + PHASE_PROMPTS.md before using this file.
> Phases 0–8 are in PHASE_PROMPTS.md

---

---

# ═══════════════════════════════════════════════
# PHASE 9 — Online Admission Module
# ═══════════════════════════════════════════════

```
Read CLAUDE.md fully. Check what exists. Tell me the status. Then proceed.

PHASE 9 GOAL: Complete online admission system — cycle management, 
dynamic application form, applicant processing, admit card, 
registration card, and auto-enrollment into SIS.

────────────────────────────────────────────────
STEP 9A — Admission API
server/api/src/modules/admission/
────────────────────────────────────────────────

--- Admission Cycle Management ---

POST /api/admission/cycles
  Body: {
    class_id, academic_year_id, name,
    open_date, close_date,
    seat_count, app_fee,
    general_seats, freedom_fighter_seats, disabled_seats,
    form_config: {} (field definitions — see below)
  }

GET  /api/admission/cycles
  Returns: all cycles with stats:
    { total_applications, shortlisted, confirmed, enrolled, seats_remaining }

GET  /api/admission/cycles/:id
  Returns: cycle detail + form_config

PUT  /api/admission/cycles/:id
  Can update: name, dates, seat_count, app_fee, form_config
  Cannot update: class_id, academic_year_id if applications exist

PUT  /api/admission/cycles/:id/toggle
  Body: { is_open: boolean, is_published: boolean }
  is_open=true → admission form live on website
  is_published=true → admission info page visible on website

--- Form Configuration ---
The form_config JSON stored per cycle defines dynamic form fields.
Structure:
{
  "fields": [
    {
      "key": "student_name_en",
      "label_en": "Full Name (English)",
      "label_bn": "পূর্ণ নাম (ইংরেজিতে)",
      "type": "text",         // text | number | date | select | file | textarea | checkbox
      "required": true,
      "is_default": true,     // default fields cannot be removed
      "display_order": 1,
      "options": []           // for select type
    }
  ],
  "subject_config": {
    "show_compulsory": true,
    "show_optional": true,
    "allow_selection": true
  },
  "document_uploads": [
    { "key": "birth_certificate", "label_en": "Birth Certificate", "required": true },
    { "key": "previous_marksheet", "label_en": "Previous Exam Marksheet", "required": true },
    { "key": "photo", "label_en": "Passport Photo", "required": true }
  ]
}

GET /api/admission/cycles/:id/form-config
PUT /api/admission/cycles/:id/form-config
  Body: { fields: [...], subject_config: {...}, document_uploads: [...] }
  Validate: cannot remove is_default fields

GET /api/admission/cycles/:id/subjects
  Returns: class subjects split into { compulsory: [], optional: [] }

--- Application Submission (PUBLIC — no auth) ---

GET /api/admission/public/cycles
  Query: is_published=true
  Returns: active published cycles with class name, dates, seat info

GET /api/admission/public/cycles/:id
  Returns: cycle info + form_config for rendering the public form

POST /api/admission/apply
  Body: {
    cycle_id,
    personal_info: { ...dynamic fields from form_config },
    guardian_info: { father_name, father_phone, mother_name, ... },
    previous_result: { institution, exam_name, roll, result, year },
    selected_subjects: [subject_id, ...],
    documents: { birth_certificate: "url", photo: "url", ... }
  }
  Logic:
    1. Validate cycle is_open=true and not past close_date
    2. Validate seat_count > current confirmed applications
    3. Validate all required fields from form_config
    4. Upload documents to Azure Blob (if provided as base64 or multipart)
    5. Calculate merit_score from previous_result (configurable scoring formula)
    6. Create AdmissionApplication record, status=PENDING
    7. Generate unique admission_roll: {cycle_prefix}-{year}-{sequential}
    8. Queue confirmation SMS to applicant guardian phone
    9. Return: { application_id, admission_roll, message }

POST /api/admission/payment/initiate
  Body: { application_id }
  Initiate payment for app_fee via bKash/Nagad/SSLCommerz
  Return: { payment_url }

POST /api/admission/payment/callback/:gateway
  Verify payment → update application payment status

GET /api/admission/application/status (PUBLIC)
  Query: application_id + phone (for verification)
  Returns: { admission_roll, applicant_name, status, merit_rank (if shortlisted) }

--- Application Processing (Admin) ---

GET /api/admission/applications
  Query: cycle_id, status, search, page, limit
  Returns: paginated list with all applicant details

GET /api/admission/applications/:id
  Returns: full application detail including all form data, documents, payment status

PUT /api/admission/applications/:id/status
  Body: { status: "SHORTLISTED" | "WAITLISTED" | "REJECTED", notes? }
  Authorized: ADMIN, PRINCIPAL, EXAM_CONTROLLER

POST /api/admission/applications/bulk-action
  Body: { application_ids: [], action: "SHORTLIST" | "REJECT" }

POST /api/admission/cycles/:id/merit-list
  Logic:
    Rank all PENDING/SHORTLISTED applications by merit_score DESC
    Assign merit_rank to each
    Auto-shortlist top N (N = seat_count)
    Put rest on WAITLISTED
  Returns: { shortlisted: N, waitlisted: N, rejected: N }

POST /api/admission/cycles/:id/merit-list/publish
  Makes merit list public on website
  Body: { is_published: boolean }

POST /api/admission/applications/:id/confirm
  Called after seat confirmation fee payment
  Update status=CONFIRMED
  Queue confirmation SMS

POST /api/admission/applications/:id/enroll
  Authorized: ADMIN, PRINCIPAL only
  Logic:
    1. Read application personal_info, guardian_info, selected_subjects
    2. Create Guardian record (if not exists, match by phone)
    3. Generate student_uid using StudentIdConfig
    4. Create User record (phone as login, temp password)
    5. Create Student record, status=ACTIVE, current_class=cycle.class
    6. Assign to selected section (admin can choose)
    7. Run subject inheritance for the class (compulsory) + add selected optional subjects
    8. Create fee invoices for the academic year
    9. Update application: status=ENROLLED, enrolled_student_id=student.id
    10. Send welcome SMS: student_uid + portal login credentials
  Returns: { student_id, student_uid, message }

--- Document Generation for Admission ---

GET /api/admission/applications/:id/admit-card
  Render Admit Card PDF using DocumentTemplate for ADMIT_CARD type
  Include: applicant name, photo, admission_roll, class, exam dates (if applicable),
           institution logo, EIIN, authority signatures per AuthorityConfig
  Returns: PDF buffer

GET /api/admission/applications/:id/reg-card  
  Only for ENROLLED applicants
  Render Registration Card PDF
  Include: student name, photo, registration_no, class, subject list with codes,
           academic year, institution branding, signatures

GET /api/admission/cycles/:id/admit-cards/bulk
  Query: status=SHORTLISTED (or CONFIRMED or ALL)
  Generate all admit cards in one PDF (each card on a new page, or 2 per A4 page)

GET /api/admission/cycles/:id/merit-list/pdf
  Printable merit list PDF: rank, name, admission roll, previous result, status

────────────────────────────────────────────────
STEP 9B — Admission Admin UI
────────────────────────────────────────────────

─── PAGE: /admission ───

Dashboard cards (per open cycle):
  Card per cycle: Class name | Open/Closed badge | Applications: 234 | Shortlisted: 45 | Confirmed: 30 | Seats: 50 (30 remaining)
  "View Cycle" and "New Cycle" buttons

─── PAGE: /admission/cycles/new ───

Multi-step form:

Step 1 — Basic Setup
  Name (e.g. "HSC 2026–27 Admission")
  Select Class → Academic Year
  Open Date + Close Date (date range picker)
  Total Seats | General | Freedom Fighter | Disabled quota inputs
  Application Fee (0 = free)

Step 2 — Form Builder
  Two-panel layout:
    LEFT: "Available Fields" draggable list
    RIGHT: "Form Fields" drop target (reorderable)
  
  Default fields shown locked (cannot remove): Student Name, Father Name, Mother Name, Phone, DOB, etc.
  
  Custom fields panel: "Add Field" → dialog:
    Label (EN + BN), Field Type selector, Required toggle, Options (for select type)
  
  Subject Configuration section:
    Toggle "Show Subject Selection"
    Preview: shows compulsory subjects (locked) + optional subjects (selectable)
  
  Document Uploads section:
    Add required document types: name + required toggle

Step 3 — Review & Launch
  Preview of the public form
  "Open Admission" toggle
  "Publish to Website" toggle
  "Create Cycle" button

─── PAGE: /admission/cycles/:id ───

HEADER: Cycle name | Status badges | Date range | Seats info | Edit button

TABS:

TAB — Applications
  Stats bar: Total | Pending | Shortlisted | Waitlisted | Confirmed | Enrolled

  Filter: Status | Search (name, admission roll, phone) | Merit rank range

  Table columns:
    Admission Roll | Photo | Name | Guardian Phone | Previous Result | Merit Score | Merit Rank | Status | Payment | Actions

  Bulk action bar: Shortlist Selected | Reject Selected | Export Excel

  Per row actions: View Detail | Shortlist | Reject | Enroll | Print Admit Card

  "Generate Merit List" button → confirmation dialog showing algorithm:
    "Will rank by previous result. Top 50 → Shortlisted. Rest → Waitlisted. Confirm?"

TAB — Form Config
  Live form builder (same as Step 2 above, editable after creation)

TAB — Merit List
  Ranked table of shortlisted applicants
  "Publish Merit List to Website" toggle
  Download PDF button

TAB — Bulk Actions
  "Generate All Admit Cards" → downloads ZIP or single merged PDF
  "Send SMS to All Shortlisted" → confirm → queue SMS blast
  "Bulk Enroll Confirmed" → enroll all CONFIRMED applicants → shows progress

─── PAGE: /admission/applications/:id ───

Full applicant detail:
  Header: Name, Admission Roll, Status badge, Merit Rank badge
  
  Sections:
    Personal Info (from dynamic form fields)
    Guardian Info
    Previous Result
    Selected Subjects (badges)
    Uploaded Documents (thumbnail previews, click to view full)
    Payment Status card
    Timeline: Applied → Shortlisted → Confirmed → Enrolled (with dates)
  
  Action buttons:
    Shortlist / Reject / Confirm / Enroll
    Print Admit Card | Print Registration Card

─── PUBLIC ADMISSION FORM (apps/website /admission/:cycle_id) ───

Multi-step public form (Mobile-first design):

Step 1 — Personal Information (dynamic from form_config)
  Show fields in order defined in form_config
  Photo upload: capture from camera (mobile) or file upload
  
Step 2 — Guardian Information
  
Step 3 — Previous Academic Record
  Institution name, exam name, roll, year, result/GPA

Step 4 — Subject Selection
  Compulsory subjects: shown as locked checkboxes (greyed out, pre-selected)
  Optional subjects: checkboxes with subject details (code, type, marks)
  "Your selected subjects: [list]" summary

Step 5 — Document Upload
  Required documents list with upload buttons
  Show upload progress and success state
  
Step 6 — Review & Pay
  Summary of all entered information
  "Edit" link per section
  Application fee payment initiation (bKash/Nagad/SSLCommerz buttons)
  Terms & conditions checkbox
  "Submit Application" button

Confirmation page:
  Large success icon
  Application ID: {id}
  Admission Roll: {roll}
  "Save/Screenshot this for tracking your application status"
  WhatsApp share button
  Status tracking link

Status Check page (/admission/status):
  Input: Application ID + Phone
  Show: Current status, merit rank (if published), next steps
```

---

---

# ═══════════════════════════════════════════════
# PHASE 10 — Document Generation System
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 10 GOAL: Complete document generation for ALL document types —
PDF service, default templates, bulk print API, and admin print panel.

────────────────────────────────────────────────
STEP 10A — PDF Service + Default Templates
────────────────────────────────────────────────

Create: server/api/src/services/pdf.service.ts

Core render function:
  async function renderDocument(
    docType: DocumentType,
    data: Record<string, any>,
    options?: { pageSize?: 'A4'|'A5'|'ID_CARD', orientation?: 'portrait'|'landscape' }
  ): Promise<Buffer>

  Internal steps:
    1. Load InstitutionProfile (logo, name, EIIN, colors)
    2. Load active DocumentTemplate for docType → get html_content
    3. Load AuthorityConfig for docType → get which roles are needed
    4. Load AuthoritySignature for each required role
    5. Load institution settings (grading labels etc.)
    6. Compile Handlebars template with merged data
    7. Inject CSS: institution primary_color variable
    8. Launch Puppeteer → render → return PDF Buffer

Handlebars helpers to register:
  {{banglaDate date}}        → format date as DD/MM/YYYY
  {{gradeColor grade}}       → color for grade (green/red/yellow)
  {{ifPassed marks passMark}} → conditional
  {{formatMarks marks}}      → show "--" if absent
  {{institutionLogo}}        → img tag with logo_url
  {{signatureBlock role slot}} → authority name + designation + signature image + line

Create default HTML templates in:
server/api/src/templates/defaults/

--- Template: student-id-card.html ---
ID card: 85.6mm × 54mm (standard credit card size, rendered at 300dpi)
FRONT:
  Top band: institution primary_color background, logo + institution name in white
  Body:
    - Student photo (left, 25×32mm, rounded border)
    - Right of photo: Student Name (bold), Student ID (red badge), Class & Section
    - Below: Roll No | Blood Group | Academic Year
  Bottom band: thin colored strip
BACK:
  Top: Institution name + address in small text
  Middle: 
    - "If found, please return to:" instruction text
    - Campus phone number
    - QR code (link to institution website) — use qr-code npm package to generate inline SVG
  Bottom: Principal signature line + "Principal" label

--- Template: staff-id-card.html ---
Same size as student ID card.
FRONT: Logo, staff photo, name, staff ID (different color badge), designation, department
BACK: Same as student back but with "Staff Member" label + HR contact number

--- Template: admit-card.html ---
A4 portrait (or A5 for 2-up printing)
Header: Institution logo (left) | Institution name, address, EIIN (center) | "ADMIT CARD" (right)
Horizontal divider line (institution primary_color)
Student info table (2 columns): 
  Name | Exam Name | Father's Name | Academic Year
  Roll No | Registration No | Class | Section
  Student Photo (top right, passport size)
Exam Schedule table:
  Date | Day | Subject | Time | Hall | Seat No
Instructions box: configurable text from template (exam rules)
Bottom: 
  Left: Student signature box ("Signature of Candidate")
  Center: Exam Controller signature + stamp
  Right: Principal signature + stamp
Dotted cut line if 2-per-page

--- Template: marksheet.html ---
A4 portrait
Header: Institution logo (left) | Institution name, EIIN, address (center) | Exam type + academic year (right)
Student info block (2 columns):
  Name (EN + BN) | Roll No
  Father's Name | Registration No
  Mother's Name | Board Roll
  Student photo (top right)
Results table:
  Subject Name (EN) | Subject Code | Full Marks | Theory | Practical | Total | Grade | GPA
  Colored rows alternating light/white
  Bold last row: Total / GPA / Grade / Position
Attendance summary box (optional, configurable)
Footer:
  3 signature boxes: Class Teacher | Exam Controller | Principal
  Each box: signature image + name + designation + date line
  Institution seal (if uploaded)
Promotional text: "Promoted to Class X" or "Result: FAILED" (based on result)

--- Template: report-card.html ---
Similar to marksheet but adds:
  Attendance summary (Total days, Present, Absent, %)
  Teacher remarks column per subject
  Conduct grade
  Co-curricular activities
  Overall remarks by class teacher
  "This is a computer-generated document" note at bottom

--- Template: tabulation-sheet.html ---
A3 landscape (or A4 landscape for smaller classes)
Header: Institution name + exam name + class + section + academic year
Table: 
  Columns: SL | Roll | Name | [Subject columns...] | Total | GPA | Grade | Position
  Subject columns: 2 sub-columns Theory + Practical (if applicable)
  Alternating row colors for readability
  Pass cells: white, Fail cells: light red background
Footer: Exam Controller signature + Principal signature
"Total Appeared | Total Passed | Pass Rate: XX%" summary row

--- Template: testimonial.html ---
A4 portrait, formal letterhead style
Letterhead: Logo + institution name + address + phone + email + EIIN
Body text (Handlebars with variables):
  "This is to certify that {{student_name_en}} son/daughter of {{father_name}},
   Roll No: {{roll_no}}, Registration No: {{registration_no}},
   was a student of this institution from {{admission_date}} to {{leaving_date}}.
   He/She has appeared in {{exam_name}} Examination in {{year}} from this institution.
   He/She bears good character and conduct.
   We wish him/her success in future."
Date + Institution Seal on left
Principal signature block on right

--- Template: transfer-certificate.html ---
A4 portrait, formal TC format (matches BD Education Board standard)
Numbered fields (BD TC format):
  1. Name of the institution
  2. Name of Student (in full)
  3. Name of Father / Guardian
  4. Name of Mother
  5. Date of Birth
  6. Nationality
  7. Religion
  8. Last Class Studied
  9. Board/University Registration No
  10. Result of Last Examination
  11. Date of Admission to this institution
  12. Date of leaving the institution
  13. Reason for leaving (From the TC config)
  14. Character and conduct
  15. Remarks
Certificate No + Date
Principal signature + seal
"Verified by" second signature (optional)

--- Template: attendance-blank.html ---
A4 portrait or landscape
Header: Institution name | Class: ___ | Section: ___ | Shift: ___ | Month: ___ | Year: ___
Table:
  SL | Roll | Student Name (EN) | Columns for each date (1–31, narrow) | Total P | Total A | %
  Each date column: small, just enough for P/A/L
  Empty rows for manual entry

--- Template: fee-receipt.html ---
A5 size (2 per A4 page with cut line, or single A5)
Top: Institution logo + name + "Fee Receipt" title
Receipt details:
  Receipt No | Date
  Student Name | Student ID | Class | Section
  Table: Fee Category | Description | Amount | Fine
  Total line (bold)
Payment details: Method (bKash/Cash/etc.) | Transaction ID
Cashier signature box
"This is a system-generated receipt" note
QR code: links to online receipt verification

--- Template: payslip.html ---
A5 size
Institution header
Staff Name | Staff ID | Designation | Month/Year
Earnings table: Basic | House Rent | Medical | Transport | Other | Gross
Deductions table: PF | TDS | Advance Recovery | Late Deduction | Total Deductions
Net Salary (large, bold)
Working Days | Present Days | Absent Days
Accountant signature
"Received the above amount" signature line for staff

────────────────────────────────────────────────
STEP 10B — Document Generation API
server/api/src/modules/documents/
────────────────────────────────────────────────

All endpoints return PDF as application/pdf response.
Accept query: ?download=true (forces download) vs inline viewing

Student Documents:
GET /api/documents/student/:id/id-card
  Generates front+back of student ID card
  Option: ?format=A4-2up (4 cards per A4 sheet for printing)

GET /api/documents/student/:id/testimonial
  Requires: student must have completed year / be leaving
  Generates TC serial number if not already assigned

GET /api/documents/student/:id/transfer-cert
  Same logic, formal TC format

Exam Documents:
GET /api/documents/exam/:exam_id/admit-cards
  Query: class_id?, section_id?, application_id?, format=single|2up|4up
  Bulk: generates one PDF with all students' admit cards

GET /api/documents/exam/:exam_id/seat-plan
  Formatted seat plan per hall, printable

Result Documents:
GET /api/documents/result/:exam_id/marksheet/:student_id
GET /api/documents/result/:exam_id/report-card/:student_id
GET /api/documents/result/:exam_id/marksheets/class/:class_id
  Bulk: all students in one PDF
GET /api/documents/result/:exam_id/tabulation/:class_id
  Large tabulation sheet PDF (all students × all subjects)
GET /api/documents/result/:exam_id/merit-list/:class_id
  Ranked merit list PDF

Attendance Documents:
GET /api/documents/attendance/daily-register
  Query: date, class_id, section_id
GET /api/documents/attendance/monthly-sheet
  Query: class_id, section_id, month, year, format=pdf|excel
GET /api/documents/attendance/blank-sheet
  Query: class_id, section_id, from_date, to_date

Finance Documents:
GET /api/documents/fee/receipt/:payment_id
GET /api/documents/fee/invoice/:invoice_id
GET /api/documents/fee/dues-report
  Query: class_id?, status=OVERDUE
GET /api/documents/payroll/payslip/:payroll_record_id

ID Cards:
GET /api/documents/staff/:id/id-card
GET /api/documents/id-cards/class/:class_id
  Bulk class ID cards (format=A4-4up for efficient printing)
GET /api/documents/id-cards/all-staff
  All active staff ID cards

────────────────────────────────────────────────
STEP 10C — Bulk Print Admin UI
apps/admin/app/(dashboard)/documents/print/
────────────────────────────────────────────────

─── PAGE: /documents/print ───

Full-screen print center layout:

LEFT SIDEBAR (fixed, 220px):
  "Document Type" heading
  Icon card grid — click to select:

  🪪 Student ID Card
  👤 Staff ID Card  
  📋 Admit Card
  📇 Registration Card
  📄 Marksheet
  📊 Report Card
  📑 Tabulation Sheet
  🏆 Merit List
  📜 Testimonial
  🔄 Transfer Certificate
  📅 Attendance Register (Daily)
  📆 Attendance Sheet (Monthly)
  📃 Blank Attendance Sheet
  🧾 Fee Receipt
  💰 Fee Dues Report
  💵 Payslip

RIGHT MAIN AREA:

TOP: Selected document name + description

FILTER PANEL (changes per document type):

  For Student ID Card:
    Academic Year | Class | Section | "All Students" or individual search
    Format: dropdown [Single A4 | 2 per page | 4 per page (for ID card cutting)]

  For Admit Card:
    Exam selector | Class | Section | "All Shortlisted" or individual search
    Format: [Single | 2 per A4 | 4 per A4]

  For Marksheet / Report Card:
    Exam selector | Class | Section | "All Students" or individual search
    Include attendance toggle | Include remarks toggle

  For Tabulation Sheet:
    Exam selector | Class (one at a time) | Section (optional: all sections combined)
    Paper size: [A4 Landscape | A3 Landscape]

  For Attendance Sheet (Monthly):
    Month/Year picker | Class | Section
    Format: [PDF | Excel]

  For Payslip:
    Month/Year picker | Department | "All Staff" or individual search

PREVIEW SECTION:
  "Records to generate: 45" count badge
  "Preview First Document" button → opens PDF in modal (iframe)
  
ACTION BUTTONS:
  📥 Download PDF    (generates + downloads)
  📊 Download Excel  (where applicable)
  🖨️  Print Directly  (opens browser print dialog with generated PDF)

Progress bar (shown during generation):
  "Generating 45 documents... This may take a few seconds."
  Cancel button

RECENT DOWNLOADS section (bottom):
  List of recently generated documents with timestamp
  Re-download button per entry
```

---

---

# ═══════════════════════════════════════════════
# PHASE 11 — Website Maintenance Module
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 11 GOAL: Complete website content management system —
every section of the public website controlled from the ERP admin.
Build both the admin management UI AND the actual public website (apps/website).

────────────────────────────────────────────────
STEP 11A — Website Content API
server/api/src/modules/website/
────────────────────────────────────────────────

All admin routes: require auth + role (ADMIN, PRINCIPAL, IT_ADMIN)
All public /content/* routes: no auth, identified by domain

--- Slider ---
GET    /api/website/sliders               → list all, ordered
POST   /api/website/sliders               → create (image upload to Azure Blob)
  Body: image_url (from upload), title, subtitle, btn_text, btn_link, publish_from, publish_until
PUT    /api/website/sliders/:id           → update
DELETE /api/website/sliders/:id           → delete + remove from Blob
PUT    /api/website/sliders/reorder       → Body: [{ id, display_order }] batch update
PUT    /api/website/sliders/:id/toggle    → toggle is_active

Image upload endpoint (shared):
POST /api/website/upload-image
  Multipart image → resize (max 1920px width) → upload to Blob → return url

--- Notices ---
GET    /api/website/notices               → list (filter: audience, is_published, search)
POST   /api/website/notices
  Body: title, body (rich text HTML), audience, attachment (PDF upload), 
        is_pinned, is_public_website, send_sms, publish_at, expire_at
PUT    /api/website/notices/:id
DELETE /api/website/notices/:id           → soft delete
POST   /api/website/notices/:id/publish   → set is_published=true, publish_at=now
  On publish: trigger website revalidation for /notices
POST   /api/website/notices/:id/unpublish → set is_published=false
POST   /api/website/notices/:id/send-sms
  Body: { override_audience? }
  Queue SMS to targeted audience via notification service
  Update sms_sent_at

--- Gallery ---
GET    /api/website/gallery/albums
POST   /api/website/gallery/albums        → { name, date, description, is_public }
PUT    /api/website/gallery/albums/:id
DELETE /api/website/gallery/albums/:id    → cascade delete images + Blob files
POST   /api/website/gallery/albums/:id/cover → upload cover image

POST   /api/website/gallery/albums/:id/images
  Multipart: up to 20 images at once
  Per image: resize → generate thumbnail (300px) → upload both to Blob → create GalleryImage
  Return: { uploaded: N, failed: [] }
DELETE /api/website/gallery/images/:id
PUT    /api/website/gallery/images/reorder → batch update display_order

--- Downloads ---
GET    /api/website/downloads             → list (filter: category, academic_year, is_public)
POST   /api/website/downloads
  Body: title, category, academic_year_id?, is_public
  File upload: any type (PDF, Excel, Word, Image) → Blob
DELETE /api/website/downloads/:id         → delete + remove from Blob
PUT    /api/website/downloads/:id         → update metadata

--- Static Pages ---
GET    /api/website/pages                 → list all page keys
GET    /api/website/pages/:page_key
PUT    /api/website/pages/:page_key
  Body: title_en, title_bn, content_en (rich text), content_bn (rich text), meta_title, meta_desc
  After update: trigger website revalidation for that page

Available page_keys:
  about, history, mission_vision, principal_message, vice_principal_message,
  chairman_message, facilities, achievements, contact, admission_info

--- Governing Body ---
GET    /api/website/governing-body              → list all (filter: group)
POST   /api/website/governing-body              → create member
PUT    /api/website/governing-body/:id          → update
DELETE /api/website/governing-body/:id          → delete
PUT    /api/website/governing-body/reorder      → batch update display_order
POST   /api/website/governing-body/:id/photo    → upload photo

--- Events / Academic Calendar ---
GET    /api/website/events                → list (filter: type, month, year)
POST   /api/website/events
  Body: name, date_from, date_to, type, description, is_public
PUT    /api/website/events/:id
DELETE /api/website/events/:id

--- Contact Form Submissions ---
POST   /api/website/contact               → (PUBLIC) receive contact form submission
  Body: name, email, phone, subject, message
  Store in DB + email notification to admin
GET    /api/website/contact/submissions   → (ADMIN) list submissions
PUT    /api/website/contact/submissions/:id/read → mark as read

--- Public Content API (no auth, used by apps/website) ---
GET /api/content/sliders
  Filter: current datetime between publish_from and publish_until (or both null)
  Filter: is_active=true
  Cache: Redis 5min

GET /api/content/notices?limit=10
  Filter: is_published=true, is_public_website=true, not expired
  Include pinned first, then by publish_at DESC

GET /api/content/gallery/albums?limit=12
  Filter: is_public=true
  Include first image as cover

GET /api/content/gallery/albums/:id/images

GET /api/content/downloads?category=
GET /api/content/pages/:page_key
GET /api/content/governing-body?group=
GET /api/content/events?upcoming=true&limit=10

GET /api/content/faculty
  From Staff table where show_on_website=true (add this column to Staff model)
  Group by department

GET /api/content/admission/open
  Returns open AdmissionCycles with form_config

GET /api/content/merit-list/:cycle_id
  Returns published merit list

GET /api/content/institution
  Returns InstitutionProfile public fields (name, logo, address, phone, social links)
  Cache: Redis 1hr

POST /api/content/contact → (PUBLIC) submit contact form

ISR Revalidation webhook:
POST /api/content/revalidate
  Body: { secret, path }
  Verify secret matches WEBSITE_REVALIDATE_SECRET env var
  Return: { revalidated: true, path }

After every admin publish action, call this revalidation endpoint:
  async function triggerRevalidation(paths: string[]) {
    for (const path of paths) {
      await fetch(`${WEBSITE_URL}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: process.env.WEBSITE_REVALIDATE_SECRET, path })
      })
    }
  }

────────────────────────────────────────────────
STEP 11B — Website Maintenance Admin UI
apps/admin/app/(dashboard)/website/
────────────────────────────────────────────────

Left sidebar sub-navigation for /website/*:

  📢 Notices          /website/notices
  🖼️  Sliders         /website/sliders
  🖼️  Gallery         /website/gallery
  📥  Downloads       /website/downloads
  👥  Governing Body  /website/governing-body
  📅  Events          /website/events
  📄  Pages           /website/pages
  👁️  Website Preview → external link to website URL

─── PAGE: /website/notices ───

Quick filter tabs: All | Public | Internal | Pinned | Expired

Table: Title | Audience badge | Pinned badge | Published badge | SMS badge | Created | Actions
Per row actions: Edit | Publish/Unpublish | Send SMS | Delete

"New Notice" button → Full-screen notice editor:
  Title input (EN + BN tabs)
  Rich text editor (Tiptap — supports headings, bold, italic, lists, links, image insert)
    Show Bangla toolbar option
  Audience selector: Public | Students | Staff | Guardians | All
  Toggles:
    📌 Pin this notice
    🌐 Show on public website
    📱 Send SMS on publish
  Attachment: PDF upload (single file, max 5MB)
  Schedule: publish_at date + expire_at date (optional)
  
  Bottom action bar:
    "Save as Draft" | "Publish Now" | "Schedule"

  On "Publish Now":
    If send_sms=true: "This will SMS {N} guardians/staff. Continue?" confirmation
    Show audience count before confirming

─── PAGE: /website/sliders ───

Visual drag-to-reorder interface:
  Cards in a row (or 2 columns) showing slider thumbnail
  Each card: image preview, title text, schedule info, active toggle, edit/delete
  Overlaid on image: edit pencil icon on hover

"Add Slide" button → dialog:
  Image upload (drag-drop, min 1200×400px recommended, shows crop if too small)
  Title + Subtitle + Button Text + Button URL fields
  Schedule: From Date / Until Date (optional)
  Active toggle
  Preview: shows how it will look on website (miniaturized)

─── PAGE: /website/gallery ───

Album grid view:
  Card per album: cover photo, album name, image count, date, visibility badge
  "New Album" | click album → album detail

Album detail (/website/gallery/:id):
  Header: album name (editable inline), date, description (editable), public toggle
  "Upload Photos" button → large drop zone (drag multiple, shows upload queue with progress bars)
  Image grid: 
    Masonry or uniform grid
    Per image: hover shows caption edit + delete button
    Drag to reorder

─── PAGE: /website/downloads ───

Table: Title | Category badge | Academic Year | Public/Private | Download Count | Date | Actions
"Upload File" button → dialog:
  Title + Category + Academic Year + Public toggle + File upload

─── PAGE: /website/governing-body ───

Drag-to-reorder card list
Each card: photo, name, designation, group, display_order
"Add Member" button → dialog with all fields + photo upload

─── PAGE: /website/pages ───

List of page_keys with labels:
  Click any → opens full-page editor:
    Tab: English | Bangla
    Rich text editor for each language
    Meta title + Meta description
    "Save" + auto-triggers ISR revalidation

─── LIVE PREVIEW SIDEBAR (optional enhancement) ───
For notices and pages: "Preview on Website" button opens a preview iframe

────────────────────────────────────────────────
STEP 11C — Public Website (apps/website)
────────────────────────────────────────────────

Next.js 14 App Router, ISR, reads from /api/content/*.

Install: pnpm --filter=website add axios react-quill swiper react-photo-gallery

Global layout (app/layout.tsx):
  Fetch institution profile → apply primary_color as CSS variable
  Navbar + Footer (data from institution profile)

─── NAVBAR ───
  Logo (left) | Institution Name (left, small text below logo)
  Navigation links (center):
    Home | About ▾ | Academic ▾ | Notice Board | Gallery | Downloads | Admission | Contact
  Right: Result Lookup button | Portal Login button (links to portal app)
  Mobile: hamburger menu with slide-in drawer
  Language toggle (EN/BN) — changes display language for bilingual content

─── FOOTER ───
  3 columns: About text + logo | Quick Links | Contact Info + Social Links
  Bottom bar: "© {year} {institution name} | Powered by AshDevs"

─── Pages ───

app/page.tsx — Homepage
  Sections in order:
  1. HERO SLIDER: Swiper.js slider with slides from /api/content/sliders
     Auto-play, navigation arrows, pagination dots
     Each slide: full-width image + overlay text + button
  
  2. QUICK STATS BAR: Students | Teachers | Programs | Founded Year
     Numbers pulled from InstitutionProfile + DB counts
  
  3. NOTICE BOARD WIDGET: Latest 5 notices
     Title | Date | "Download" button if attachment
     "See All Notices →" link
  
  4. PRINCIPAL MESSAGE: photo + message teaser + "Read More →"
  
  5. PHOTO GALLERY PREVIEW: Latest album (6 photos), "View Gallery →"
  
  6. UPCOMING EVENTS: next 3 events from calendar
  
  7. ADMISSION BANNER: If admission cycle is_open → show call-to-action card
     "Admission Open for {Class}" + Apply Now button
  
  8. CONTACT SECTION: Map embed + contact details

app/notices/page.tsx — Notice Board
  ISR: revalidate=3600, on-demand on publish
  Filter tabs: All | Recent (7 days) | Exam | Academic | Admission
  Paginated list: title | date | audience | download button
  Pinned notices shown at top with "📌 Pinned" badge

app/gallery/page.tsx — Gallery
  Album grid (ISR: revalidate=3600)
  Click album → app/gallery/[album_id]/page.tsx
  Lightbox using yet-another-react-lightbox package

app/downloads/page.tsx — Downloads
  Grouped by category (Tabs or Accordion)
  Academic year filter
  Each item: file icon + title + date + download count + "Download" button

app/about/page.tsx + app/about/[slug]/page.tsx
  Dynamic pages from StaticPage table
  Sidebar navigation: About Us | History | Mission & Vision | Facilities | Achievements

app/faculty/page.tsx — Faculty Directory
  Filter by department
  Card grid: photo | name | designation | qualification
  Staff marked show_on_website=true

app/governing-body/page.tsx
  Table or cards of governing body members
  Grouped by group (Governing Body / Academic Council / Finance Committee)

app/admission/page.tsx — Admission Info
  If cycle open: show form link + deadline + requirements
  If no open cycle: "Admission closed — check back soon"
  Downloads section (admission-related files)

app/admission/[cycle_id]/page.tsx
  Dynamic admission form (fetches form_config, renders dynamic fields)
  Multi-step form with progress indicator
  Mobile-first design

app/admission/status/page.tsx
  Status check form → results

app/result/page.tsx — Result Lookup
  Search form: Roll No + Registration No + Exam selector
  Calls /api/results/public/lookup
  Result card: student info + subject table + GPA
  Print-friendly CSS for browser print

app/contact/page.tsx
  Contact form + map + contact details

app/events/page.tsx
  Monthly calendar view of events

app/api/revalidate/route.ts — ISR revalidation handler
  Verify secret → call revalidatePath(path)

─── WEBSITE DESIGN SYSTEM ───

Typography: 
  Headings: Playfair Display (serif, formal education look)
  Body: Inter (Latin) + Noto Sans Bengali (Bangla)

Colors:
  Primary: var(--primary) from institution config
  Secondary: var(--secondary) from institution config
  Neutral: gray-50 through gray-900

All public pages:
  Mobile-first responsive (breakpoints: sm:640 md:768 lg:1024 xl:1280)
  Loading skeleton for SSR content
  Error boundary with "Unable to load content" fallback
  SEO: next/metadata on every page
```

---

---

# ═══════════════════════════════════════════════
# PHASE 12 — HR & Payroll Module
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 12 GOAL: Staff management, leave management, payroll processing, payslips.

────────────────────────────────────────────────
STEP 12A — HR API
server/api/src/modules/hr/
────────────────────────────────────────────────

--- Staff CRUD ---

GET  /api/hr/staff
  Query: search, department_id, role, employment_type, is_active, page, limit
  Returns: paginated list with photo, name, designation, department, role, status

GET  /api/hr/staff/:id
  Returns: full profile + subject assignments + leave balance + payroll history

POST /api/hr/staff
  Body: all Staff fields + User fields (phone, email, role, password optional)
  Logic:
    1. Create User record (if creating account)
    2. Generate staff_uid: STAFF-{YEAR}-{sequential}
    3. Create Staff record
    4. Upload photo to Azure Blob if provided
    5. Assign to department
    6. If show_on_website=true: trigger faculty page revalidation

PUT  /api/hr/staff/:id
DELETE /api/hr/staff/:id → soft delete (deleted_at, is_active=false, User.is_active=false)

POST /api/hr/staff/:id/photo → upload photo
POST /api/hr/staff/:id/signature → upload signature image

--- Leave Management ---

GET  /api/hr/leave-types
POST /api/hr/leave-types     → create leave type (name, days_allowed, is_paid)
PUT  /api/hr/leave-types/:id
DELETE /api/hr/leave-types/:id

GET  /api/hr/leaves
  Query: staff_id?, status?, from_date?, to_date?, leave_type_id?

GET  /api/hr/leaves/balance/:staff_id
  Returns: { leave_type, total_allowed, used, remaining } per type for current year

POST /api/hr/leaves/apply
  Body: { staff_id, leave_type_id, from_date, to_date, reason }
  Validate: enough balance remaining
  Calculate: days = working days between dates (exclude Fridays, holidays)
  Status: PENDING

PUT  /api/hr/leaves/:id/approve
  Body: { approved_by_id }
  Status: APPROVED
  Auto-create LEAVE AttendanceRecord for each day
  Deduct from leave balance

PUT  /api/hr/leaves/:id/reject
  Body: { reason }
  Status: REJECTED

--- Salary Structure ---

GET  /api/hr/salary-structures
POST /api/hr/salary-structures
  Body: { name, basic, house_rent, medical, transport, pf_percentage, tds_percentage }
PUT  /api/hr/salary-structures/:id

PUT  /api/hr/staff/:id/salary-structure
  Body: { salary_structure_id }
  Assigns salary structure to staff member

--- Payroll ---

POST /api/hr/payroll/calculate
  Body: { month, year, department_id? (null = all) }
  For each active staff with salary structure:
    1. Get attendance for month: present_days, absent_days, leave_days
    2. Calculate per-day salary = basic / working_days_in_month
    3. Deductions: (absent_days × per_day_salary) + pf + tds + advance_recovery
    4. Gross = sum of all components
    5. Net = gross - deductions
    6. Create/update PayrollRecord for each staff (status=DRAFT)
  Returns: { processed: N, total_payable: amount }

GET  /api/hr/payroll
  Query: month, year, department_id?, status?
  Returns: list of payroll records with staff info

PUT  /api/hr/payroll/:id
  Body: manual adjustments (bonuses, extra deductions)
  Only if status=DRAFT

POST /api/hr/payroll/finalize
  Body: { month, year }
  Set all DRAFT payrolls for that month → FINALIZED
  Generate payslip PDFs for all staff
  Store payslip_url

POST /api/hr/payroll/mark-paid
  Body: { payroll_ids: [] }
  Status: PAID
  Record payment date

GET  /api/hr/payroll/:id/payslip
  Returns PDF (via PDF service, payslip template)

--- Recruitment (basic) ---

GET  /api/hr/jobs → list job postings
POST /api/hr/jobs → create job posting (for website Jobs page)
PUT  /api/hr/jobs/:id/toggle → toggle is_published

────────────────────────────────────────────────
STEP 12B — HR Admin UI
apps/admin/app/(dashboard)/hr/
────────────────────────────────────────────────

─── PAGE: /hr ───
Stats: Total Staff | Active | On Leave Today | Pending Leave Requests | This Month Payroll Total

─── PAGE: /hr/staff ───
Table: Photo | Staff UID | Name | Designation | Department | Role | Status | Actions
Filters: Department | Role | Employment Type | Status
"Add Staff" button → multi-step form (Personal → Professional → Account Access → Done)

─── PAGE: /hr/staff/:id ───
Header: Photo | Name | Staff UID | Designation badge | Department badge
Tabs: Profile | Subjects Assigned | Attendance | Leave | Payroll | Documents

TAB — Profile: all personal + professional info
TAB — Subjects: table of current subject assignments
TAB — Attendance: monthly summary + calendar (same as student attendance tab)
TAB — Leave:
  Leave balance summary cards (per type: taken/remaining/total)
  Leave history table
  "Apply Leave" button (for admin to apply on behalf)
TAB — Payroll: payroll history table + payslip download per month
TAB — Documents: uploaded docs (NID, TIN, certificates) + upload new

─── PAGE: /hr/leave ───
Tabs: Pending Requests | Approved | Rejected | All

Pending table: Staff Name | Type | From | To | Days | Reason | Approve button | Reject button
Batch: "Approve All Pending" button

─── PAGE: /hr/payroll ───
Month/Year selector at top

Status: "Draft | Finalized | Paid" progress indicator

Table: Staff Name | Department | Working Days | Present | Gross | Deductions | Net | Status | Payslip
"Calculate Payroll" button → progress dialog
"Finalize Month" button (after review) → confirmation
"Mark All Paid" button
"Download All Payslips" button (ZIP or merged PDF)
```

---

---

# ═══════════════════════════════════════════════
# PHASE 13 — Library, Transport & Hostel
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 13 GOAL: Three supporting operational modules — Library, Transport, Hostel.
Build complete API + Admin UI for each.

────────────────────────────────────────────────
STEP 13A — Library Module
────────────────────────────────────────────────

Add models to Prisma schema first:

model Book {
  id            String    @id @default(cuid())
  isbn          String?   @unique
  title         String
  author        String
  publisher     String?
  edition       String?
  category      String
  subject_id    String?
  total_copies  Int       @default(1)
  available     Int       @default(1)
  location      String?   // shelf/rack code
  barcode       String?   @unique
  cover_url     String?
  is_active     Boolean   @default(true)
  created_at    DateTime  @default(now())
  issues        BookIssue[]
}

model BookIssue {
  id              String    @id @default(cuid())
  book_id         String
  book            Book      @relation(fields: [book_id], references: [id])
  person_id       String
  person_type     PersonType
  issued_at       DateTime  @default(now())
  due_date        DateTime
  returned_at     DateTime?
  fine_per_day    Float     @default(2)
  fine_amount     Float     @default(0)
  fine_paid       Boolean   @default(false)
  issued_by_id    String?
  returned_to_id  String?
  status          IssueStatus @default(ISSUED)
  @@index([book_id])
  @@index([person_id])
}

enum IssueStatus { ISSUED RETURNED OVERDUE LOST }

Add to Prisma schema, then run migration.

Library API (server/api/src/modules/library/):

GET  /api/library/books
  Query: search (title/author/isbn), category, available_only, page, limit
GET  /api/library/books/:id  → with current issues count
POST /api/library/books      → create book
PUT  /api/library/books/:id  → update
POST /api/library/books/:id/copies → add more copies (increase total_copies + available)

GET  /api/library/issues     → list (filter: status, person_type, overdue=true)
POST /api/library/issues/issue
  Body: { book_id, person_id, person_type, due_date }
  Validate: book available > 0
  Decrement book.available
  Create BookIssue (status=ISSUED)

POST /api/library/issues/:id/return
  Calculate fine: if returned_at > due_date: days_late × fine_per_day
  Update: returned_at=now, status=RETURNED, fine_amount, book.available++

GET  /api/library/issues/person/:id  → all issues for a student/staff
GET  /api/library/reports/overdue    → all overdue issues with fine totals
GET  /api/library/reports/fine-report → fine collection summary

Library Admin UI (/library):
  /library          → Dashboard: Books count | Active Issues | Overdue | Total Fines
  /library/books    → Book catalog (table + search + "Add Book" dialog)
  /library/issue    → Issue book: search student/staff → search book → issue form
  /library/return   → Return: scan/search issued book → show fine → mark returned
  /library/reports  → Overdue list (with SMS reminder option) | Fine report

────────────────────────────────────────────────
STEP 13B — Transport Module
────────────────────────────────────────────────

Add to Prisma schema:

model TransportRoute {
  id            String    @id @default(cuid())
  name          String
  fare          Float     @default(0)
  is_active     Boolean   @default(true)
  created_at    DateTime  @default(now())
  stops         RouteStop[]
  vehicles      Vehicle[]
  students      StudentTransport[]
}

model RouteStop {
  id          String          @id @default(cuid())
  route_id    String
  route       TransportRoute  @relation(fields: [route_id], references: [id])
  name        String
  stop_order  Int
  time        String?         // "07:30"
}

model Vehicle {
  id            String          @id @default(cuid())
  route_id      String?
  route         TransportRoute? @relation(fields: [route_id], references: [id])
  vehicle_no    String
  type          String          // "Bus", "Microbus", "CNG"
  capacity      Int
  driver_name   String?
  driver_phone  String?
  insurance_exp DateTime?
  is_active     Boolean         @default(true)
  created_at    DateTime        @default(now())
}

model StudentTransport {
  id          String          @id @default(cuid())
  student_id  String          @unique
  student     Student         @relation(fields: [student_id], references: [id])
  route_id    String
  route       TransportRoute  @relation(fields: [route_id], references: [id])
  pickup_stop String?
  created_at  DateTime        @default(now())
}

Transport API (server/api/src/modules/transport/):

POST /api/transport/routes       → create route
GET  /api/transport/routes       → list with vehicle count + student count
PUT  /api/transport/routes/:id
POST /api/transport/routes/:id/stops → add/update stops
POST /api/transport/vehicles     → create vehicle
PUT  /api/transport/vehicles/:id

POST /api/transport/assign
  Body: { student_id, route_id, pickup_stop }
  Update or create StudentTransport
  Generate transport fee invoice if fee > 0

GET  /api/transport/routes/:id/students → all students on this route

Transport Admin UI (/transport):
  /transport          → Routes list with vehicle + student counts
  /transport/routes/new → Route builder: name + add stops (drag-order) + assign vehicle
  /transport/assign   → Assign students to routes (search student → select route → stop)
  /transport/routes/:id/manifest → printable passenger list per route

────────────────────────────────────────────────
STEP 13C — Hostel Module
────────────────────────────────────────────────

Add to Prisma schema:

model HostelBlock {
  id        String    @id @default(cuid())
  name      String
  type      String?   // "Boys", "Girls"
  rooms     HostelRoom[]
  created_at DateTime @default(now())
}

model HostelRoom {
  id          String      @id @default(cuid())
  block_id    String
  block       HostelBlock @relation(fields: [block_id], references: [id])
  room_no     String
  floor       Int         @default(0)
  capacity    Int         @default(4)
  type        String?     // "General", "AC", "Special"
  is_active   Boolean     @default(true)
  allocations HostelAllocation[]
}

model HostelAllocation {
  id          String      @id @default(cuid())
  room_id     String
  room        HostelRoom  @relation(fields: [room_id], references: [id])
  student_id  String
  student     Student     @relation(fields: [student_id], references: [id])
  bed_no      String?
  from_date   DateTime
  to_date     DateTime?
  is_active   Boolean     @default(true)
  created_at  DateTime    @default(now())
}

model HostelVisitor {
  id          String    @id @default(cuid())
  student_id  String
  visitor_name String
  relation    String
  phone       String
  purpose     String?
  in_time     DateTime  @default(now())
  out_time    DateTime?
  approved_by String?
  created_at  DateTime  @default(now())
}

Hostel API (server/api/src/modules/hostel/):
CRUD for blocks, rooms, allocations
GET /api/hostel/rooms?available=true → available rooms with bed count
POST /api/hostel/allocate → assign student to room+bed
GET /api/hostel/rooms/:id/residents → all students in room
POST /api/hostel/visitors → log visitor in
PUT /api/hostel/visitors/:id/checkout → log visitor out
GET /api/hostel/reports/occupancy → rooms with fill rate

Hostel Admin UI (/hostel):
  Visual block/floor/room grid — click room to see occupants + allocate
  Visitor log with real-time in/out
  Occupancy report
```

---

---

# ═══════════════════════════════════════════════
# PHASE 14 — Analytics & Reporting Dashboard
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 14 GOAL: Comprehensive analytics dashboard for institution admin + role-specific views.

────────────────────────────────────────────────
STEP 14A — Analytics API
server/api/src/modules/reports/
────────────────────────────────────────────────

GET /api/analytics/overview
  Returns all summary cards for main dashboard:
  {
    students: { total, active, new_this_year, today_present, today_absent, today_percentage },
    staff: { total, active, on_leave_today, present_today },
    finance: { today_collection, this_month_collection, total_outstanding, overdue_invoices },
    academic: { active_exams, published_results, upcoming_events },
    library: { books_issued, overdue_issues }
  }

GET /api/analytics/attendance-trend
  Query: period=WEEKLY|MONTHLY, class_id?, weeks_back=8
  Returns: { labels: ["Week 1"...], present_percentage: [78, 82, 75...] }

GET /api/analytics/result-performance
  Query: academic_year_id, class_id?
  Returns: per-exam GPA averages by class, subject-wise performance

GET /api/analytics/fee-collection
  Query: from_date, to_date
  Returns: { daily: [{date, amount}], by_category: [{category, total}], gateway_breakdown: [...] }

GET /api/analytics/defaulters-risk
  Returns: students with: attendance < 75% OR dues > 30 days
  Risk score per student (composite)

GET /api/analytics/class-comparison
  Query: academic_year_id, exam_id?
  Returns: all classes side-by-side: attendance%, avg GPA, fee collection%

GET /api/analytics/teacher-workload
  Returns: per teacher — classes assigned, subjects, student count, pending mark entries

────────────────────────────────────────────────
STEP 14B — Dashboard Admin UI
────────────────────────────────────────────────

─── PAGE: /dashboard (main dashboard) ───

LAYOUT: 12-column responsive grid

ROW 1 — Quick Stats (4 cards):
  🎓 Total Students (with today's present/absent badges)
  👨‍🏫 Staff (with on-leave count)
  💰 Today's Fee Collection (with month total)
  📊 Attendance Today (large %)

ROW 2 — Attendance Trend Chart (6 cols) + Top Notices Widget (6 cols)
  Attendance Trend: Recharts LineChart — weekly campus attendance %
  Line per class (top 3 classes)
  Notices: last 5 notices with type badge + date

ROW 3 — Fee Collection Chart (6 cols) + Result Performance (6 cols)
  Fee: Recharts BarChart — daily collection last 30 days
  Result: Recharts RadarChart — per-subject performance last exam

ROW 4 — At-Risk Students (full width)
  Table: students with attendance < 75% OR dues overdue
  Red/Orange/Yellow color coding by severity
  Guardian SMS button per row

ROW 5 — Upcoming Events (4 cols) + Quick Actions (4 cols) + System Status (4 cols)
  Events: next 5 events from calendar
  Quick Actions: buttons for most common tasks (Mark Attendance, Collect Fee, Notice)
  System Status: last backup time, device sync status, pending approvals count

─── ROLE-SPECIFIC DASHBOARD VIEWS ───

For TEACHER (CLASS_TEACHER / SUBJECT_TEACHER):
  My Classes today (attendance status per class, "Mark Now" button)
  My Pending Mark Entries (exams with open windows)
  My Students at Risk (low attendance in my classes)
  My Homework Posted (this week)

For ACCOUNTANT:
  Today's Collection summary
  Overdue invoices count + total
  Recent payments table
  Monthly collection vs target chart

For EXAM_CONTROLLER:
  Open Exams (with mark entry status per class)
  Pending Approvals (submitted marks waiting for approval)
  Published vs Pending results

─── PAGE: /reports ───

Report Center with categories:

ACADEMIC REPORTS:
  Class-wise Attendance Summary (date range) → PDF/Excel
  Student Attendance Report (individual) → PDF
  Exam Result Summary (exam + class) → PDF/Excel
  Campus-wide Result (all classes, selected exam) → PDF
  Merit List (class) → PDF

FINANCE REPORTS:
  Daily Collection Report → PDF
  Monthly Collection Report → PDF/Excel
  Outstanding Dues Report → PDF/Excel
  Defaulter List → PDF/Excel
  Payroll Report (month) → PDF/Excel

HR REPORTS:
  Staff Attendance Report → PDF/Excel
  Leave Summary Report → PDF/Excel
  Staff List (by department) → PDF/Excel

MANAGEMENT REPORTS:
  Enrollment Report (class-wise student count) → PDF
  Year-wise Enrollment Trend → PDF
  Dropout Risk Analysis → PDF/Excel
  Library Utilization → PDF

Each report: filter panel + preview table + Download PDF/Excel buttons
```

---

---

# ═══════════════════════════════════════════════
# PHASE 15 — Student/Guardian Portal (PWA)
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 15 GOAL: Complete student + guardian portal as a PWA.
Separate Next.js app: apps/portal

────────────────────────────────────────────────
STEP 15A — Portal API Endpoints
(add to server/api — these are portal-specific reads)
────────────────────────────────────────────────

All portal routes: authenticated as STUDENT or GUARDIAN

GET /api/portal/me
  Returns: student profile (or linked students for guardian)
  
GET /api/portal/student/:id/dashboard
  Returns combined summary:
  {
    student: { name, uid, class, section, roll, photo },
    attendance: { today_status, this_month_percentage, this_week: [...] },
    upcoming_exams: [...],
    recent_results: [...],
    fee_dues: { total_outstanding, next_due_date, next_due_amount },
    recent_notices: [...],
    homework: { pending: N, submitted: N, recent: [...] }
  }

GET /api/portal/student/:id/attendance → (same as admin endpoint, scoped)
GET /api/portal/student/:id/results   → published results only
GET /api/portal/student/:id/fees      → invoices + payment initiation
GET /api/portal/student/:id/homework  → homework list
GET /api/portal/student/:id/routine   → class timetable
GET /api/portal/student/:id/notices   → notices targeted to students/all
GET /api/portal/student/:id/subjects  → current subjects + teacher info

POST /api/portal/fees/pay             → initiate payment (same as admin endpoint)

────────────────────────────────────────────────
STEP 15B — Portal UI (apps/portal)
────────────────────────────────────────────────

PWA setup:
  Install next-pwa
  next.config.js: pwa config with cache strategies
  public/manifest.json: app name, icons, theme_color from institution primary_color
  Service worker: cache API responses, offline fallback page

Auth:
  Login: Student ID or phone + password
  Guardian: linked by student's guardian phone → sees all linked students
  Store: Zustand + localStorage

─── BOTTOM NAVIGATION (mobile-first) ───
  🏠 Home | 📋 Results | 📅 Attendance | 💳 Fees | 🔔 Notices

─── PAGE: / (Home / Dashboard) ───

Mobile-optimized card stack:

HEADER:
  Greeting: "Good morning, [Student Name]" | Today's date
  Profile photo (small, round) + "View Profile →"

TODAY'S CARD:
  Attendance status badge (Present / Absent / Not Yet Marked)
  Class: [Class Name] | Section: [Section] | Roll: [Roll No]

QUICK STATS ROW:
  This month attendance % | Outstanding fees | Results available

UPCOMING EXAMS CARD:
  Next 2 exams with date + days remaining countdown

RECENT NOTICES CARD (top 3):
  Title | Date | Type badge
  "View All →"

RECENT RESULT CARD (if available):
  Last exam: subject name, GPA achieved
  "View Full Result →"

HOMEWORK DUE CARD:
  Pending homework count | Nearest due date
  "View →"

─── PAGE: /results ───

List of exams with published results:
  Exam name | Date | Overall GPA badge (colored) | Overall Grade

Click exam → full result detail:
  Student info header (name, roll, class)
  Subject table: Subject | Theory | Practical | Total | Grade | GPA
  Summary: Total GPA | Grade | Position in Section | Position in Class
  "Print Result Card" button → opens PDF in new tab

─── PAGE: /attendance ───

Tab: Monthly | Yearly

Monthly view:
  Month/Year picker
  Calendar grid: colored squares per day
    Green = Present, Red = Absent, Orange = Late, Blue = Leave, Gray = Holiday
  Summary row: P: 20 | A: 2 | L: 1 | Total: 23 | 87%

Yearly view:
  Summary cards per month
  Full year percentage

─── PAGE: /fees ───

Outstanding dues alert (if any, red card at top)
Total outstanding: ৳ [amount]

Invoice list:
  Per invoice card:
    Fee type | Month/Year | Amount | Fine (if any) | Due date
    Status badge (Pending/Overdue/Paid)
    For unpaid: "Pay Now" button → payment method selection

Payment method bottom sheet:
  bKash | Nagad | Rocket (icons)
  "Pay ৳ [amount]"

Payment history (collapsible):
  Per payment: amount, method, date, "Receipt" link

─── PAGE: /notices ───

Notice list (infinite scroll):
  Pinned notices first (pin icon)
  Each: Title | Date badge | Attachment icon (if attachment)

Click → Notice detail:
  Full title + full body (rendered rich text)
  Attachment download button
  Published date

─── PAGE: /routine ───

Class timetable:
  Day tabs: Sat | Sun | Mon | Tue | Wed | Thu
  Per day: period grid showing subject name + teacher name
  Highlight: current day + current period

─── PAGE: /homework ───

Filter tabs: Pending | Submitted | All
Per homework card:
  Subject badge | Due date | Teacher name
  Title + description
  Attachment (if any)
  "Mark as Done" button (visual only, no submission for v1)

─── PAGE: /profile ───

Profile photo (large) + edit button
Info: Name (EN + BN), Student UID, Class, Section, Roll, Registration No
Contact: phone, email
Guardian info: father/mother name, phone
"Change Password" option
Language toggle (Bangla / English)

─── OFFLINE BEHAVIOR ───

Service worker caches:
  Last loaded dashboard data → show stale with "Last updated: X ago" banner
  Notices (last 20)
  Attendance calendar (current month)

Offline indicator: top banner "You're offline — showing cached data"

─── PUSH NOTIFICATIONS ───

On login: request notification permission
Register push subscription → POST /api/portal/push-subscribe

Receive push for:
  New notice (from notification service)
  Fee due reminder
  Result published
  Absence marked
```

---

---

# ═══════════════════════════════════════════════
# PHASE 16 — IoT / Biometric Device Service
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 16 GOAL: Biometric device integration service —
ZKTeco ADMS protocol, offline reconciliation, shift-aware matching.

────────────────────────────────────────────────
STEP 16A — Device Service Structure
services/device/
────────────────────────────────────────────────

services/device/
├── src/
│   ├── connectors/
│   │   ├── interface.ts              → DeviceConnector interface
│   │   ├── zkteco-adms.ts            → ZKTeco ADMS protocol connector
│   │   └── generic-http.ts           → Generic HTTP push connector
│   ├── processor/
│   │   ├── punch.processor.ts        → normalize → deduplicate → map → write
│   │   └── reconciliation.ts         → offline recovery job
│   ├── server/
│   │   └── adms.server.ts            → HTTP server for device push
│   ├── jobs/
│   │   └── sync.job.ts               → BullMQ sync jobs
│   └── index.ts
├── package.json
└── tsconfig.json

────────────────────────────────────────────────
STEP 16B — Connector Interface
────────────────────────────────────────────────

Create services/device/src/connectors/interface.ts:

interface RawPunch {
  device_id: string
  device_user_id: string    // the ID enrolled on the device (may differ from system ID)
  punch_at: Date
  punch_type: number        // 0=check-in, 1=check-out, 4=break-out, 5=break-in
  sequence_no: number       // device-local sequence for dedup
}

interface DeviceConnector {
  testConnection(): Promise<boolean>
  pullPunchLogs(deviceId: string, since: Date): Promise<RawPunch[]>
  getUserList(deviceId: string): Promise<{ device_user_id: string }[]>
  pushUserList(deviceId: string, users: DeviceUser[]): Promise<void>
  enrollUser(deviceId: string, userId: string, fingerprintTemplate?: string): Promise<void>
  deleteUser(deviceId: string, userId: string): Promise<void>
  clearLogs(deviceId: string, before: Date): Promise<void>
  getDeviceInfo(deviceId: string): Promise<{ sn: string, firmware: string, time: Date }>
  syncTime(deviceId: string): Promise<void>
}

────────────────────────────────────────────────
STEP 16C — ZKTeco ADMS Server
────────────────────────────────────────────────

Create services/device/src/server/adms.server.ts:

Express HTTP server on a separate port (default 4500)
ZKTeco devices will be configured to push to: http://your-server:4500

Endpoints that ZKTeco devices call:
GET  /iclock/cdata
  Device polls this on startup to check connectivity
  Response: "GET OPTION FROM: {sn}"

POST /iclock/cdata
  Query: SN={device_serial}, table=ATTLOG (attendance logs) or OPERLOG
  Body: tab-delimited attendance log lines
  Format per line: {device_user_id}\t{date_time}\t{status}\t{punch_type}\t...
  Parse each line → create DevicePunchLog → queue for processing

GET  /iclock/getrequest
  Device polls this for pending commands
  Pop from command queue for this device's SN
  Response: "C:{seq}\t{command}" (e.g. "C:1000\tDATA UPDATE USERINFO...")

POST /iclock/devicecmd
  Device confirms command execution
  Update command status

POST /iclock/cdata (USERPIC table)
  Receives user photo uploads from device (optional)

PUSH LOG FORMAT parsing:
Each ATTLOG line: 
  "123\t2026-07-01 08:23:45\t0\t1\t0\t0\n"
  Fields: user_id, datetime, status, type, work_code, reserved
Parse with split('\t'), validate, create RawPunch

────────────────────────────────────────────────
STEP 16D — Punch Processor
────────────────────────────────────────────────

Create services/device/src/processor/punch.processor.ts:

async function processPunch(raw: RawPunch): Promise<void>
  1. DEDUP: Check DevicePunchLog table — if sequence_no for device already exists → skip
  2. CREATE LOG: Insert DevicePunchLog { device_id, device_user_id, punch_at, sequence_no }
  3. MAP PERSON: 
     Query: find Student where biometric_id = device_user_id → get student_id
     OR find Staff where biometric_id = device_user_id → get staff_id
     If not found: log "unmapped biometric ID" + skip
  4. DETERMINE SHIFT:
     Get person's section → get section's shift
     Check: punch_at.time is within shift.start_time ± 30min window
     If no shift match: try all active shifts (person may have changed shift today)
     Assign matched shift_id
  5. DETERMINE STATUS:
     If punch_at.time <= shift.start_time + AttendanceRules.late_arrival_window_minutes → PRESENT
     If punch_at.time > shift.start_time + late_window → LATE
     (ABSENT determined at end-of-day job, not on punch)
  6. WRITE ATTENDANCE:
     Upsert AttendanceRecord:
       person_id, person_type, date=punch_at.date, shift_id,
       status=determined above, source=BIOMETRIC, device_id
     Unique key: (person_id, person_type, date, shift_id)
     If record already exists with MANUAL source: 
       Set source=BIOMETRIC (biometric wins unless admin override)
  7. EMIT SOCKET EVENT:
     Emit to API's Socket.io server: 
       POST http://api:4000/internal/attendance/biometric-event
       Body: { person_id, person_type, status, time, shift_id }
  8. ABSENT NOTIFICATION JOB:
     Schedule a delayed job: 30min after shift.end_time
     Job checks: does AttendanceRecord exist for this student on this date+shift?
     If not: create ABSENT record + queue SMS to guardian

────────────────────────────────────────────────
STEP 16E — Reconciliation (Offline Recovery)
────────────────────────────────────────────────

Create services/device/src/processor/reconciliation.ts:

BullMQ recurring job: every 30 minutes
For each ONLINE Device:
  1. Pull punch logs since device.last_sync_at (or last 24h if first sync)
  2. For each punch: run processPunch (dedup handles already-processed punches)
  3. Update Device.last_sync_at = now
  4. Handle device time drift: if device_info.time differs from server time by >5min → syncTime()

End-of-day job (runs at midnight):
  For each Section (with active students):
    Check all students for that section's shift
    For any student WITHOUT an AttendanceRecord on today's date:
      Create ABSENT record (source=MANUAL, marked_by=null) → "system-default-absent"
  This ensures every working day has an attendance record for every student

────────────────────────────────────────────────
STEP 16F — Device Management API (add to core API)
────────────────────────────────────────────────

GET  /api/devices                → list all devices with status
POST /api/devices                → register new device
PUT  /api/devices/:id            → update config
DELETE /api/devices/:id          → deactivate

POST /api/devices/:id/test-connection  → ping device → return status
POST /api/devices/:id/sync-now         → trigger immediate sync
POST /api/devices/:id/sync-users       → push current student+staff biometric IDs to device
  (needed when new student is enrolled or biometric is registered)

POST /api/devices/:id/enroll-user
  Body: { person_id, person_type } → device will prompt for fingerprint enrollment
  (actual fingerprint capture happens on the device itself)

GET  /api/devices/:id/punch-logs → raw punch log for debugging
GET  /api/devices/:id/unmapped   → punches with no matching person (biometric ID not registered)

─── Device Management UI (/settings/devices) ───

Table: Device Name | Type | Location | Status badge (Online/Offline/Error) | Last Sync | Students Registered | Actions

Status badge colors: green/red/gray with pulsing dot for Online

Per device card (click to expand):
  Connection details | Last sync time | Punch logs count | Unmapped IDs count
  
  Actions:
    Test Connection → shows result in toast
    Sync Now → progress indicator
    Sync Users → push all enrolled students/staff to device
    View Punch Logs → paginated raw log table
    View Unmapped → list of device IDs not linked to any person

"Register New Device" dialog:
  Device name, type (Fingerprint/RFID/GPS), brand
  IP Address, Port
  Location (e.g. "Main Gate", "Staff Entrance")
  Test connection button before saving
```

---

---

# ═══════════════════════════════════════════════
# PHASE 17 — Notification Service
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 17 GOAL: Dedicated notification service handling SMS, email, and push.
Decoupled from core API via BullMQ queue — never blocks business logic.

────────────────────────────────────────────────
STEP 17A — Notification Service
services/notification/
────────────────────────────────────────────────

services/notification/
├── src/
│   ├── workers/
│   │   ├── sms.worker.ts
│   │   ├── email.worker.ts
│   │   └── push.worker.ts
│   ├── providers/
│   │   ├── sms/
│   │   │   ├── sslwireless.provider.ts    → SSL Wireless BD
│   │   │   └── mock.provider.ts           → dev/testing mock
│   │   ├── email/
│   │   │   └── nodemailer.provider.ts
│   │   └── push/
│   │       └── webpush.provider.ts
│   ├── templates/
│   │   └── template.resolver.ts           → load from DB NotificationConfig
│   └── index.ts

All workers connect to the same Redis instance as the API.
Queue names:
  "notification:sms"    → sms.worker.ts
  "notification:email"  → email.worker.ts
  "notification:push"   → push.worker.ts

────────────────────────────────────────────────
STEP 17B — SMS Worker
────────────────────────────────────────────────

SMS Job payload interface:
interface SmsJob {
  trigger: NotificationTrigger
  recipients: Array<{ phone: string, name: string, lang?: 'BN' | 'EN' }>
  template_data: Record<string, string>  // variables for template
  schedule_at?: Date                     // optional delay
  bulk_id?: string                       // for tracking batch sends
}

sms.worker.ts:
  Process each job:
    1. Load NotificationConfig for trigger → check is_enabled
    2. Load template (BN or EN based on recipient lang)
    3. Resolve template variables: compile with template_data
    4. Call SSL Wireless provider
    5. On success: log to NotificationLog table
    6. On failure: retry up to 3 times (BullMQ retry config) → then log failure

SSL Wireless Provider:
  POST to https://sms.sslwireless.com/pushapi/dynamic/server.php
  Params: api_token, senderid, csmsid (unique), msg, msisdn
  Handle: rate limits (max N per second), character encoding (unicode for Bangla)
  BD phone normalization: ensure 88 country code: "88" + phone.replace(/^0/, '')

Bangla SMS template examples (from DB, configurable by admin):
  ABSENCE: "প্রিয় অভিভাবক, আজ {{date}} তারিখে {{student_name}} উপস্থিত নেই। যোগাযোগ করুন: {{school_phone}}"
  FEE_DUE: "{{student_name}} এর {{month}} মাসের বেতন বকেয়া আছে। মোট: ৳{{amount}}। দিন: {{school_name}}"
  RESULT: "{{student_name}} এর {{exam_name}} ফলাফল প্রকাশিত হয়েছে। GPA: {{gpa}}। পোর্টালে দেখুন।"

────────────────────────────────────────────────
STEP 17C — Email Worker
────────────────────────────────────────────────

Nodemailer with HTML email templates.
Templates in services/notification/src/email-templates/*.html (Handlebars)

Email types:
  welcome_student   → student portal login credentials
  fee_receipt       → payment receipt (attach PDF)
  result_published  → exam results with link to portal
  leave_approved    → staff leave approval
  admission_confirm → admission confirmation with admit card link

────────────────────────────────────────────────
STEP 17D — Push Notification Worker
────────────────────────────────────────────────

Web Push API using web-push npm package.

Add to Prisma schema:
model PushSubscription {
  id          String    @id @default(cuid())
  person_id   String
  person_type PersonType
  endpoint    String    @unique
  p256dh      String
  auth        String
  created_at  DateTime  @default(now())
}

Push job: send to all subscriptions for a person_id
On invalid subscription (410 Gone): auto-delete from DB

API endpoints:
POST /api/portal/push/subscribe  → save subscription
DELETE /api/portal/push/unsubscribe → remove

────────────────────────────────────────────────
STEP 17E — Notification Log
────────────────────────────────────────────────

Add to Prisma schema:
model NotificationLog {
  id            String              @id @default(cuid())
  trigger       NotificationTrigger
  channel       NotificationChannel
  recipient     String              // phone or email
  person_id     String?
  status        NotifLogStatus
  message       String?             @db.Text
  error_message String?
  sent_at       DateTime?
  created_at    DateTime            @default(now())
}

enum NotifLogStatus { QUEUED SENT FAILED SKIPPED }

Admin UI: /settings/notifications/logs
  Table: Channel | Trigger | Recipient | Status | Sent At | Message preview
  Filter: status, channel, date range
  Useful for debugging SMS delivery issues
```

---

---

# ═══════════════════════════════════════════════
# PHASE 18 — Final Integration & Production Prep
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists. Proceed.

PHASE 18 GOAL: Wire everything together, error handling,
security hardening, performance, deployment configuration.

────────────────────────────────────────────────
STEP 18A — Security Hardening
────────────────────────────────────────────────

Install and configure security middleware in apps/api:
  helmet.js                → security headers
  express-rate-limit       → rate limiting per IP + per user
  express-validator        → additional input sanitization
  cors                     → strict CORS config (only whitelist admin, portal, website URLs)

Rate limits:
  /api/auth/login          → 5 attempts per 15min per IP (ban for 1hr on exceeded)
  /api/auth/forgot-password → 3 per hour per phone
  /api/content/*           → 100 req/min per IP (public endpoints)
  /api/*                   → 60 req/min per user token

SQL injection: Prisma parameterized queries (already protected, add eslint rule banning raw SQL)
XSS: sanitize HTML input in notice body, page content (use DOMPurify on server)
File upload security:
  Validate MIME type server-side (not just extension)
  Max file size per type (image: 5MB, PDF: 10MB, template: 500KB)
  Scan for malicious content (magic bytes check)

Environment validation on startup (zod):
  Parse process.env against a Zod schema
  Throw on missing required vars (fail fast, not silently)

────────────────────────────────────────────────
STEP 18B — Performance
────────────────────────────────────────────────

Redis caching for heavy read endpoints:
  /api/content/* → cache 5-10 min (invalidated on publish)
  /api/settings/institution → cache 1hr
  /api/results/public/lookup → cache 30min
  Student dashboard aggregation → cache 5min

Database query optimization:
  Add missing indexes (audit with EXPLAIN ANALYZE on slow queries)
  Paginate all list endpoints (cursor or offset, never return unbounded arrays)
  Use Prisma select to avoid over-fetching (never return full models when partial suffices)
  Defer non-critical DB writes to queues (e.g. download count increment)

PDF generation:
  Queue heavy batch PDFs (>10 documents) via BullMQ instead of blocking the request
  Return a job_id → client polls GET /api/jobs/:id/status
  Stream small PDFs directly

────────────────────────────────────────────────
STEP 18C — Error Handling & Logging
────────────────────────────────────────────────

Logger: pino (fast structured JSON logging)
Log levels: error, warn, info, debug
Log format: { timestamp, level, message, requestId, userId, duration, ...context }

Global error handler (middleware/errorHandler.ts):
  Catch all unhandled errors
  Map Prisma errors to API error codes:
    P2002 (unique constraint) → 409 CONFLICT
    P2025 (not found) → 404 NOT_FOUND
    P2003 (foreign key) → 422 UNPROCESSABLE
  Never expose stack traces in production responses
  Log all 5xx errors to error log

Request ID middleware:
  Attach unique UUID to every request → include in all log lines
  Return as X-Request-ID response header

Health check endpoints:
  GET /api/health → { status: "ok", uptime, db: "connected", redis: "connected" }
  GET /api/health/detailed → + version, memory usage (admin only)

────────────────────────────────────────────────
STEP 18D — Docker & Deployment Config
────────────────────────────────────────────────

Create Dockerfiles:
  server/api/Dockerfile        → Node.js API (include Chromium for Puppeteer)
  apps/admin/Dockerfile        → Next.js admin app
  apps/portal/Dockerfile       → Next.js portal PWA
  apps/website/Dockerfile      → Next.js public website
  services/device/Dockerfile   → Device integration service
  services/notification/Dockerfile → Notification service

docker-compose.yml (for local development):
  Services: postgres, redis, api, admin, portal, website, device-service, notification-service
  Volumes: postgres data, redis data
  Network: internal bridge

docker-compose.prod.yml (production overrides):
  Resource limits per container
  Restart policies
  Health checks

.dockerignore files for each app.

Create Makefile with shortcuts:
  make dev        → docker compose up (dev)
  make build      → build all images
  make migrate    → run prisma migrate deploy in api container
  make seed       → run seed in api container
  make logs       → tail all container logs
  make shell-api  → exec into api container

────────────────────────────────────────────────
STEP 18E — Seed Data (comprehensive)
────────────────────────────────────────────────

Enhance packages/db/prisma/seed.ts with realistic demo data:

1. Institution:
   Name EN: "Alhumaira Model School & College"
   Name BN: "আলহুমাইরা মডেল স্কুল অ্যান্ড কলেজ"
   Type: SCHOOL, EIIN: "123456", Board: "Chittagong"
   Primary color: "#1a3c4a"

2. Student ID Config:
   Prefix: "ALh", include_year: true, year_format: "2", include_month: false,
   separator: "-", sequence_digits: 4 → generates: ALh-26-0001

3. Academic Year: 2026-2027, is_active=true

4. Shifts: Morning (07:30-12:30), Day (12:30-17:30)

5. Classes: Class 6, 7, 8, 9, 10 (for school type)
   Each with 2 sections (A, B) assigned to Morning shift

6. Subjects for Class 9 & 10 (BD curriculum):
   Bangla 1st Paper, Bangla 2nd Paper, English 1st Paper, English 2nd Paper,
   Mathematics, Physics, Chemistry, Biology (optional), Higher Math (optional),
   ICT, Bangladesh & Global Studies, Religion

7. Grading scale: BD Board Standard (A+ to F)

8. Exam Types: Class Test (weight 20%), Half Yearly (30%), Annual Final (50%)

9. Users (staff + admin accounts):
   Admin: phone=01700000000, password=Admin@1234, role=ADMIN
   Principal: phone=01700000001, password=Test@1234, role=PRINCIPAL
   Exam Controller: phone=01700000002, password=Test@1234, role=EXAM_CONTROLLER
   Accountant: phone=01700000003, password=Test@1234, role=ACCOUNTANT
   Teacher 1: phone=01700000004, password=Test@1234, role=CLASS_TEACHER
   Teacher 2: phone=01700000005, password=Test@1234, role=SUBJECT_TEACHER

10. Demo Students (20 students across Class 9 Section A):
    With realistic Bangla names, guardians, and student UIDs (ALh-26-0001 through ALh-26-0020)
    Assign subjects, create some attendance records, create some invoice records

11. Default Authority Signatures (placeholder — admin will replace with real ones):
    Principal, Exam Controller (name only, no image uploaded — shows blank signature line)

12. Default Document Templates: copy default HTML templates from server/api/src/templates/defaults/
    Store in DocumentTemplate table as the initial active templates

────────────────────────────────────────────────
STEP 18F — Testing
────────────────────────────────────────────────

Unit tests (Jest):
  packages/validators/ — test all Zod schemas with valid + invalid inputs
  server/api/src/utils/grading.engine.ts — comprehensive grade calculation tests
  server/api/src/utils/student-id.generator.ts — format generation tests
  server/api/src/services/ — fee calculation, late fee rule tests

Integration tests (Supertest + test database):
  Auth endpoints: login, refresh, change password
  Student CRUD with ID generation
  Attendance mark + conflict resolution
  Mark entry → approval → publish flow
  Fee collection + payment webhook simulation

E2E tests (Playwright — optional, for critical paths):
  Admin login → create student → mark attendance → view student profile
  Student portal login → view result → pay fee

Run tests:
  pnpm test                 → unit tests all packages
  pnpm test:integration     → integration tests (requires test DB)
  pnpm test:coverage        → coverage report

────────────────────────────────────────────────
STEP 18G — README.md (root)
────────────────────────────────────────────────

Create comprehensive README.md at project root:

Sections:
  # Education ERP
  ## Overview (what this system does)
  ## Architecture (diagram + tech stack table)
  ## Repository Structure
  ## Quick Start (clone → env setup → docker compose up → seed → access URLs)
  ## Development Guide (per-app dev commands)
  ## Environment Variables (complete reference)
  ## Database (schema overview, migration guide)
  ## API Documentation (link to Postman collection)
  ## Deployment (Docker, production checklist)
  ## Default Login Credentials (for demo/testing)
  ## Module Status (phase completion checklist)
```

---

---

## 📌 Full Phase Tracker

```
[ ] PHASE 0  — Turborepo setup, Prisma schema, seed data
[ ] PHASE 1  — Settings system (full — institution, student ID, grading, templates, signatures)
[ ] PHASE 2  — Auth + Login UI
[ ] PHASE 3  — Student module (CRUD + 360° profile)
[ ] PHASE 4  — Subjects + Teacher assignment
[ ] PHASE 5  — Attendance (manual + reports + exports)
[ ] PHASE 6  — Examination + Mark entry + Grading engine
[ ] PHASE 7  — Results + Report cards + Public lookup
[ ] PHASE 8  — Fee & Finance + Payment gateways
[ ] PHASE 9  — Online Admission (cycle + form + processing + auto-enroll)
[ ] PHASE 10 — Document generation (all 15 document types)
[ ] PHASE 11 — Website Maintenance module + Public website (apps/website)
[ ] PHASE 12 — HR + Payroll
[ ] PHASE 13 — Library + Transport + Hostel
[ ] PHASE 14 — Analytics + Reporting dashboard
[ ] PHASE 15 — Student/Guardian Portal (PWA)
[ ] PHASE 16 — IoT / Biometric device service
[ ] PHASE 17 — Notification service (SMS + email + push)
[ ] PHASE 18 — Security + Performance + Docker + Testing + README
```

---

## 🔁 Start of Each Claude Code Session

Paste this at the start of EVERY new Claude Code session:
```
Read CLAUDE.md from this project root fully.
Then check what already exists by running: ls -la && ls apps/ && ls server/ && ls services/ && ls packages/db/prisma/ 2>/dev/null
Tell me exactly:
1. What is already built
2. What phase we are on
3. What remains to do in the current phase
Then continue building — do not restart anything already built.
```

---

*AshDevs · Education ERP · Phases 9–18 Complete · July 2026*
