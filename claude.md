# 🏫 Education ERP — CLAUDE.md
# Master Context File · Read this ENTIRELY before writing a single line of code

---

## ⚡ MANDATORY FIRST STEP — Do This Every Session

Before writing ANY code, run these checks in order:

```bash
# 1. Check what already exists
ls -la
cat package.json 2>/dev/null || echo "NO package.json YET"

# 2. Check database state
ls packages/db/prisma/ 2>/dev/null || echo "NO PRISMA YET"

# 3. Check which apps exist
ls apps/ 2>/dev/null || echo "NO APPS YET"

# 4. Check what services exist
ls services/ 2>/dev/null || echo "NO SERVICES YET"

# 5. Check .env files
ls .env* 2>/dev/null || echo "NO ENV FILES YET"
```

Then tell the user:
- ✅ What has already been built
- 🔲 What is missing from the current phase
- 📋 Your exact plan before starting

**NEVER assume. ALWAYS check first.**

---

## 🎯 Project Summary

**Product:** Single-institution Education ERP + Institution Website  
**Client:** A single institution (school / college / university / madrasah — configured at setup)  
**Stack:** Turborepo monorepo, Next.js 14, Node/Express, PostgreSQL, Prisma  
**Status:** ⚠️ NO multi-tenancy for now. One institution. One database.  
**Goal:** Professional, production-grade system a company can deploy for a client

---

## 🏗️ Repository Structure

```
education-erp/
├── apps/
│   ├── admin/              → Next.js 14 App Router (ERP Admin Panel)
│   ├── portal/             → Next.js 14 App Router + PWA (Student/Guardian Portal)
│   └── website/            → Next.js 14 App Router + ISR (Public Institution Website)
├── packages/
│   ├── db/                 → Prisma schema + generated client (SINGLE SOURCE OF TRUTH)
│   ├── types/              → Shared TypeScript interfaces & enums
│   ├── validators/         → Shared Zod schemas used by API + frontend
│   ├── ui/                 → Shared React component library (shadcn/ui based)
│   └── config/             → Shared tsconfig, eslint, tailwind base configs
├── server/
│   └── api/                → Node.js + Express (Core API — all business logic)
├── services/
│   ├── device/             → IoT/Biometric integration (ZKTeco/ADMS)
│   └── notification/       → SMS, Email, Push (BullMQ workers)
├── .env.example            → All required env vars documented
├── turbo.json
├── package.json            → Root workspace (pnpm)
└── CLAUDE.md               ← THIS FILE
```

---

## ⚙️ Tech Stack — NEVER Deviate

| Layer | Technology | Notes |
|-------|-----------|-------|
| Package Manager | **pnpm** | Never npm or yarn |
| Monorepo | **Turborepo** | turbo.json at root |
| Frontend | **Next.js 14** (App Router) | All 3 frontend apps |
| Styling | **Tailwind CSS** + **shadcn/ui** | No other UI library |
| Forms | **React Hook Form** + **Zod** | No other form lib |
| State | **Zustand** (global) + **TanStack Query** (server) | No Redux |
| Tables | **TanStack Table v8** | All data tables |
| Charts | **Recharts** | All charts/graphs |
| Backend | **Node.js** + **Express.js** + **TypeScript** | server/api/ |
| ORM | **Prisma** | packages/db/ |
| Database | **PostgreSQL** | Primary data store |
| Cache/Queue | **Redis** + **BullMQ** | Jobs, sessions, queues |
| Real-time | **Socket.io** | Live attendance, notifications |
| PDF | **Puppeteer** | HTML → PDF with Bangla support |
| File Storage | **Azure Blob Storage** | Photos, docs, templates |
| Auth | **JWT** (access 15min + refresh 7d) | bcrypt for passwords |
| Dates | **date-fns** | Never moment.js |
| HTTP Client | **Axios** | Frontend → API calls |
| Validation | **Zod** | Shared between API + frontend |
| Emails | **Nodemailer** | SMTP |
| SMS | **SSL Wireless BD** | Primary BD SMS gateway |

---

## 🗄️ Database Rules (Strict)

```
✅ Use cuid() for all primary keys
✅ Soft deletes: deleted_at DateTime? on all major entities
✅ Audit columns: created_at, updated_at, created_by_id, updated_by_id on all tables
✅ Indexes on all foreign keys and commonly queried columns
✅ No hardcoded values — everything comes from Settings tables
✅ Use Prisma transactions for multi-table operations
✅ Seed file at packages/db/prisma/seed.ts for initial data
❌ No raw SQL unless performance-critical with explanation
❌ Never hard-delete student, staff, exam, or result data
```

---

## 🔐 Role-Based Access Control (RBAC)

### All Roles
```typescript
enum UserRole {
  SUPER_ADMIN       // Platform owner (AshDevs) — full access
  ADMIN             // Institution admin — full institution access
  PRINCIPAL         // Academic + website + staff oversight
  VICE_PRINCIPAL    // Deputy to Principal
  EXAM_CONTROLLER   // Exam creation, mark approval, result publish
  HEAD_OF_DEPT      // Department-scoped academic access
  CLASS_TEACHER     // Own class: attendance, marks, homework
  SUBJECT_TEACHER   // Own subjects: marks entry, homework
  ACCOUNTANT        // Finance module only
  LIBRARIAN         // Library module only
  TRANSPORT_MANAGER // Transport module only
  HOSTEL_MANAGER    // Hostel module only
  PROCTOR           // University: student discipline & conduct
  REGISTRAR         // University: enrollment, records, certificates
  IT_ADMIN          // Settings, user management
  STUDENT           // Own data: portal access only
  GUARDIAN          // Child's data: portal access only
}
```

### Middleware Pattern (Always follow this)
```typescript
// server/api/src/middleware/
// Every protected route:
router.use(authenticate)              // verify JWT → attach req.user
router.use(authorize(['ADMIN','PRINCIPAL'])) // check roles
// Data-scope filtering happens in service layer, not middleware
```

### Permission Matrix (Important)
```
Settings (institution config):     ADMIN, IT_ADMIN
Settings (academic config):        ADMIN, PRINCIPAL, EXAM_CONTROLLER
Student CRUD:                      ADMIN, PRINCIPAL, REGISTRAR
Mark Entry:                        SUBJECT_TEACHER (own subjects only), EXAM_CONTROLLER
Mark Approval:                     EXAM_CONTROLLER, PRINCIPAL
Result Publish:                    EXAM_CONTROLLER, PRINCIPAL, ADMIN
Attendance Mark:                   CLASS_TEACHER, SUBJECT_TEACHER, ADMIN
Fee Collection:                    ACCOUNTANT, ADMIN
Payroll:                           ACCOUNTANT, ADMIN
Website Content:                   ADMIN, PRINCIPAL, IT_ADMIN
HR Management:                     ADMIN, PRINCIPAL
```

---

## ⚙️ Settings Architecture (CRITICAL — Read Carefully)

**Everything configurable must live in the Settings system. No hardcoded values.**

The Settings system has these tables:

```
InstitutionProfile      → Name, logo, type, EIIN, address, contact
InstitutionConfig       → Type-specific config (school vs university)
StudentIdConfig         → Student ID format rules
AcademicConfig          → Year structure, grading system
GradingScale            → Custom grade ranges (fully configurable)
ExamTypeConfig          → What exam types exist and their rules
MarkRules               → Subject pass marks, mark distribution rules
FeeRules                → Late fee amounts, due dates, fine rules
AuthorityConfig         → Who signs what document (by role)
AuthoritySignature      → Uploaded signature images per authority
DocumentTemplate        → HTML templates per document type
NotificationConfig      → SMS templates, triggers on/off
AttendanceRules         → Working days, min attendance %, late rules
```

### Institution Type — Changes Everything
```
SCHOOL      → Classes (1–10), Sections, Shifts, Board exams, GPA grading
COLLEGE     → Classes (11–12 / HSC), Sections, Board, GPA grading  
UNIVERSITY  → Departments, Programs, Semesters, CGPA, Extra course enrollment
MADRASAH    → Dakhil/Alim/Fazil/Kamil classes, Hijri calendar awareness, board
```

When institution type is set:
- Navigation labels change (e.g. "Class" → "Semester", "Section" → "Batch")
- Grading preset changes (BD Board GPA vs CGPA 4.0)
- Available exam types change
- Authority titles change (Headmaster → Principal → Vice Chancellor)
- Academic calendar type changes

### Student ID Format Config
```typescript
// Admin sets this in Settings → Student ID Configuration
interface StudentIdConfig {
  prefix: string           // e.g. "ALh", "ASH", "DU"
  include_year: boolean    // include admission year
  year_format: '2' | '4'  // "24" or "2024"
  include_month: boolean   // include admission month
  separator: string        // "-" or "/" or ""
  sequence_digits: number  // 4 = 0001, 5 = 00001
  sequence_scope: 'GLOBAL' | 'YEARLY' | 'CLASS' // reset per year/class?
  preview: string          // auto-computed: "ALh-24-09-00142"
}
// Generated ID examples:
// ALh-24-09-00142  (prefix-year-month-seq)
// ASH-2024-00001   (prefix-fullyear-seq)
// DU-CS-2024-001   (prefix-dept-year-seq)
```

### Grading Scale Config
```typescript
// Admin sets in Settings → Grading System
// Default BD Board preset (can be edited):
interface GradeRange {
  min_marks: number     // 80
  max_marks: number     // 100
  grade_letter: string  // "A+"
  grade_point: number   // 5.00
  remarks: string       // "Excellent"
}
// Admin can add/edit/delete rows
// System validates no gaps or overlaps
// Multiple presets can be saved and switched per exam
```

---

## 📁 API Module Structure

```
server/api/src/
├── modules/
│   ├── auth/                   auth.routes  .controller  .service
│   ├── settings/               (sub-modules below)
│   │   ├── institution/        profile, type, logo, contact
│   │   ├── academic/           years, shifts, classes, sections, departments
│   │   ├── subjects/           subjects, assignments
│   │   ├── student-id/         ID format config
│   │   ├── grading/            grading scales, presets
│   │   ├── exam-config/        exam types, mark rules
│   │   ├── fee-rules/          late fee, fine rules
│   │   ├── templates/          document templates upload
│   │   ├── signatures/         authority signatures
│   │   ├── notifications/      SMS templates, triggers
│   │   └── users/              staff accounts, roles
│   ├── students/               CRUD, 360 profile, promotion, bulk
│   ├── guardians/              guardian CRUD
│   ├── attendance/             manual mark, reports, exports
│   ├── examination/            exam setup, seat plan
│   ├── marks/                  entry, approval workflow
│   ├── results/                calculation, publish, public lookup
│   ├── fees/                   structure, invoices, collection
│   ├── payments/               gateway adapters, webhooks
│   ├── payroll/                salary, payslip generation
│   ├── hr/                     staff, leave, recruitment
│   ├── admission/              cycles, applications, processing
│   ├── website/                content management (notices, slider, gallery)
│   ├── documents/              PDF generation for all doc types
│   ├── library/                books, issue/return
│   ├── transport/              routes, vehicles, GPS
│   ├── hostel/                 rooms, allocation
│   └── reports/                analytics, exports
├── middleware/
│   ├── authenticate.ts
│   ├── authorize.ts
│   ├── validate.ts             (Zod validation middleware)
│   ├── asyncHandler.ts
│   └── errorHandler.ts
├── services/
│   ├── pdf.service.ts
│   ├── storage.service.ts      (Azure Blob)
│   ├── sms.service.ts
│   ├── email.service.ts
│   └── payment/
│       ├── gateway.interface.ts
│       ├── bkash.adapter.ts
│       ├── nagad.adapter.ts
│       └── sslcommerz.adapter.ts
├── utils/
│   ├── student-id.generator.ts
│   ├── grading.engine.ts
│   ├── pagination.ts
│   └── date.utils.ts
├── jobs/                       BullMQ job definitions
│   ├── sms.job.ts
│   ├── email.job.ts
│   ├── pdf.job.ts
│   └── device-sync.job.ts
├── sockets/                    Socket.io handlers
│   ├── attendance.socket.ts
│   └── notifications.socket.ts
└── app.ts
```

---

## 🎨 Frontend Architecture — Admin Panel (apps/admin)

### Folder Structure
```
apps/admin/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── forgot-password/
│   ├── (dashboard)/
│   │   ├── layout.tsx              → Sidebar + topnav shell
│   │   ├── page.tsx                → Main dashboard
│   │   ├── settings/               → All settings (sub-routes below)
│   │   │   ├── institution/        → Profile, type, branding
│   │   │   ├── academic/           → Year, shifts, classes, sections
│   │   │   ├── subjects/           → Subjects + teacher assignment
│   │   │   ├── student-id/         → ID format config
│   │   │   ├── grading/            → Grading scale editor
│   │   │   ├── exam-config/        → Exam types + mark rules
│   │   │   ├── fee-rules/          → Fee rules, late fees
│   │   │   ├── templates/          → Document templates
│   │   │   ├── signatures/         → Authority signatures
│   │   │   ├── users/              → Staff accounts
│   │   │   └── notifications/      → SMS/email templates
│   │   ├── students/               → Student management
│   │   ├── attendance/             → Attendance marking + reports
│   │   ├── examination/            → Exam management
│   │   ├── marks/                  → Mark entry + approval
│   │   ├── results/                → Result publish + reports
│   │   ├── admission/              → Online admission management
│   │   ├── fees/                   → Fee collection + reports
│   │   ├── payroll/                → Salary + payslips
│   │   ├── hr/                     → Staff management + leave
│   │   ├── library/                → Books + issue/return
│   │   ├── transport/              → Routes + vehicles
│   │   ├── hostel/                 → Room + allocation
│   │   ├── website/                → Website content management
│   │   ├── documents/              → Bulk print panel
│   │   └── reports/                → Analytics dashboard
├── components/
│   ├── layout/                     → Sidebar, Topnav, Breadcrumb
│   ├── shared/                     → Reusable across all pages
│   └── [module]/                   → Module-specific components
├── hooks/                          → Custom React hooks
├── lib/
│   ├── api.ts                      → Axios instance with interceptors
│   ├── auth.ts                     → Auth helpers
│   └── utils.ts
└── stores/                         → Zustand stores
```

### UI Design System
```
Primary color:    Pulled from InstitutionConfig.primary_color (admin sets this)
Font:             Inter (Latin), Noto Sans Bengali (Bangla text)
Sidebar width:    260px (collapsed: 60px icon-only)
Top nav height:   60px
Page padding:     24px
Card radius:      8px
Table row height: 52px

shadcn/ui components to use:
  - Button, Input, Label, Select, Checkbox, Switch, Textarea
  - Table, DataTable (TanStack wrapper)
  - Dialog, AlertDialog, Sheet (side panel)
  - Tabs, Accordion
  - Form (react-hook-form integration)
  - Badge, Avatar, Skeleton
  - Toast (via Sonner)
  - Calendar, DatePicker
  - Command (search/combobox)
  - DropdownMenu, ContextMenu
  - Progress, Separator, Tooltip
```

### Page Pattern (All admin pages follow this)
```tsx
// Every page:
// 1. Page header with breadcrumb + action button (if applicable)
// 2. Filter bar (if list page)
// 3. Main content (table / form / cards)
// 4. Pagination (server-side)

export default function StudentsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Students"
        subtitle="Manage all enrolled students"
        action={<Button>+ Add Student</Button>}
        breadcrumbs={[{ label: 'Students' }]}
      />
      <FilterBar filters={[...]} />
      <DataTable columns={columns} data={data} pagination={...} />
    </PageWrapper>
  )
}
```

---

## 📄 PDF Generation Rules

```typescript
// ALWAYS use this pattern — no exceptions
// server/api/src/services/pdf.service.ts

async function renderDocument(
  docType: DocumentType,
  data: Record<string, any>
): Promise<Buffer> {
  // 1. Get institution branding
  const institution = await getInstitutionProfile()
  // 2. Get active template for this docType
  const template = await getActiveTemplate(docType)
  // 3. Get active authority signatures for this docType
  const signatures = await getSignaturesForDoc(docType)
  // 4. Merge all data
  const renderData = { ...data, institution, signatures }
  // 5. Compile Handlebars template
  const html = Handlebars.compile(template.html_content)(renderData)
  // 6. Puppeteer render
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
  })
  await browser.close()
  return Buffer.from(pdf)
}
```

**Bangla rendering — CRITICAL:**
```html
<!-- Include in ALL document templates -->
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { font-family: 'Noto Sans Bengali', 'Arial', sans-serif; }
</style>
```

---

## 🌐 Website ↔ API Integration

```
apps/website reads from: GET /api/content/*  (public, no auth)
Admin publishes → API triggers ISR revalidation:
  await fetch(`${WEBSITE_URL}/api/revalidate?secret=${SECRET}&path=/notices`, { method: 'POST' })
Website NEVER writes data — read-only consumer.
```

---

## 🎓 Subject Inheritance Rules (IMPORTANT)

```
When a student is assigned to a class:
→ All COMPULSORY subjects of that class are automatically inherited (linked)
→ OPTIONAL/ELECTIVE subjects are shown as a selection list for the admin to choose from
→ For UNIVERSITY type: additional "extra courses" can be added on top
→ Subject-to-teacher assignment (SubjectTeacherAssignment) determines who can enter marks
→ Changing a student's class triggers re-evaluation of subject assignments
→ Historical subject assignments are PRESERVED (for old result records)
```

---

## 💰 Fee & Late Fee Rules (Settings-Driven)

```typescript
// FeeRules table — fully configurable from Settings
interface FeeRules {
  late_fee_enabled: boolean
  late_fee_type: 'FIXED' | 'PERCENTAGE' | 'DAILY'
  late_fee_amount: number          // fixed amount OR percentage
  late_fee_daily_cap: number       // max total fine
  grace_period_days: number        // days after due date before fine starts
  fine_on_exam_fee: boolean        // apply fine to exam fee too?
  block_result_if_due: boolean     // block result card if dues pending?
  block_admit_if_due: boolean      // block admit card if dues pending?
  partial_payment_allowed: boolean
}
```

---

## 🧮 Accounts Module Rules (Double-Entry — Phase 8B)

```
Every money movement in the system MUST create a journal entry:
  ✅ Fee payment collected  → auto-journal via auto-journal.service.ts
  ✅ Payroll paid           → auto-journal via auto-journal.service.ts
  ✅ Asset purchased        → auto-journal via auto-journal.service.ts
  ✅ Inventory GRN received → auto-journal via auto-journal.service.ts
  ✅ Asset depreciation     → auto-journal via auto-journal.service.ts (createDepreciationJournal)
  ✅ Asset disposed         → auto-journal via auto-journal.service.ts (createAssetDisposalJournal)
  ❌ NEVER manually create vouchers from other modules
  ❌ NEVER bypass auto-journal.service.ts — it is the ONLY place allowed to
     construct a system-triggered Voucher

Double-entry validation:
  Every Voucher's JournalEntries MUST balance: total_debit == total_credit
  Enforced at API level (400 error if unbalanced) — see validateBalance() in
  voucher-helpers.ts
  Frontend disables Save button if unbalanced (see vouchers/new/page.tsx)

Voucher workflow (manual vouchers only — auto-journals skip straight to POSTED):
  DRAFT → APPROVED → POSTED
  Only DRAFT vouchers can be edited or deleted; only POSTED vouchers count
  toward ledger/trial-balance/financial-statement queries.

Balance sheet — contra accounts:
  A contra-asset account (e.g. 1105 Accumulated Depreciation — CREDIT_NORMAL,
  grouped under ASSET) must be SUBTRACTED from its section total, never
  added, even though it displays a positive balance in its own natural
  direction. Any account whose account_nature doesn't match its group's
  expected nature (ASSET→DEBIT_NORMAL, LIABILITY/EQUITY→CREDIT_NORMAL) is a
  contra account and follows this rule.

Balance sheet — mid-year equation:
  Assets = Liabilities + Equity must hold at ANY point in time, not just
  after a formal year-end close. Fold the current period's unclosed net
  income (Income − Expense to date) into Equity as an implicit
  "Current Year Earnings" line on every balance-sheet request.

Account codes (system-reserved, never delete or change code):
  1001 = Cash in Hand
  1002 = Cash at Bank
  1105 = Accumulated Depreciation (contra-asset)
  2001 = Accounts Payable
  2002 = TDS Payable
  2004 = Salary Payable
  3004 = Surplus/Deficit
  4001 = Tuition Fee Income
  5001 = Salary Expense (Teaching)
  5018 = Depreciation Expense
  5020 = Loss on Disposal of Asset

Fee-category → income-account mapping lives in FeeAccountMapping (Settings
table, editable at Settings → Accounts → Fee Mapping) — never hardcode which
account a fee category posts to.
```

---

## 📦 Inventory Module Rules (Fixed Assets + Stock — Phase 8C)

```
Stock never goes negative:
  Always validate: quantity_to_issue <= current_stock
  Return 400 (VALIDATION_ERROR) if insufficient stock — see
  /api/inventory/stock/issue

Asset depreciation:
  Method: Straight Line Method (SLM) by default
  Formula: Annual Dep = Purchase Price × (Rate / 100); Monthly Dep = Annual / 12
  Stop depreciating when book_value reaches 0 — never negative
  One DepreciationEntry per asset per period (unique on asset_id+period);
  one consolidated Voucher per depreciation run across all assets in that run

Purchase workflow:
  Requisition → Purchase Order → GRN (mandatory for audit trail)
  GRN is the ONLY trigger for: stock increment, asset creation, and the
  accounts auto-journal
  Never add stock or create an asset without a GRN (except a manual stock
  adjustment via /stock/adjust, which is audit-logged but doesn't touch accounts)
  A PO can be received across multiple partial GRNs; status moves
  DRAFT → APPROVED → PARTIALLY_RECEIVED → RECEIVED

Asset UID / QR codes:
  Every asset gets a unique asset_uid and a QR code on creation
  QR code URL points to /inventory/assets/{asset_uid} (admin)
  Asset creation MUST go through createWithUniqueAssetUid() (asset-id.generator.ts),
  which retries the whole generate+create cycle on a unique-constraint
  collision — never generate a candidate UID and create() separately, that
  has a TOCTOU race under concurrent requests
```

---

## 📝 Exam & Mark Rules (Settings-Driven)

```typescript
// ExamTypeConfig — admin creates exam types
interface ExamTypeConfig {
  name: string                    // "Half Yearly", "Final", "Class Test"
  code: string                    // "HALF", "FINAL", "CT"
  weight_in_final: number         // % contribution to annual result
  allows_absent_marking: boolean
  has_practical: boolean
  practical_marks_separate: boolean
}

// MarkRules per subject per exam type
interface MarkRules {
  full_marks_theory: number
  full_marks_practical: number
  pass_marks_theory: number
  pass_marks_practical: number
  pass_marks_combined: number
  fourth_subject_rule: boolean    // BD SSC/HSC: exclude worst optional subject
}
```

---

## 🚀 Development Commands

```bash
# Install all dependencies
pnpm install

# Run everything in dev mode
pnpm dev

# Run only API
pnpm dev --filter=api

# Run only admin panel
pnpm dev --filter=admin

# Prisma: generate after schema change
pnpm --filter=db prisma generate

# Prisma: create migration
pnpm --filter=db prisma migrate dev --name "migration_name"

# Prisma: seed database
pnpm --filter=db prisma db seed

# Build all
pnpm build

# Lint all
pnpm lint
```

---

## 🌍 Environment Variables (.env.example at root)

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/education_erp"
REDIS_URL="redis://localhost:6379"

# Auth
JWT_ACCESS_SECRET="your-access-secret-min-32-chars"
JWT_REFRESH_SECRET="your-refresh-secret-min-32-chars"
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"

# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=""
AZURE_BLOB_CONTAINER_NAME="education-erp"

# SMS (SSL Wireless BD)
SMS_API_URL="https://sms.sslwireless.com/pushapi/dynamic/server.php"
SMS_API_TOKEN=""
SMS_SID=""

# Email
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noreply@institution.edu.bd"

# Payment Gateways
BKASH_APP_KEY=""
BKASH_APP_SECRET=""
BKASH_USERNAME=""
BKASH_PASSWORD=""
BKASH_SANDBOX=true

NAGAD_MERCHANT_ID=""
NAGAD_MERCHANT_PRIVATE_KEY=""
NAGAD_SANDBOX=true

SSLCOMMERZ_STORE_ID=""
SSLCOMMERZ_STORE_PASSWORD=""
SSLCOMMERZ_SANDBOX=true

# App URLs
ADMIN_URL="http://localhost:3000"
PORTAL_URL="http://localhost:3001"
WEBSITE_URL="http://localhost:3002"
API_URL="http://localhost:4000"
WEBSITE_REVALIDATE_SECRET="your-revalidate-secret"

# Puppeteer
PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"

# Google Fonts (for PDF Bengali rendering)
GOOGLE_FONTS_KEY=""
```

---

## 🔢 API Response Format (Always follow)

```typescript
// Success
{
  "success": true,
  "data": { ... },          // or array
  "message": "...",         // optional
  "meta": {                 // only for paginated lists
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",   // error code enum
    "message": "Human readable",
    "details": [...]              // optional: field-level errors
  }
}

// HTTP Status codes:
// 200 OK, 201 Created, 204 No Content
// 400 Bad Request (validation), 401 Unauthorized
// 403 Forbidden (no permission), 404 Not Found
// 409 Conflict (duplicate), 422 Unprocessable
// 500 Internal Server Error
```

---

## ✅ Code Quality Rules

```
✅ TypeScript strict mode — zero `any` types
✅ Every route handler wrapped in asyncHandler()
✅ Zod validation on EVERY API input
✅ Consistent error codes (define ERROR_CODES enum)
✅ No console.log in production code — use a logger (pino)
✅ Conventional commits: feat: / fix: / chore: / refactor:
✅ Comment complex business logic (grading engine, ID generation)
✅ Write unit tests for: grading engine, ID generator, fee calculator
✅ .env.example stays up to date
✅ Sensitive actions logged via logAudit() (lib/audit-log.ts) — login/logout,
   mark entry submit, result approve/publish, fee waiver, student delete,
   role change, template activate. Never throws into the caller.
❌ No hardcoded institution-specific values anywhere in code
❌ No synchronous file I/O
❌ No unhandled promise rejections
```

---

## 🇧🇩 Bangladesh Requirements (Always Apply)

```
✅ All PDFs support Bangla text (Noto Sans Bengali)
✅ Phone format validation: 01XXXXXXXXX (11 digits)
✅ Date display: DD/MM/YYYY for documents, ISO for API
✅ Default grading: BD SSC/HSC GPA scale (configurable)
✅ EIIN field on institution profile (mandatory)
✅ bKash/Nagad as primary payment methods
✅ SSL Wireless as primary SMS gateway
✅ Hijri calendar display (optional, for madrasah type)
✅ Bangla numeral support in generated documents (optional toggle)
```

---

## 📌 CURRENT PHASE TRACKER

Update this section as phases complete:

```
[x] PHASE 0  — Repo init, Turborepo setup, DB schema, env
[x] PHASE 1  — Settings system (FULL — all config tables + UI)
[x] PHASE 2  — Auth + User management
[x] PHASE 3  — Student module (CRUD + 360° profile)
[x] PHASE 4  — Subject system + Teacher assignment
[x] PHASE 5  — Attendance (manual + biometric)
[x] PHASE 6  — Examination + Mark entry + Grading engine
[x] PHASE 7  — Results + Report cards + Public result page
[x] PHASE 8  — Fee & Finance module
[x] PHASE 8B — Accounts (double-entry: journals, ledger, trial balance,
               income+expenditure, balance sheet, bank reconciliation, TDS)
[x] PHASE 8C — Inventory & Assets (fixed assets, depreciation, consumable
               stock, purchase workflow: REQ→PO→GRN, supplier management)
[x] PHASE 9  — Online Admission
[x] PHASE 10 — Document generation (all doc types)
[x] PHASE 11 — Website Maintenance module (public-facing ISR pages built
               here too — Phase 16 below was folded into this phase)
[x] PHASE 12 — HR + Payroll
[x] PHASE 13 — Library + Transport + Hostel
[x] PHASE 14 — Analytics dashboard
[x] PHASE 15 — Student/Guardian Portal (PWA)
[x] PHASE 16 — Public Website (ISR) — delivered as part of Phase 11, see above
[x] PHASE 17 — IoT/Biometric device service
[x] PHASE 18 — Notification service
[ ] PHASE 19 — Mobile apps (Flutter) — FUTURE
[x] PHASE 20 — Production hardening (env validation, rate limiting, upload
               magic-byte checks, response sanitization, Docker for all 6
               services, CI, README, vitest suite) — not in the original
               19-phase plan, added because a production deploy needs it
```

---

*Last updated: July 2026 | AshDevs*