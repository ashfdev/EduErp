# 📋 Phase-by-Phase Prompts for Claude Code
# Education ERP — Complete Build Guide

---

## HOW TO USE THIS FILE

1. Open Claude Code in your project folder (where CLAUDE.md lives)
2. Copy the **entire prompt block** for the current phase
3. Paste it into Claude Code
4. Wait for it to complete + test before going to the next phase
5. Mark phases complete in CLAUDE.md after each one

**Rule:** Always paste the phase header line first so Claude Code knows context.

---

---

# ═══════════════════════════════════════════════
# PHASE 0 — Project Foundation
# ═══════════════════════════════════════════════

```
Read CLAUDE.md fully first. Then check what already exists (run ls, check package.json).
Tell me exactly what exists and what you are about to create. Then proceed.

PHASE 0 GOAL: Set up the complete Turborepo monorepo with all packages, 
configure shared tooling, create the complete Prisma schema, and seed initial data.

────────────────────────────────────────────────────
STEP 0A — Turborepo Monorepo Init
────────────────────────────────────────────────────

Create the full monorepo structure from CLAUDE.md using pnpm.

Root package.json:
  name: "education-erp"
  private: true
  scripts:
    dev: turbo dev
    build: turbo build
    lint: turbo lint
    db:generate: pnpm --filter=db prisma generate
    db:migrate: pnpm --filter=db prisma migrate dev
    db:seed: pnpm --filter=db prisma db seed
    db:studio: pnpm --filter=db prisma studio

turbo.json pipelines:
  build: depends on ^build, outputs: .next/**, dist/**
  dev: persistent: true, cache: false
  lint: outputs: []

pnpm-workspace.yaml:
  packages: ["apps/*", "packages/*", "server/*", "services/*"]

────────────────────────────────────────────────────
STEP 0B — Shared Packages Setup
────────────────────────────────────────────────────

packages/config/
  tsconfig.base.json — strict mode, paths, decorators off
  tsconfig.nextjs.json — extends base, jsx preserve
  tsconfig.node.json — extends base, module commonjs
  eslint-base.js — shared ESLint config
  tailwind.base.ts — shared Tailwind base config

packages/types/src/index.ts — Export all shared TypeScript interfaces:
  - All enums (UserRole, InstitutionType, AttendanceStatus, etc.)
  - All interface types matching Prisma models
  - API response wrapper types (ApiResponse<T>, PaginatedResponse<T>)
  - Document type enums (all printable document types)

packages/validators/src/index.ts — Zod schemas for:
  - Login, registration
  - Student create/update
  - Settings forms (each settings section)
  - Exam/marks entry
  - Fee/payment
  - (Add more as phases progress)

packages/ui/ — Set up shadcn/ui:
  Run: npx shadcn-ui@latest init
  Install all components we'll need:
    button, input, label, select, checkbox, switch, textarea, badge, avatar,
    skeleton, table, tabs, accordion, dialog, alert-dialog, sheet, form,
    toast (sonner), calendar, date-picker, command, dropdown-menu,
    context-menu, progress, separator, tooltip, card, scroll-area,
    sidebar (new shadcn sidebar component)
  
  Create base components:
    PageWrapper.tsx       — page container with consistent padding
    PageHeader.tsx        — title + subtitle + breadcrumb + action slot
    DataTable.tsx         — TanStack Table wrapper with pagination
    FilterBar.tsx         — generic filter bar component
    StatusBadge.tsx       — colored badge by status type
    ConfirmDialog.tsx     — reusable delete/action confirmation dialog
    EmptyState.tsx        — empty table/list state component
    LoadingSpinner.tsx    — loading state
    FileUpload.tsx        — drag-drop file upload with preview
    RichTextEditor.tsx    — Tiptap editor wrapper

────────────────────────────────────────────────────
STEP 0C — Complete Prisma Schema
────────────────────────────────────────────────────

Create packages/db/prisma/schema.prisma with ALL models.
Read the full list carefully — every model needs correct relations, indexes, and audit fields.

INSTITUTION & SETTINGS MODELS:

model InstitutionProfile {
  id                    String            @id @default(cuid())
  name_en               String
  name_bn               String?
  tagline_en            String?
  tagline_bn            String?
  type                  InstitutionType
  eiin                  String?           @unique
  board                 String?           // Education board name
  founded_year          Int?
  logo_url              String?
  favicon_url           String?
  primary_color         String            @default("#1a3c4a")
  secondary_color       String            @default("#2e7d9a")
  address               String?
  district              String?
  division              String?
  post_code             String?
  phone_primary         String?
  phone_secondary       String?
  email_primary         String?
  email_secondary       String?
  website_url           String?
  facebook_url          String?
  youtube_url           String?
  map_embed_code        String?
  principal_name        String?           // display name (changes per institution type)
  principal_designation String?           // "Principal" / "Headmaster" / "Vice Chancellor"
  established_text      String?           // rich text for About page
  mission_text          String?
  vision_text           String?
  created_at            DateTime          @default(now())
  updated_at            DateTime          @updatedAt
}

model InstitutionConfig {
  id                        String    @id @default(cuid())
  // Academic structure
  academic_calendar_type    AcademicCalendarType  @default(YEARLY)
  has_shifts                Boolean   @default(true)
  has_sections              Boolean   @default(true)
  has_departments           Boolean   @default(false)
  has_semesters             Boolean   @default(false)
  show_hijri_calendar       Boolean   @default(false)
  // Terminology (changes per institution type)
  term_class                String    @default("Class")        // "Class" / "Year" / "Semester"
  term_section              String    @default("Section")      // "Section" / "Batch" / "Group"
  term_teacher              String    @default("Teacher")      // "Teacher" / "Professor" / "Lecturer"
  term_principal            String    @default("Principal")    // "Principal" / "Headmaster" / "Vice Chancellor"
  term_exam_controller      String    @default("Exam Controller")
  term_student_id           String    @default("Student ID")
  term_roll                 String    @default("Roll No")
  term_registration         String    @default("Registration No")
  // Feature flags
  extra_course_enrollment   Boolean   @default(false)   // university: extra courses
  show_practical_marks      Boolean   @default(false)
  show_subject_teacher_on_result Boolean @default(true)
  allow_partial_fee_payment Boolean   @default(true)
  // Result settings
  show_position_in_result   Boolean   @default(true)
  show_class_position       Boolean   @default(true)
  show_section_position     Boolean   @default(true)
  fourth_subject_rule       Boolean   @default(false)   // BD SSC/HSC rule
  created_at                DateTime  @default(now())
  updated_at                DateTime  @updatedAt
}

model StudentIdConfig {
  id                String    @id @default(cuid())
  prefix            String    @default("STU")
  include_year      Boolean   @default(true)
  year_format       String    @default("2")    // "2" = "24", "4" = "2024"
  include_month     Boolean   @default(false)
  separator         String    @default("-")
  sequence_digits   Int       @default(4)      // 4 = 0001
  sequence_scope    IdSequenceScope  @default(GLOBAL)
  current_sequence  Int       @default(0)
  preview_example   String?   // auto-computed on save
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt
}

model GradingScale {
  id            String    @id @default(cuid())
  name          String    // "BD Board Standard", "CGPA 4.0", "Custom"
  is_default    Boolean   @default(false)
  scale_type    GradeScaleType  @default(GPA_5)
  ranges        GradeRange[]
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt
}

model GradeRange {
  id                String        @id @default(cuid())
  grading_scale_id  String
  min_marks         Float
  max_marks         Float
  grade_letter      String        // "A+", "A", "B", etc.
  grade_point       Float         // 5.0, 4.0, etc.
  remarks           String?       // "Excellent", "Very Good"
  display_order     Int
  grading_scale     GradingScale  @relation(fields: [grading_scale_id], references: [id])
  created_at        DateTime      @default(now())
  @@index([grading_scale_id])
}

model ExamTypeConfig {
  id                        String    @id @default(cuid())
  name                      String    // "Half Yearly", "Annual Final", "Class Test"
  code                      String    @unique
  weight_in_annual          Float     @default(0)  // % contribution
  allows_absent_marking     Boolean   @default(true)
  has_practical             Boolean   @default(false)
  has_viva                  Boolean   @default(false)
  practical_marks_separate  Boolean   @default(false)
  is_board_exam             Boolean   @default(false)
  is_active                 Boolean   @default(true)
  display_order             Int
  created_at                DateTime  @default(now())
  updated_at                DateTime  @updatedAt
}

model FeeRules {
  id                        String    @id @default(cuid())
  late_fee_enabled          Boolean   @default(true)
  late_fee_type             LateFeeType @default(FIXED)
  late_fee_amount           Float     @default(50)
  late_fee_daily_cap        Float     @default(500)
  grace_period_days         Int       @default(5)
  fine_applies_to_exam_fee  Boolean   @default(false)
  block_result_on_due       Boolean   @default(false)
  block_admit_on_due        Boolean   @default(false)
  partial_payment_allowed   Boolean   @default(true)
  advance_payment_allowed   Boolean   @default(true)
  created_at                DateTime  @default(now())
  updated_at                DateTime  @updatedAt
}

model AttendanceRules {
  id                          String  @id @default(cuid())
  min_attendance_percentage   Float   @default(75)
  late_arrival_window_minutes Int     @default(15)  // within N min of shift start = Late (not Absent)
  working_days_per_week       Int     @default(6)
  count_late_as_absent_after  Int     @default(3)   // N lates = 1 absent
  sms_on_absent               Boolean @default(true)
  sms_on_late                 Boolean @default(false)
  created_at                  DateTime @default(now())
  updated_at                  DateTime @updatedAt
}

model AuthorityConfig {
  id              String          @id @default(cuid())
  doc_type        DocumentType
  slot            Int             // 1, 2, 3 (up to 3 signatures per doc)
  label           String          // "Principal", "Exam Controller"
  authority_role  AuthorityRole
  is_required     Boolean         @default(true)
  created_at      DateTime        @default(now())
  @@unique([doc_type, slot])
}

model AuthoritySignature {
  id              String          @id @default(cuid())
  role            AuthorityRole
  display_name    String          // "Dr. Mohammad Ali — Principal"
  designation     String          // "Principal"
  signature_url   String?
  seal_url        String?
  is_active       Boolean         @default(true)
  created_at      DateTime        @default(now())
  updated_at      DateTime        @updatedAt
}

model DocumentTemplate {
  id              String          @id @default(cuid())
  doc_type        DocumentType
  name            String          // "Default", "Formal Blue", "Minimal"
  html_content    String          @db.Text
  css_content     String?         @db.Text
  is_default      Boolean         @default(false)
  is_active       Boolean         @default(false)
  version         Int             @default(1)
  preview_url     String?
  created_at      DateTime        @default(now())
  updated_at      DateTime        @updatedAt
}

model NotificationConfig {
  id              String          @id @default(cuid())
  trigger         NotificationTrigger
  channel         NotificationChannel
  is_enabled      Boolean         @default(true)
  template_bn     String          @db.Text
  template_en     String          @db.Text
  created_at      DateTime        @default(now())
  updated_at      DateTime        @updatedAt
  @@unique([trigger, channel])
}

ACADEMIC STRUCTURE MODELS:

model AcademicYear {
  id            String      @id @default(cuid())
  label         String      @unique  // "2025–2026", "Spring 2026"
  start_date    DateTime
  end_date      DateTime
  is_active     Boolean     @default(false)
  created_at    DateTime    @default(now())
  updated_at    DateTime    @updatedAt
  classes       Class[]
  exams         Exam[]
}

model Shift {
  id          String    @id @default(cuid())
  name        String    // "Morning", "Day", "Evening"
  start_time  String    // "07:30"
  end_time    String    // "12:30"
  is_active   Boolean   @default(true)
  created_at  DateTime  @default(now())
  sections    Section[]
  attendance  AttendanceRecord[]
}

model Department {
  id          String    @id @default(cuid())
  name_en     String
  name_bn     String?
  code        String    @unique
  head_id     String?
  head        Staff?    @relation("DeptHead", fields: [head_id], references: [id])
  staff       Staff[]   @relation("StaffDept")
  is_active   Boolean   @default(true)
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt
  classes     Class[]
}

model Class {
  id               String       @id @default(cuid())
  academic_year_id String
  academic_year    AcademicYear @relation(fields: [academic_year_id], references: [id])
  department_id    String?
  department       Department?  @relation(fields: [department_id], references: [id])
  name_en          String       // "Class 9", "HSC Year 1", "1st Year B.Sc."
  name_bn          String?
  numeric_level    Int          // for ordering: 1, 2, 3...
  is_active        Boolean      @default(true)
  created_at       DateTime     @default(now())
  updated_at       DateTime     @updatedAt
  sections         Section[]
  subjects         Subject[]
  students         Student[]    @relation("CurrentClass")
  @@index([academic_year_id])
}

model Section {
  id               String    @id @default(cuid())
  class_id         String
  class            Class     @relation(fields: [class_id], references: [id])
  shift_id         String?
  shift            Shift?    @relation(fields: [shift_id], references: [id])
  class_teacher_id String?
  class_teacher    Staff?    @relation("ClassTeacher", fields: [class_teacher_id], references: [id])
  name             String    // "A", "B", "Science", "Commerce"
  capacity         Int       @default(50)
  is_active        Boolean   @default(true)
  created_at       DateTime  @default(now())
  students         Student[] @relation("CurrentSection")
  attendance       AttendanceRecord[]
  @@index([class_id])
}

model Subject {
  id              String    @id @default(cuid())
  class_id        String
  class           Class     @relation(fields: [class_id], references: [id])
  name_en         String
  name_bn         String?
  code            String
  subject_type    SubjectType  @default(THEORY)
  is_compulsory   Boolean   @default(true)
  is_optional     Boolean   @default(false)
  full_marks      Float     @default(100)
  pass_marks      Float     @default(33)
  display_order   Int       @default(0)
  is_active       Boolean   @default(true)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  assignments     SubjectTeacherAssignment[]
  student_subjects StudentSubject[]
  mark_entries    MarkEntry[]
  @@unique([class_id, code])
  @@index([class_id])
}

model SubjectTeacherAssignment {
  id               String       @id @default(cuid())
  subject_id       String
  subject          Subject      @relation(fields: [subject_id], references: [id])
  staff_id         String
  staff            Staff        @relation(fields: [staff_id], references: [id])
  section_id       String?
  academic_year_id String
  created_at       DateTime     @default(now())
  @@unique([subject_id, section_id, academic_year_id])
  @@index([staff_id])
}

PEOPLE MODELS:

model User {
  id              String    @id @default(cuid())
  name_en         String
  name_bn         String?
  role            UserRole
  email           String?   @unique
  phone           String    @unique
  password_hash   String
  lang_pref       Lang      @default(BN)
  is_active       Boolean   @default(true)
  last_login_at   DateTime?
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  student         Student?
  staff           Staff?
  refresh_tokens  RefreshToken[]
}

model RefreshToken {
  id          String    @id @default(cuid())
  user_id     String
  user        User      @relation(fields: [user_id], references: [id])
  token       String    @unique
  expires_at  DateTime
  created_at  DateTime  @default(now())
  @@index([user_id])
}

model Guardian {
  id            String    @id @default(cuid())
  name_en       String
  name_bn       String?
  relation      GuardianRelation
  phone         String
  nid           String?
  email         String?
  occupation    String?
  address       String?
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt
  students      Student[]
}

model Student {
  id                  String      @id @default(cuid())
  user_id             String?     @unique
  user                User?       @relation(fields: [user_id], references: [id])
  student_uid         String      @unique  // e.g. ALh-24-09-00142
  // Personal
  name_en             String
  name_bn             String?
  date_of_birth       DateTime?
  gender              Gender
  religion            String?
  blood_group         String?
  nationality         String      @default("Bangladeshi")
  nid_or_birth_reg    String?
  phone               String?
  // Guardian
  guardian_id         String?
  guardian            Guardian?   @relation(fields: [guardian_id], references: [id])
  father_name         String?
  father_phone        String?
  father_nid          String?
  father_occupation   String?
  mother_name         String?
  mother_phone        String?
  mother_nid          String?
  mother_occupation   String?
  // Address
  address_permanent   String?
  address_current     String?
  district            String?
  // Academic
  current_class_id    String?
  current_class       Class?      @relation("CurrentClass", fields: [current_class_id], references: [id])
  current_section_id  String?
  current_section     Section?    @relation("CurrentSection", fields: [current_section_id], references: [id])
  current_roll_no     String?
  registration_no     String?
  board_roll          String?
  biometric_id        String?
  // Admission
  admission_date      DateTime?
  previous_institution String?
  previous_class      String?
  previous_result     String?
  // Media
  photo_url           String?
  signature_url       String?
  // Status
  status              StudentStatus  @default(ACTIVE)
  // Special
  has_disability      Boolean     @default(false)
  disability_note     String?
  // Soft delete
  deleted_at          DateTime?
  // Audit
  created_at          DateTime    @default(now())
  updated_at          DateTime    @updatedAt
  created_by_id       String?
  // Relations
  academic_history    StudentAcademicHistory[]
  student_subjects    StudentSubject[]
  attendance          AttendanceRecord[]
  mark_entries        MarkEntry[]
  invoices            Invoice[]
  exam_seat_plans     ExamSeatPlan[]
  @@index([current_class_id])
  @@index([current_section_id])
  @@index([status])
}

model StudentAcademicHistory {
  id               String       @id @default(cuid())
  student_id       String
  student          Student      @relation(fields: [student_id], references: [id])
  academic_year_id String
  academic_year    AcademicYear @relation(fields: [academic_year_id], references: [id])
  class_id         String
  section_id       String?
  roll_no          String?
  final_gpa        Float?
  final_grade      String?
  status           HistoryStatus
  promoted_by_id   String?
  promoted_at      DateTime?
  notes            String?
  created_at       DateTime     @default(now())
  @@index([student_id])
}

model StudentSubject {
  id          String    @id @default(cuid())
  student_id  String
  student     Student   @relation(fields: [student_id], references: [id])
  subject_id  String
  subject     Subject   @relation(fields: [subject_id], references: [id])
  is_inherited Boolean  @default(true)  // false = manually added extra course
  academic_year_id String
  added_at    DateTime  @default(now())
  @@unique([student_id, subject_id, academic_year_id])
  @@index([student_id])
}

model Staff {
  id                  String      @id @default(cuid())
  user_id             String      @unique
  user                User        @relation(fields: [user_id], references: [id])
  staff_uid           String      @unique
  name_en             String
  name_bn             String?
  designation         String
  department_id       String?
  department          Department? @relation("StaffDept", fields: [department_id], references: [id])
  date_of_birth       DateTime?
  gender              Gender?
  religion            String?
  blood_group         String?
  nid                 String?
  tin                 String?
  phone               String?
  email               String?
  address             String?
  photo_url           String?
  signature_url       String?
  biometric_id        String?
  employment_type     EmploymentType @default(PERMANENT)
  joining_date        DateTime?
  salary_structure_id String?
  is_active           Boolean     @default(true)
  deleted_at          DateTime?
  created_at          DateTime    @default(now())
  updated_at          DateTime    @updatedAt
  created_by_id       String?
  subject_assignments SubjectTeacherAssignment[]
  department_head_of  Department? @relation("DeptHead")
  class_teacher_of    Section[]   @relation("ClassTeacher")
  leave_requests      LeaveRequest[]
  payroll_records     PayrollRecord[]
  @@index([department_id])
}

ATTENDANCE MODELS:

model AttendanceRecord {
  id                String            @id @default(cuid())
  person_id         String
  person_type       PersonType
  date              DateTime          @db.Date
  shift_id          String?
  shift             Shift?            @relation(fields: [shift_id], references: [id])
  section_id        String?
  section           Section?          @relation(fields: [section_id], references: [id])
  student_id        String?
  student           Student?          @relation(fields: [student_id], references: [id])
  period_no         Int?              // for subject-wise
  status            AttendanceStatus
  source            AttendanceSource  @default(MANUAL)
  device_id         String?
  device            Device?           @relation(fields: [device_id], references: [id])
  marked_by_id      String?
  override_reason   String?
  created_at        DateTime          @default(now())
  updated_at        DateTime          @updatedAt
  @@unique([person_id, person_type, date, shift_id, period_no])
  @@index([person_id, date])
  @@index([section_id, date])
}

model Device {
  id                  String          @id @default(cuid())
  name                String
  type                DeviceType
  brand               String?
  location            String?
  ip_address          String?
  port                Int?            @default(4370)
  last_sync_at        DateTime?
  status              DeviceStatus    @default(OFFLINE)
  is_active           Boolean         @default(true)
  created_at          DateTime        @default(now())
  attendance_records  AttendanceRecord[]
  punch_logs          DevicePunchLog[]
}

model DevicePunchLog {
  id              String    @id @default(cuid())
  device_id       String
  device          Device    @relation(fields: [device_id], references: [id])
  device_user_id  String
  punch_at        DateTime
  synced_at       DateTime  @default(now())
  mapped_person_id String?
  is_processed    Boolean   @default(false)
  @@index([device_id, punch_at])
}

EXAM & RESULT MODELS:

model Exam {
  id                    String          @id @default(cuid())
  academic_year_id      String
  academic_year         AcademicYear    @relation(fields: [academic_year_id], references: [id])
  exam_type_config_id   String
  exam_type_config      ExamTypeConfig  @relation(fields: [exam_type_config_id], references: [id])
  name                  String
  start_date            DateTime?
  end_date              DateTime?
  mark_entry_opens_at   DateTime?
  mark_entry_closes_at  DateTime?
  grading_scale_id      String?
  grading_scale         GradingScale?   @relation(fields: [grading_scale_id], references: [id])
  status                ExamStatus      @default(DRAFT)
  created_at            DateTime        @default(now())
  updated_at            DateTime        @updatedAt
  subject_configs       ExamSubjectConfig[]
  mark_entries          MarkEntry[]
  seat_plans            ExamSeatPlan[]
  result_publications   ResultPublication[]
  @@index([academic_year_id])
}

model ExamSubjectConfig {
  id                      String    @id @default(cuid())
  exam_id                 String
  exam                    Exam      @relation(fields: [exam_id], references: [id])
  subject_id              String
  subject                 Subject   @relation(fields: [subject_id], references: [id])
  full_marks_theory       Float     @default(100)
  full_marks_practical    Float     @default(0)
  pass_marks_theory       Float     @default(33)
  pass_marks_practical    Float     @default(0)
  pass_marks_combined     Float     @default(33)
  @@unique([exam_id, subject_id])
}

model MarkEntry {
  id                      String    @id @default(cuid())
  exam_id                 String
  exam                    Exam      @relation(fields: [exam_id], references: [id])
  student_id              String
  student                 Student   @relation(fields: [student_id], references: [id])
  subject_id              String
  subject                 Subject   @relation(fields: [subject_id], references: [id])
  marks_theory            Float?
  marks_practical         Float?
  marks_total             Float?
  is_absent               Boolean   @default(false)
  grade_letter            String?
  grade_point             Float?
  status                  MarkStatus  @default(DRAFT)
  entered_by_id           String?
  approved_by_id          String?
  approved_at             DateTime?
  created_at              DateTime  @default(now())
  updated_at              DateTime  @updatedAt
  @@unique([exam_id, student_id, subject_id])
  @@index([exam_id, student_id])
}

model ExamSeatPlan {
  id              String    @id @default(cuid())
  exam_id         String
  exam            Exam      @relation(fields: [exam_id], references: [id])
  student_id      String
  student         Student   @relation(fields: [student_id], references: [id])
  hall_name       String?
  seat_number     String?
  invigilator_id  String?
  @@unique([exam_id, student_id])
}

model ResultPublication {
  id              String    @id @default(cuid())
  exam_id         String
  exam            Exam      @relation(fields: [exam_id], references: [id])
  class_id        String
  is_published    Boolean   @default(false)
  published_at    DateTime?
  published_by_id String?
  is_public       Boolean   @default(false)  // show on website
  @@unique([exam_id, class_id])
}

FEE MODELS:

model FeeStructure {
  id               String    @id @default(cuid())
  academic_year_id String
  academic_year    AcademicYear @relation(fields: [academic_year_id], references: [id])
  class_id         String?
  section_id       String?
  category         FeeCategory
  name             String
  amount           Float
  frequency        FeeFrequency
  due_day          Int?      // day of month invoice is due
  is_active        Boolean   @default(true)
  created_at       DateTime  @default(now())
  invoices         Invoice[]
}

model Invoice {
  id                  String        @id @default(cuid())
  student_id          String
  student             Student       @relation(fields: [student_id], references: [id])
  fee_structure_id    String?
  fee_structure       FeeStructure? @relation(fields: [fee_structure_id], references: [id])
  academic_year_id    String
  category            FeeCategory
  description         String
  amount_due          Float
  amount_paid         Float         @default(0)
  fine_amount         Float         @default(0)
  due_date            DateTime
  status              InvoiceStatus @default(PENDING)
  month               Int?          // for monthly fees
  year                Int?
  created_at          DateTime      @default(now())
  updated_at          DateTime      @updatedAt
  payments            Payment[]
  @@index([student_id])
  @@index([status])
}

model Payment {
  id              String        @id @default(cuid())
  invoice_id      String
  invoice         Invoice       @relation(fields: [invoice_id], references: [id])
  gateway         PaymentGateway
  transaction_id  String?       @unique
  amount          Float
  status          PaymentStatus
  paid_at         DateTime?
  receipt_url     String?
  notes           String?
  collected_by_id String?
  created_at      DateTime      @default(now())
  @@index([invoice_id])
}

HR MODELS:

model LeaveType {
  id            String    @id @default(cuid())
  name          String    // "Casual Leave", "Sick Leave", "Annual Leave"
  days_allowed  Int
  is_paid       Boolean   @default(true)
  created_at    DateTime  @default(now())
  leave_requests LeaveRequest[]
}

model LeaveRequest {
  id              String      @id @default(cuid())
  staff_id        String
  staff           Staff       @relation(fields: [staff_id], references: [id])
  leave_type_id   String
  leave_type      LeaveType   @relation(fields: [leave_type_id], references: [id])
  from_date       DateTime
  to_date         DateTime
  reason          String
  status          LeaveStatus @default(PENDING)
  approved_by_id  String?
  approved_at     DateTime?
  created_at      DateTime    @default(now())
  @@index([staff_id])
}

model SalaryStructure {
  id                  String    @id @default(cuid())
  name                String
  basic               Float
  house_rent          Float     @default(0)
  medical             Float     @default(0)
  transport           Float     @default(0)
  pf_percentage       Float     @default(0)
  tds_percentage      Float     @default(0)
  created_at          DateTime  @default(now())
}

model PayrollRecord {
  id                  String    @id @default(cuid())
  staff_id            String
  staff               Staff     @relation(fields: [staff_id], references: [id])
  month               Int
  year                Int
  working_days        Int
  present_days        Int
  gross_salary        Float
  deductions          Float
  net_salary          Float
  advance_deducted    Float     @default(0)
  status              PayrollStatus @default(DRAFT)
  payslip_url         String?
  processed_by_id     String?
  created_at          DateTime  @default(now())
  @@unique([staff_id, month, year])
}

WEBSITE CONTENT MODELS:

model Notice {
  id                    String          @id @default(cuid())
  title                 String
  body                  String          @db.Text
  attachment_url        String?
  audience              NoticeAudience  @default(PUBLIC)
  is_pinned             Boolean         @default(false)
  is_published          Boolean         @default(false)
  is_public_website     Boolean         @default(true)
  send_sms              Boolean         @default(false)
  sms_sent_at           DateTime?
  publish_at            DateTime?
  expire_at             DateTime?
  created_by_id         String?
  created_at            DateTime        @default(now())
  updated_at            DateTime        @updatedAt
}

model SliderImage {
  id            String    @id @default(cuid())
  image_url     String
  title         String?
  subtitle      String?
  btn_text      String?
  btn_link      String?
  display_order Int       @default(0)
  is_active     Boolean   @default(true)
  publish_from  DateTime?
  publish_until DateTime?
  created_at    DateTime  @default(now())
}

model GalleryAlbum {
  id          String    @id @default(cuid())
  name        String
  date        DateTime?
  description String?
  cover_url   String?
  is_public   Boolean   @default(true)
  created_at  DateTime  @default(now())
  images      GalleryImage[]
}

model GalleryImage {
  id          String        @id @default(cuid())
  album_id    String
  album       GalleryAlbum  @relation(fields: [album_id], references: [id])
  image_url   String
  thumbnail_url String?
  caption     String?
  display_order Int         @default(0)
  created_at  DateTime      @default(now())
  @@index([album_id])
}

model Download {
  id               String    @id @default(cuid())
  title            String
  file_url         String
  file_name        String
  category         DownloadCategory
  academic_year_id String?
  is_public        Boolean   @default(true)
  download_count   Int       @default(0)
  created_at       DateTime  @default(now())
}

model StaticPage {
  id            String    @id @default(cuid())
  page_key      String    @unique  // "about", "principal_message", "governing_body"
  title_en      String?
  title_bn      String?
  content_en    String?   @db.Text
  content_bn    String?   @db.Text
  meta_title    String?
  meta_desc     String?
  is_published  Boolean   @default(true)
  updated_at    DateTime  @updatedAt
}

model GoverningBodyMember {
  id            String    @id @default(cuid())
  name          String
  designation   String
  group         String    @default("Governing Body")
  photo_url     String?
  bio           String?
  display_order Int       @default(0)
  is_active     Boolean   @default(true)
  created_at    DateTime  @default(now())
}

ADMISSION MODELS:

model AdmissionCycle {
  id               String    @id @default(cuid())
  class_id         String
  class            Class     @relation(fields: [class_id], references: [id])
  academic_year_id String
  academic_year    AcademicYear @relation(fields: [academic_year_id], references: [id])
  name             String
  open_date        DateTime
  close_date       DateTime
  seat_count       Int
  app_fee          Float     @default(0)
  is_open          Boolean   @default(false)
  is_published     Boolean   @default(false)
  form_config      Json?     // field configuration as JSON
  created_at       DateTime  @default(now())
  applications     AdmissionApplication[]
}

model AdmissionApplication {
  id                String            @id @default(cuid())
  cycle_id          String
  cycle             AdmissionCycle    @relation(fields: [cycle_id], references: [id])
  admission_roll    String?           @unique
  applicant_name    String
  guardian_info     Json
  personal_info     Json
  previous_result   Json?
  selected_subjects Json?
  documents         Json?
  status            AdmissionStatus   @default(PENDING)
  merit_rank        Int?
  payment_id        String?
  enrolled_student_id String?
  created_at        DateTime          @default(now())
  updated_at        DateTime          @updatedAt
  @@index([cycle_id])
}

ALL ENUMS (add at bottom of schema):

enum InstitutionType { SCHOOL COLLEGE UNIVERSITY MADRASAH }
enum AcademicCalendarType { YEARLY SEMESTER TRIMESTER }
enum IdSequenceScope { GLOBAL YEARLY CLASS }
enum GradeScaleType { GPA_5 GPA_4 PERCENTAGE CUSTOM }
enum UserRole { SUPER_ADMIN ADMIN PRINCIPAL VICE_PRINCIPAL EXAM_CONTROLLER HEAD_OF_DEPT CLASS_TEACHER SUBJECT_TEACHER ACCOUNTANT LIBRARIAN TRANSPORT_MANAGER HOSTEL_MANAGER PROCTOR REGISTRAR IT_ADMIN STUDENT GUARDIAN }
enum Lang { EN BN }
enum Gender { MALE FEMALE OTHER }
enum GuardianRelation { FATHER MOTHER UNCLE AUNT BROTHER SISTER OTHER }
enum StudentStatus { ACTIVE INACTIVE TRANSFERRED GRADUATED EXPELLED }
enum HistoryStatus { PROMOTED FAILED TRANSFERRED GRADUATED }
enum PersonType { STUDENT STAFF }
enum AttendanceStatus { PRESENT ABSENT LATE LEAVE HALF_DAY }
enum AttendanceSource { BIOMETRIC MANUAL }
enum DeviceType { FINGERPRINT RFID GPS }
enum DeviceStatus { ONLINE OFFLINE ERROR }
enum SubjectType { THEORY PRACTICAL BOTH }
enum ExamStatus { DRAFT ACTIVE MARK_ENTRY COMPLETED PUBLISHED }
enum MarkStatus { DRAFT SUBMITTED APPROVED }
enum FeeCategory { ADMISSION TUITION EXAM TRANSPORT HOSTEL LAB LIBRARY SPORTS DEVELOPMENT OTHER }
enum FeeFrequency { MONTHLY YEARLY ONE_TIME }
enum LateFeeType { FIXED PERCENTAGE DAILY }
enum InvoiceStatus { PENDING PARTIAL PAID OVERDUE WAIVED }
enum PaymentGateway { BKASH NAGAD ROCKET SSLCOMMERZ AAMARPAY CASH BANK_TRANSFER }
enum PaymentStatus { INITIATED COMPLETED FAILED REFUNDED }
enum LeaveStatus { PENDING APPROVED REJECTED }
enum PayrollStatus { DRAFT FINALIZED PAID }
enum AuthorityRole { PRINCIPAL VICE_PRINCIPAL HEADMASTER VICE_CHANCELLOR PRO_VICE_CHANCELLOR EXAM_CONTROLLER REGISTRAR PROCTOR DEAN HOD LIBRARIAN ACCOUNTANT CLASS_TEACHER }
enum DocumentType { STUDENT_ID_CARD STAFF_ID_CARD ADMIT_CARD REGISTRATION_CARD MARKSHEET REPORT_CARD TABULATION_SHEET TESTIMONIAL TRANSFER_CERTIFICATE ATTENDANCE_SHEET ATTENDANCE_BLANK FEE_RECEIPT PAYSLIP SYLLABUS MERIT_LIST }
enum NoticeAudience { PUBLIC STUDENTS STAFF GUARDIANS ALL }
enum NotificationTrigger { ABSENCE LATE FEE_DUE RESULT_PUBLISHED NOTICE ADMISSION_CONFIRM }
enum NotificationChannel { SMS EMAIL PUSH }
enum DownloadCategory { SYLLABUS EXAM_SCHEDULE FORMS RESULTS CIRCULARS OTHERS }
enum AdmissionStatus { PENDING SHORTLISTED WAITLISTED REJECTED CONFIRMED ENROLLED }
enum EmploymentType { PERMANENT CONTRACT PART_TIME }

After creating the schema:
1. Run: pnpm db:generate
2. Run: pnpm db:migrate --name "initial_schema"
3. Create seed file at packages/db/prisma/seed.ts that inserts:
   - Default InstitutionProfile (name: "My Institution", type: SCHOOL)
   - Default InstitutionConfig
   - Default StudentIdConfig (prefix: "STU", separator: "-", 4 digits)
   - Default GradingScale (BD Board standard — A+ 80-100 GPA5, A 70-79 GPA4, A- 60-69 GPA3.5, B 50-59 GPA3, C 40-49 GPA2, D 33-39 GPA1, F 0-32 GPA0)
   - Default AttendanceRules
   - Default FeeRules
   - Default ExamTypeConfig (Class Test, Half Yearly, Annual Final)
   - One ADMIN user: phone=01700000000, password=Admin@1234
   - Default NotificationConfig entries for all triggers/channels
4. Run: pnpm db:seed
```

---

---

# ═══════════════════════════════════════════════
# PHASE 1 — Settings System (FULL)
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check existing files. Tell me what exists, then proceed.

PHASE 1 GOAL: Build the COMPLETE Settings system — both API + Admin UI.
This is the most critical phase. Every other module depends on settings being correct.
Do NOT skip any section. Build everything completely.

────────────────────────────────────────────────
STEP 1A — Settings API (server/api/src/modules/settings/)
────────────────────────────────────────────────

Build ALL settings endpoints. Group into sub-modules as per CLAUDE.md structure.

--- Institution Profile & Branding ---

GET  /api/settings/institution
PUT  /api/settings/institution
  Body: name_en, name_bn, tagline_en, tagline_bn, type (InstitutionType),
        eiin, board, founded_year, address, district, division, post_code,
        phone_primary, phone_secondary, email_primary, email_secondary,
        website_url, facebook_url, youtube_url, map_embed_code,
        principal_name, principal_designation, primary_color, secondary_color,
        established_text, mission_text, vision_text

POST /api/settings/institution/logo      → upload logo to Azure Blob, update logo_url
POST /api/settings/institution/favicon   → upload favicon

PUT  /api/settings/institution/type
  Body: type (InstitutionType)
  ON TYPE CHANGE — auto-update InstitutionConfig.term_* fields:
    SCHOOL:     term_class="Class", term_teacher="Teacher", term_principal="Headmaster", has_shifts=true, has_departments=false
    COLLEGE:    term_class="Class", term_teacher="Teacher", term_principal="Principal", has_shifts=true, has_departments=false
    UNIVERSITY: term_class="Semester", term_section="Batch", term_teacher="Professor", term_principal="Vice Chancellor", has_shifts=false, has_departments=true, has_semesters=true, extra_course_enrollment=true
    MADRASAH:   term_class="Class", term_teacher="Ustaz", term_principal="Muhtamim", show_hijri_calendar=true, has_shifts=true

GET  /api/settings/config
PUT  /api/settings/config    → update InstitutionConfig fields

--- Student ID Format ---

GET  /api/settings/student-id-config
PUT  /api/settings/student-id-config
  Body: prefix, include_year, year_format, include_month, separator, sequence_digits, sequence_scope
  On save: compute and return preview_example

POST /api/settings/student-id-config/preview
  Body: same as above → returns preview string without saving

POST /api/settings/student-id-config/reset-sequence
  → Reset current_sequence to 0 (with confirmation warning in response)

--- Grading System ---

GET    /api/settings/grading-scales             → list all scales
POST   /api/settings/grading-scales             → create scale with ranges
GET    /api/settings/grading-scales/:id         → get scale with all ranges
PUT    /api/settings/grading-scales/:id         → update scale name/type
PUT    /api/settings/grading-scales/:id/ranges  → replace all ranges (batch update)
DELETE /api/settings/grading-scales/:id         → delete (block if used in active exam)
POST   /api/settings/grading-scales/:id/default → set as default scale

  Validation on ranges: no gaps, no overlaps, min 0, max 100

POST /api/settings/grading-scales/presets/apply
  Body: preset ("BD_BOARD" | "CGPA_4" | "CGPA_5" | "PERCENTAGE")
  → Create a new scale with that preset's ranges

--- Exam Configuration ---

GET    /api/settings/exam-types          → list
POST   /api/settings/exam-types          → create
PUT    /api/settings/exam-types/:id      → update
DELETE /api/settings/exam-types/:id      → soft delete (block if exams use it)
PUT    /api/settings/exam-types/reorder  → update display_order for all

--- Fee Rules ---

GET  /api/settings/fee-rules
PUT  /api/settings/fee-rules
  Body: ALL FeeRules fields from schema

--- Attendance Rules ---

GET  /api/settings/attendance-rules
PUT  /api/settings/attendance-rules

--- Authority Signatures ---

GET    /api/settings/signatures          → list all
POST   /api/settings/signatures          → create (upload signature image + seal image)
PUT    /api/settings/signatures/:id      → update (name, designation, re-upload image)
DELETE /api/settings/signatures/:id      → delete
PUT    /api/settings/signatures/:id/activate → toggle is_active

GET    /api/settings/authority-config            → list doc_type → slot → role mappings
PUT    /api/settings/authority-config            → update all (batch replace)
GET    /api/settings/authority-config/:doc_type  → get slots for one doc type

--- Document Templates ---

GET    /api/settings/templates                       → list grouped by doc_type
POST   /api/settings/templates                       → upload HTML template file
GET    /api/settings/templates/:id                   → get template with html_content
PUT    /api/settings/templates/:id/activate          → set as active for its doc_type
DELETE /api/settings/templates/:id                   → delete (block if it's the only active)
GET    /api/settings/templates/preview/:doc_type     → render preview with dummy data

--- Notification Config ---

GET  /api/settings/notifications        → list all triggers with their SMS/email templates
PUT  /api/settings/notifications/:id    → update template + toggle enabled
POST /api/settings/notifications/test   → send test SMS to admin phone

--- Academic Structure ---

GET    /api/settings/academic-years
POST   /api/settings/academic-years
PUT    /api/settings/academic-years/:id
POST   /api/settings/academic-years/:id/activate  → set as active year (deactivate others)
DELETE /api/settings/academic-years/:id

GET    /api/settings/shifts
POST   /api/settings/shifts
PUT    /api/settings/shifts/:id
DELETE /api/settings/shifts/:id

GET    /api/settings/departments
POST   /api/settings/departments
PUT    /api/settings/departments/:id
DELETE /api/settings/departments/:id
PUT    /api/settings/departments/:id/head  → assign HOD

GET    /api/settings/classes                     → includes sections and student count
POST   /api/settings/classes
PUT    /api/settings/classes/:id
DELETE /api/settings/classes/:id                 → block if students enrolled
POST   /api/settings/classes/:class_id/sections  → create section under class
PUT    /api/settings/sections/:id
DELETE /api/settings/sections/:id
PUT    /api/settings/sections/:id/class-teacher  → assign class teacher

--- User Management ---

GET    /api/settings/users              → list all staff accounts with role
POST   /api/settings/users              → create user account + staff profile
PUT    /api/settings/users/:id          → update role, status
POST   /api/settings/users/:id/reset-password → generate temp password + SMS to staff
PUT    /api/settings/users/:id/toggle   → enable/disable account
DELETE /api/settings/users/:id          → deactivate (never hard delete)

────────────────────────────────────────────────
STEP 1B — Settings Admin UI (apps/admin)
────────────────────────────────────────────────

Build ALL settings pages. Route: /settings/*

Layout: Settings pages use a SECONDARY SIDEBAR (left sub-navigation) 
with the settings sections grouped as:

GROUP 1 — Institution
  - Profile & Branding  (/settings/institution)
  - Academic Structure  (/settings/academic)
  - Departments         (/settings/departments)
  - Subjects            (/settings/subjects)  ← will be used in Phase 4

GROUP 2 — Customization
  - Student ID Format   (/settings/student-id)
  - Grading System      (/settings/grading)
  - Exam Types          (/settings/exam-types)
  - Fee Rules           (/settings/fee-rules)
  - Attendance Rules    (/settings/attendance-rules)

GROUP 3 — Documents & Signatures
  - Authority Signatures (/settings/signatures)
  - Signature Mapping    (/settings/signature-mapping)
  - Document Templates   (/settings/templates)

GROUP 4 — System
  - User Accounts        (/settings/users)
  - Notifications        (/settings/notifications)

─── PAGE: /settings/institution ───
Two-column layout: left form, right live preview (institution card)

Sections (use Tabs):
TAB 1 — Basic Info
  Fields: name_en, name_bn, tagline_en/bn, EIIN, board, founded_year
  Institution Type selector: 4 cards with icons (School 🏫 / College 🎓 / University 🏛️ / Madrasah 🕌)
  On type change: show confirmation dialog "This will change terminology across the system. Continue?"
  Then show what will change: "Teacher → Professor, Class → Semester, etc."

TAB 2 — Branding
  Logo upload: drag-drop zone + preview (show current logo)
  Favicon upload: small square upload
  Primary color picker (use color input + hex field)
  Secondary color picker
  Live preview: mini institution card showing logo + colors

TAB 3 — Contact & Links
  phone_primary, phone_secondary, email_primary, email_secondary
  address, district, division, post_code
  website_url, facebook_url, youtube_url
  map_embed_code (textarea) with preview

TAB 4 — About Content
  principal_name, principal_designation
  established_text (rich text editor)
  mission_text (rich text editor)
  vision_text (rich text editor)

─── PAGE: /settings/academic ───

SECTION 1 — Academic Years
  Table: label, start, end, status (Active badge / inactive)
  Add Academic Year: dialog form
  "Set Active" button per row (with confirmation)

SECTION 2 — Shifts (hidden if institution type is UNIVERSITY)
  Table: name, start_time, end_time, active
  Add/edit shifts inline

SECTION 3 — Classes & Sections
  Accordion tree: each Class expands to show its Sections
  Class row: name, academic year, student count, actions
  Section row: name, shift, class teacher (avatar), student count, actions
  "Add Class" button → dialog
  "Add Section" button on each class → dialog (select shift, assign class teacher)
  "Assign Class Teacher" quick action on section row → staff search combobox

─── PAGE: /settings/student-id ───

Two-column layout:
LEFT: Configuration form
  - Prefix input (e.g. "ALh", "ASH")
  - Year toggle + format (2-digit / 4-digit)
  - Month toggle
  - Separator select: -, /, (none)
  - Sequence digits: slider (3–6)
  - Sequence scope: radio (Global / Per Year / Per Class)

RIGHT: Live preview panel (UPDATES ON EVERY KEYSTROKE)
  Large styled box showing:
    "ID Preview"
    {PREFIX}-{24}-{09}-{0001}
    ↕ highlight each component with its source
    
  Examples table:
    First student:  ALh-24-09-0001
    Second student: ALh-24-09-0002
    Next year:      ALh-25-01-0003  (if Global scope)
               OR:  ALh-25-01-0001  (if Yearly scope)

  Current sequence info: "Last issued: STU-24-09-0142"
  "Reset Sequence" danger button with confirmation

─── PAGE: /settings/grading ───

"Saved Scales" table + "Create New Scale" button
Per scale: name, type badge, grade count, "Set Default" toggle, edit/delete

"Create / Edit Scale" → full-page editor:
  Top: Scale name input + type selector
  
  Grades table (editable inline):
    Columns: Min Marks | Max Marks | Grade | GPA Point | Remarks | Delete row
    Each cell is an inline editable input
    "Add Grade Row" button at bottom
    
  Real-time validation:
    🔴 "Gap detected between 59-60" → show warning
    🔴 "Overlap between A and A-" → show error
    ✅ "All ranges valid — covers 0 to 100"
  
  Quick Presets buttons: "Apply BD Board" | "Apply CGPA 4.0" | "Apply CGPA 5.0"
    → fills in default ranges (user can then edit)

  Save button disabled until no validation errors

─── PAGE: /settings/exam-types ───

Drag-to-reorder card list of exam types
Each card shows: name, code, weight%, has practical badge, is board badge
"Add Exam Type" → dialog with all fields
Edit inline or via dialog
Delete with confirmation (block if exams using it)

─── PAGE: /settings/fee-rules ───

Single form page:
  Late Fee section: toggle → reveals: type selector (Fixed/Percentage/Daily) → amount input → daily cap → grace period days
  Restrictions section: two toggles — "Block result card if dues pending" / "Block admit card if dues pending"
  Payment section: "Allow partial payment" / "Allow advance payment" toggles
  
  Save button. Show toast on success.

─── PAGE: /settings/signatures ───

Three-column grid of Authority Signature cards.
Each card shows:
  - Signature image preview (or "No signature" placeholder)
  - Seal image preview
  - Display name + designation badge
  - Active/Inactive toggle
  - Edit / Delete actions

"Add Signature" → dialog:
  Role selector (dropdown of AuthorityRole enum — shows labels: "Principal", "Vice Chancellor", etc.)
  Display name input ("Dr. Mohammad Ali")
  Designation input ("Principal & Head")
  Signature image upload (drag-drop, preview the signature image at ~200×80px)
  Seal image upload (drag-drop, preview as circle ~80×80px)
  Active toggle

─── PAGE: /settings/signature-mapping ───

Table of document types with their signature slots.
Per document type row, expandable to show:
  Slot 1: [Role Selector] [Label Input] [Required toggle]
  Slot 2: [Role Selector] [Label Input] [Required toggle]
  Slot 3: [Role Selector] [Label Input] [Required toggle]

"Save All Mappings" button at bottom.

─── PAGE: /settings/templates ───

Left sidebar: list of DocumentType enums with human labels
  (Student ID Card, Admit Card, Marksheet, Report Card, etc.)

Right panel (changes per selected type):
  "Active Template" shown with preview thumbnail
  List of uploaded templates for this type
  Per template: thumbnail, name, version, "Set Active" / "Delete" buttons
  "Upload Custom Template" button → dialog:
    Template name input
    HTML file upload
    CSS file upload (optional)
    "Preview" button → renders template with dummy data

─── PAGE: /settings/notifications ───

Table of all notification triggers.
Columns: Trigger event | SMS | Email | Push (toggles per channel)
Expandable per row: SMS template (Bangla) textarea, English textarea
Template variable hints shown: {{student_name}}, {{date}}, {{class}}, etc.
"Send Test" button → sends to admin's own phone

─── PAGE: /settings/users ───

Data table: Name, Phone, Role badge, Status badge, Last login, Actions
Filter by role
"Add User" → multi-step dialog:
  Step 1: Basic info (name, phone, email, role)
  Step 2: Staff profile (designation, department — if role is teaching/admin)
  Step 3: Summary + Send Credentials toggle
"Reset Password" → generate temp password → show to admin + optional SMS to staff
"Disable" account toggle per row
```

---

---

# ═══════════════════════════════════════════════
# PHASE 2 — Auth + Login System
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check existing files.

PHASE 2 GOAL: Complete authentication system — API + Admin login UI + portal login.

STEP 2A — Auth API (server/api/src/modules/auth/)

POST /api/auth/login
  Body: { identifier: string (phone or email), password: string, portal: "admin" | "portal" }
  - Find user by phone or email
  - Check is_active
  - Verify bcrypt password
  - Generate access_token (15min) + refresh_token (7d)
  - Store refresh_token in Redis: key=refresh:{token}, value=user_id, TTL=7d
  - Update last_login_at
  - Return: { access_token, refresh_token, user: { id, name_en, name_bn, role, phone, lang_pref } }

POST /api/auth/refresh
  Body: { refresh_token: string }
  - Check token in Redis
  - Verify not blacklisted
  - Issue new access_token
  - Optionally rotate refresh_token (recommended)

POST /api/auth/logout
  Body: { refresh_token: string }
  - Delete from Redis
  - Return 204

POST /api/auth/change-password (authenticated)
  Body: { old_password, new_password, confirm_password }
  - Verify old password
  - Validate new password: min 8 chars, must have uppercase + lowercase + number
  - bcrypt hash + update

POST /api/auth/forgot-password
  Body: { phone: string }
  - Check user exists
  - Generate 6-digit OTP
  - Store in Redis: key=otp:{phone}, value=hashed_otp, TTL=600s (10 min)
  - Send via SMS notification queue
  - Return: { message: "OTP sent", expires_in: 600 }

POST /api/auth/verify-otp
  Body: { phone, otp }
  - Verify against Redis
  - Generate reset_token (UUID)
  - Store in Redis: key=reset:{token}, value=phone, TTL=300s
  - Return: { reset_token }

POST /api/auth/reset-password
  Body: { reset_token, new_password, confirm_password }
  - Verify reset_token in Redis
  - Update password
  - Delete reset_token
  - Send confirmation SMS

GET /api/auth/me (authenticated)
  Returns full user profile + institution info

MIDDLEWARE:
authenticate.ts:
  - Extract Bearer token from Authorization header
  - Verify JWT signature + expiry
  - Attach req.user = decoded payload
  - Return 401 if invalid/expired with specific error codes:
    TOKEN_EXPIRED, TOKEN_INVALID, TOKEN_MISSING

authorize.ts:
  - Factory: authorize(['ADMIN', 'PRINCIPAL'])
  - Check req.user.role in allowed list
  - Return 403 FORBIDDEN if not allowed

STEP 2B — Admin Login UI (apps/admin)

Route: /login (public, redirect to /dashboard if already logged in)

Full-page layout:
  Left panel (40%): 
    Institution logo (if set, else default education icon)
    Institution name (pulled from API /api/settings/institution — no auth needed)
    "Powered by AshDevs" at bottom
    
  Right panel (60%): Login form card centered

  Login form:
    Title: "Staff Login"
    Subtitle: Use role label — e.g. "Admin Portal"
    Phone/Email input (label: "Phone or Email")
    Password input with show/hide toggle
    "Forgot Password?" link
    "Sign In" button (loading state on submit)
    
  Error handling:
    "Invalid credentials" → red alert under form
    "Account disabled" → orange alert with "Contact admin" note
    Network error → toast notification

  Forgot Password flow (same page, different state):
    State 1: Enter phone number → "Send OTP"
    State 2: Enter 6-digit OTP → countdown timer → "Resend" after 120s
    State 3: Enter new password + confirm
    State 4: Success → redirect to login

Auth Store (Zustand — stores/auth.store.ts):
  state: { user, access_token, refresh_token, is_authenticated }
  actions: { login, logout, refreshToken, setUser }
  persist: localStorage (access_token + refresh_token only)

Axios instance (lib/api.ts):
  baseURL: from env
  interceptors:
    Request: attach Authorization: Bearer {access_token}
    Response 401: 
      Try refresh_token → if succeeds, retry original request
      If refresh fails: logout + redirect to /login

Protected route wrapper (components/auth/ProtectedRoute.tsx):
  Check is_authenticated + role
  Redirect unauthorized to /login
  Redirect forbidden to /403

STEP 2C — Role-Based Dashboard Redirect

After login, redirect based on role:
  ADMIN, PRINCIPAL, VICE_PRINCIPAL, IT_ADMIN → /dashboard
  EXAM_CONTROLLER → /examination
  ACCOUNTANT → /fees
  LIBRARIAN → /library
  CLASS_TEACHER, SUBJECT_TEACHER → /attendance/mark
  STUDENT → (portal app, not admin)
  GUARDIAN → (portal app, not admin)
```

---

---

# ═══════════════════════════════════════════════
# PHASE 3 — Student Module
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check existing files. Tell me what exists. Proceed.

PHASE 3 GOAL: Complete student management — API + Admin UI (CRUD + 360° profile).

STEP 3A — Student API (server/api/src/modules/students/)

Student ID Generation Utility (server/api/src/utils/student-id.generator.ts):
  Read StudentIdConfig from DB
  Format: {prefix}{sep}{year?}{sep}{month?}{sep}{padded_sequence}
  Increment current_sequence atomically (use Prisma transaction)
  Handle scope: GLOBAL (always increment), YEARLY (reset each academic year), CLASS (reset per class)
  Export: generateStudentUID(): Promise<string>

Endpoints:

GET /api/students
  Query params: 
    search (name, phone, student_uid, roll_no, registration_no)
    class_id, section_id, status, gender
    academic_year_id, page, limit (default 20)
  Returns paginated list with: id, student_uid, name_en, name_bn, photo_url, 
    current_class.name, current_section.name, current_roll_no, status, guardian.phone
  Include total count

GET /api/students/:id
  Returns COMPLETE 360° profile:
  {
    personal: { all personal fields + guardian info },
    academic: {
      current: { class, section, roll_no, registration_no, board_roll, academic_year },
      history: [{ academic_year, class, section, roll_no, final_gpa, final_grade, status }]
    },
    subjects: [{
      subject_id, subject_name_en, subject_name_bn, subject_code,
      subject_type, is_compulsory, is_inherited,
      assigned_teacher: { name_en, designation } | null
    }],
    attendance: {
      current_year_summary: { total_days, present, absent, late, leave, percentage },
      monthly: [{ month, year, present, absent, late, total }]
    },
    results: [{
      exam_id, exam_name, academic_year, published_at,
      subjects: [{ subject_name, marks_theory, marks_practical, marks_total, grade, gpa_point, is_absent }],
      overall_gpa, overall_grade, position_in_section, position_in_class
    }],
    fees: {
      invoices: [{ id, category, description, amount_due, amount_paid, fine_amount, due_date, status }],
      outstanding_total: number,
      paid_total: number
    },
    library: { issued_books: [...], total_fines: number },
    transport: { route: { name, pickup_point }, vehicle: { number } } | null,
    hostel: { room: { number }, bed: { number } } | null,
    discipline: [{ date, note, recorded_by }]
  }

POST /api/students
  Body: all student fields
  Actions:
    1. Validate phone uniqueness
    2. Generate student_uid using student-id.generator.ts
    3. Create Guardian record (or find existing by phone)
    4. Create User record (phone as username, auto-generated password)
    5. Create Student record
    6. If current_class_id provided: run subject inheritance (next point)
    7. Send welcome SMS to guardian with student_uid + portal login credentials
  Returns created student with generated student_uid

POST /api/students — Subject Inheritance Logic (run inside student creation + class change):
  1. Fetch all COMPULSORY subjects for the class
  2. Create StudentSubject records for each (is_inherited=true)
  3. Fetch OPTIONAL subjects for the class → return to frontend to let admin choose
  4. For chosen optional subjects: create StudentSubject records (is_inherited=false)

PUT /api/students/:id
  Update personal/guardian/academic info
  If current_class_id changes:
    - Archive current class to StudentAcademicHistory
    - Run subject inheritance for new class
    - Clear old StudentSubject records (keep for historical results)

DELETE /api/students/:id (soft)
  Set deleted_at, status=INACTIVE
  Disable User account

POST /api/students/:id/promote
  Body: { new_class_id, new_section_id, new_academic_year_id, new_roll_no, notes }
  - Create StudentAcademicHistory entry for current year
  - Update Student.current_class_id, current_section_id
  - Run subject inheritance for new class
  - Requires: ADMIN, PRINCIPAL, EXAM_CONTROLLER

POST /api/students/bulk-promote
  Body: { class_id, section_id, new_class_id, new_section_id, new_academic_year_id, student_ids[] }
  - Bulk promote selected students
  - Skip students with F grade or below-minimum attendance (based on AttendanceRules + FeeRules)
  - Return: { promoted: [], skipped: [{ id, reason }] }

GET /api/students/:id/subjects
  Returns student's current subjects with teacher info

POST /api/students/:id/subjects/extra
  Body: { subject_id } — add extra course (university only, if InstitutionConfig.extra_course_enrollment=true)

DELETE /api/students/:id/subjects/:subject_id
  Remove optional/extra subject (cannot remove compulsory)

POST /api/students/bulk-import
  Body: CSV file (multipart)
  Parse CSV, validate each row, return preview with validation status
  POST /api/students/bulk-import/confirm → actually save after preview approved

STEP 3B — Student Admin UI

─── PAGE: /students ───

TOP BAR:
  Title: "Students" | Count badge "Total: 1,234 Active"
  Right: "Filter" button | "Import CSV" button | "+ Add Student" button

FILTER BAR (collapsible):
  Academic Year select | Class select (cascades) | Section select (cascades) | Status multi-select | Gender select | Search input

DATA TABLE (TanStack Table, server-side pagination):
  Columns:
    - Checkbox (for bulk actions)
    - Photo (avatar, 36×36, initials fallback)
    - Student UID (monospace, copy on click)
    - Name (EN + BN below in smaller text)
    - Class / Section
    - Roll No
    - Guardian Phone
    - Status badge (green=Active, gray=Inactive, orange=Transferred)
    - Actions: View | Edit | ⋮ (Promote, Disable, Delete)
  
  BULK ACTIONS (appear when rows checked):
    "Promote Selected" | "Export Selected" | "SMS Selected Guardians"

  ROW CLICK → navigate to /students/:id

─── PAGE: /students/new ───

Multi-step form with progress indicator:
  Step 1 — Personal Info
    name_en*, name_bn, gender*, date_of_birth*, religion, blood_group
    phone (student's own phone — optional), nid_or_birth_reg
    address_permanent, address_current, district
    Photo upload (drag-drop, crop to passport size 2:2.5 ratio)
    has_disability toggle → disability_note textarea

  Step 2 — Guardian Info  
    father_name, father_phone*, father_nid, father_occupation
    mother_name, mother_phone, mother_nid, mother_occupation
    "Same as guardian" checkbox → auto-fill guardian fields
    guardian_id search: "Has this guardian been registered before?" → phone search

  Step 3 — Academic Placement
    Academic Year select → Class select → Section select
    Roll No input
    Registration No input (optional at entry)
    Board Roll (optional)
    admission_date*
    Previous institution, previous class, previous result

  Step 4 — Subject Assignment
    Auto-shows: "Compulsory subjects (auto-assigned):" list with green checkmarks
    "Optional subjects: Select which to assign:" → checkbox list
    If UNIVERSITY + extra_course_enrollment: "+ Add Extra Course" button

  Step 5 — Review & Submit
    Summary card showing all entered data
    "Send portal login via SMS" toggle (on by default)
    "Create Student" button

─── PAGE: /students/:id ───

HEADER:
  Student photo (large, 100×120px, with edit overlay)
  Student UID (large, styled badge, copy button)
  Name EN (H1) + Name BN below
  Status badge | Class · Section · Roll
  Quick action buttons: Edit | Print ID Card | Print Admit Card | ⋮

TABS (sticky tab bar):
  Personal | Academic | Subjects | Attendance | Results | Fees | Library | Transport/Hostel

─── TAB: Personal ───
  Two-column info grid showing all personal + guardian fields
  "Edit" button → opens sheet panel with editable form

─── TAB: Academic ───
  Current Academic Year card:
    class, section, roll, registration, board roll, admission date
  
  Academic History timeline (most recent first):
    Year card: {year} → Class {name} · Section {name} · Roll {no}
    Result summary: GPA {x.xx} · Grade {X} · Status badge (Promoted/Failed/Transferred)

─── TAB: Subjects ───
  Table: Subject Name (EN+BN) | Code | Type | Compulsory/Optional badge | Assigned Teacher
  "+ Add Extra Course" button (if university mode)
  Remove button on optional/extra subjects

─── TAB: Attendance ───
  Summary cards: Present%, Absent, Late, Total Working Days
  Year selector
  Monthly calendar grid (12 months, color-coded squares per day)
  Month detail (click month → expand row showing each day status)
  Source indicator: B = biometric, M = manual

─── TAB: Results ───
  Exam list (most recent first)
  Expand each exam: 
    Subject-wise marks table: subject | theory | practical | total | grade | GPA
    Summary row: Total GPA | Grade | Position in Section | Position in Class
  "View Result Card" link → opens PDF in new tab

─── TAB: Fees ───
  Outstanding dues alert (if any) — red banner showing total due
  Filter: All / Pending / Paid / Overdue
  Invoice table: category | description | month/year | due date | amount | fine | paid | status | receipt link
  "Collect Payment" button (for accountant role) → inline payment dialog

─── TAB: Library ───
  Currently issued books table: book name | issued date | due date | status
  Fine outstanding badge

─── TAB: Transport/Hostel ───
  Transport assignment card + Hostel card
  Edit buttons for each
```

---

---

# ═══════════════════════════════════════════════
# PHASE 4 — Subjects & Teacher Assignment
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists.

PHASE 4 GOAL: Complete subject management and teacher-subject assignment.

─── API (/api/settings/subjects/) ───

GET  /api/subjects?class_id=&academic_year_id=
POST /api/subjects
  Body: class_id, name_en, name_bn, code, subject_type, is_compulsory, is_optional,
        full_marks, pass_marks, display_order
  Validate: code unique within class
PUT  /api/subjects/:id
DELETE /api/subjects/:id
  Block if: MarkEntry records exist for this subject → show error "This subject has exam records"
PUT  /api/subjects/reorder
  Body: [{ id, display_order }] → batch update order

GET  /api/subjects/:id/assignments?academic_year_id=
  Returns: all section assignments for this subject with teacher info

POST /api/subjects/assign
  Body: { subject_id, staff_id, section_id, academic_year_id }
  Validate: staff exists and is active
  One teacher per subject per section per year
PUT  /api/subjects/assign/:id  → change teacher
DELETE /api/subjects/assign/:id → unassign teacher

GET /api/staff/teachers
  Returns: all staff with teaching roles (CLASS_TEACHER, SUBJECT_TEACHER, HOD, HEAD_OF_DEPT)
  Used for assignment dropdowns

─── ADMIN UI (/settings/subjects) ───

Left panel: Class list (accordion by academic year)
  Click a class → Right panel shows subjects

Right panel — Subjects for selected class:
  Drag-to-reorder list of subjects
  Each row: Subject name (EN) | Code badge | Type badge | Compulsory/Optional chip | Full marks | Pass marks | Actions
  Inline "Add Subject" row at bottom
  
  Click subject → Expand to show "Teacher Assignments" section:
    Table: Section name | Assigned Teacher (with avatar) | Change button
    "Assign Teacher" button → search-combobox of active teaching staff

  Section "Inherited by N students" count shown per subject
```

---

---

# ═══════════════════════════════════════════════
# PHASE 5 — Attendance Module (Full)
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists.

PHASE 5 GOAL: Full attendance system — manual marking + reports + exports.

─── API (/api/attendance/) ───

POST /api/attendance/mark
  Body: { 
    class_id, section_id, shift_id, date, period_no?,
    records: [{ student_id, status: AttendanceStatus }],
    marked_by_id
  }
  Logic:
    1. Check for existing BIOMETRIC records for these students on this date+shift
    2. For students with biometric: flag as conflict → require override_reason or skip
    3. Validate date is not a holiday (check against holiday calendar)
    4. Upsert AttendanceRecord for each student
    5. Queue absence SMS notifications for absent students (if AttendanceRules.sms_on_absent)
    6. Emit Socket.io event: attendance:marked { section_id, date, summary }
  Returns: { saved: N, conflicts: [{ student_id, conflict_reason }] }

GET /api/attendance
  Query: section_id, date, shift_id, period_no?
  Returns: all students of section with their attendance status for that date
  Include: was_marked (boolean), source (biometric/manual/unmarked)

GET /api/attendance/student/:id
  Query: academic_year_id, month?, year?
  Returns:
    If month+year given: calendar view (array of { date, status, source } for that month)
    If no month: yearly summary { total_working_days, present, absent, late, leave, half_day, percentage }
    monthly_summary: [{ month, year, present, absent, late, total, percentage }]

GET /api/attendance/defaulters
  Query: class_id?, section_id?, threshold (default from AttendanceRules), academic_year_id
  Returns: students below threshold with their attendance % and contact info

GET /api/attendance/daily-summary
  Query: date, class_id?
  Returns: per-class summary { class, total_students, present, absent, late, percentage }
  Used for admin dashboard widget

─── Reports ───

GET /api/attendance/reports/daily-register
  Query: date, class_id, section_id
  Returns data for: formatted PDF "Daily Attendance Register"
  Include: institution header, date, class/section/shift, teacher name, list of students with P/A/L

GET /api/attendance/reports/monthly-sheet  
  Query: class_id, section_id, month, year
  Returns: grid data for monthly sheet (students × dates)
  Export as: PDF (landscape A4) or Excel

GET /api/attendance/reports/bulk-export
  Query: academic_year_id, month, year, class_id? (if omitted = all classes)
  Returns: Excel file, one sheet per class
  Filename: Attendance_{Month}_{Year}.xlsx

GET /api/attendance/reports/blank-sheet
  Query: class_id, section_id, from_date, to_date
  Returns: PDF — blank attendance sheet with student names + columns for each date

─── ADMIN UI (/attendance) ───

─── PAGE: /attendance/mark ───

TOP CONTROLS (sticky toolbar):
  1. Date picker (default: today)
  2. Academic Year (auto-selected: active year)
  3. Class select → 4. Section select → 5. Shift select
  6. Subject (optional — for subject-wise attendance)
  "Load Students" button → fetches attendance grid

SUMMARY HEADER (shown after loading):
  Pills: Total: 45 | Present: 0 | Absent: 0 | Late: 0 | Unmarked: 45

ATTENDANCE GRID:
  "Mark All Present" button | "Clear All" button
  
  Table rows (one per student):
    Photo (32px) | Roll | Name (EN + BN) | P | A | L | LV | HD | Note icon
    P/A/L/LV/HD = radio buttons (keyboard shortcut: P=present, A=absent, L=late)
    Note icon → click to add remark for that student
    
    Status colors:
      P = green background | A = red | L = orange | LV = blue | HD = yellow
    
    If biometric record exists for this date: show fingerprint icon badge
      Hover: "Biometric: Present at 07:42am"
      If manual differs: show warning icon "Override will replace biometric record"

  CONFLICT HANDLING:
    Students with biometric records shown with blue fingerprint badge
    If teacher changes status: show inline warning "This overrides biometric attendance. Reason required:"
    Override reason input appears inline

SAVE BUTTON:
  Show: "Saving 45 records..." progress
  On success: "Saved successfully. 38 Present, 5 Absent, 2 Late. SMS sent to 5 guardians."
  On conflict: show list of conflicts with options

─── PAGE: /attendance/reports ───

TABS: Daily Register | Monthly Sheet | Defaulters | Bulk Export | Print Blank Sheet

TAB — Daily Register:
  Date + Class + Section selectors
  Preview table below (lazy, not loaded until "Generate" clicked)
  "Download PDF" | "Download Excel" buttons

TAB — Monthly Sheet:
  Month picker + Class + Section
  Preview: grid with student names in rows, dates as columns
  Color-coded cells (green/red/orange/blue/gray)
  "Download PDF (Landscape)" | "Download Excel" buttons
  
TAB — Defaulters:
  Academic Year + Threshold% input + optional Class filter
  Results table: Student UID | Name | Class | Section | Present% | Absent Days | Guardian Phone
  "Send SMS to All" button → confirm dialog → queue SMS

TAB — Bulk Export:
  Month/Year picker + "All Classes" or single class
  "Generate Excel" button → downloads multi-sheet workbook

TAB — Print Blank Sheet:
  Class + Section + Date range
  "Generate PDF" → blank sheet with student names for manual classroom use
```

---

---

# ═══════════════════════════════════════════════
# PHASE 6 — Examination + Mark Entry + Grading
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists.

PHASE 6 GOAL: Exam setup, mark entry workflow, grading engine.

─── Grading Engine (server/api/src/utils/grading.engine.ts) ───

Build a testable, pure-function grading engine:

function calculateGrade(marks: number, scale: GradeRange[]): { grade_letter, grade_point, remarks }
  Find matching range. Handle absent (is_absent) → return { grade_letter: 'Ab', grade_point: 0 }

function calculateStudentResult(entries: MarkEntry[], config: ExamConfig): StudentResult
  For each subject: apply grading
  If fourth_subject_rule enabled: 
    Identify optional subjects. Drop the one with lowest GPA point. Recalculate overall.
  Calculate: total_gpa (average of remaining subjects), overall_grade_letter
  Return full result object

function calculatePositions(results: StudentResult[], scope: 'SECTION' | 'CLASS'): StudentResult[]
  Sort by total_gpa DESC (tie-break: total marks DESC)
  Assign position numbers. Handle ties (same position, skip next)

Write Jest unit tests for:
  - BD Board standard grading (check each boundary)
  - 4th subject rule (verify correct subject dropped)
  - Position calculation with ties

─── API (/api/examination/) ───

POST /api/exams
  Body: { name, exam_type_config_id, academic_year_id, start_date, end_date,
          mark_entry_opens_at, mark_entry_closes_at, grading_scale_id,
          classes: [{ class_id, sections: [section_id] }] }
  Create exam + ExamSubjectConfig for all subjects of each class (using default full/pass marks from Subject)
  Status: DRAFT

GET  /api/exams → list with filters
GET  /api/exams/:id → full exam details + subject configs
PUT  /api/exams/:id → update (only if status=DRAFT)
DELETE /api/exams/:id → soft delete (only DRAFT)

PUT  /api/exams/:id/status
  Body: { status } → ACTIVE | MARK_ENTRY | COMPLETED
  Validate transitions: DRAFT→ACTIVE→MARK_ENTRY→COMPLETED→PUBLISHED

PUT  /api/exams/:id/subject-config
  Body: [{ subject_id, full_marks_theory, full_marks_practical, pass_marks_theory, pass_marks_practical, pass_marks_combined }]
  Update configs

POST /api/exams/:id/seat-plan/generate
  Auto-assign hall + seat numbers to all students of the exam (alphabetical or roll-based)
  Body: { halls: [{ name, capacity }] }

GET  /api/exams/:id/seat-plan → full seat plan

─── Mark Entry (/api/marks/) ───

GET /api/marks/:exam_id/:class_id/:section_id
  Returns: grid — all students (rows) × all subjects (columns) with current marks
  Filter by: subject_id (for teacher who can only see own subject)
  If status=DRAFT: return null marks (empty grid)
  Include: entry_deadline_info { closes_at, is_open, time_remaining }

POST /api/marks/submit
  Body: { exam_id, entries: [{ student_id, subject_id, marks_theory?, marks_practical?, is_absent? }] }
  Authorization:
    SUBJECT_TEACHER: can only submit for their assigned subject(s)
    EXAM_CONTROLLER, PRINCIPAL, ADMIN: can submit any
  Validate: exam is in MARK_ENTRY status, window is open, marks <= full_marks
  Create/update MarkEntry records, status=SUBMITTED
  Calculate marks_total = theory + practical (or just theory if no practical)
  Run grading engine to compute grade_letter + grade_point
  
POST /api/marks/approve/:exam_id/:class_id
  Authorization: EXAM_CONTROLLER, PRINCIPAL, ADMIN only
  Validate: all subjects have marks submitted for this class
  Update all MarkEntry status → APPROVED
  Run position calculation
  Return: approval summary

POST /api/marks/publish/:exam_id/:class_id
  Authorization: EXAM_CONTROLLER, PRINCIPAL, ADMIN
  Prerequisite: all marks APPROVED
  Create/update ResultPublication record (is_published=true)
  Body: { is_public: boolean } — controls website visibility
  If is_public: trigger website ISR revalidation for /result page
  Queue SMS: "Dear parent, {student_name}'s result for {exam_name} is now available."

─── ADMIN UI (/examination) ───

─── PAGE: /examination ───
  Card grid of all exams grouped by academic year
  Each card: exam name, type badge, date range, status badge, class count
  Status badges: Draft(gray) | Active(blue) | Mark Entry(orange) | Completed(purple) | Published(green)
  "Create Exam" button

─── PAGE: /examination/new and /examination/:id ───
  Form: name, type (select from ExamTypeConfig), academic year, dates, mark entry window, grading scale
  Classes & Sections: checkbox tree — select which classes/sections this exam covers
  Subject Configuration table:
    Per class tab: table of subjects with editable full_marks/pass_marks columns
    Show "Total Marks" column updating live

─── PAGE: /examination/:id/seat-plan ───
  Input: hall names + capacities
  "Auto-Generate" → fills in seat numbers
  Printable seat plan table (generate PDF button)

─── PAGE: /marks ───
  My Mark Entry (for teachers — shows only their assigned subjects + open exams)
  Filter: Exam | Class | Section | Subject

─── PAGE: /marks/:exam_id/:class_id/:section_id ───
  MARK ENTRY GRID
  
  Header: Exam name | Class | Section | Subject (if filtered)
  Entry deadline countdown timer: "Entry closes in 2d 14h 32m"
  
  If subject teacher: shows ONE subject column
  If exam controller/admin: shows ALL subjects in tabs
  
  Grid:
    Columns: Roll | Photo | Student Name | [Subject columns...] | Actions
    Per subject column:
      If has_practical: split into "Theory | Practical" sub-columns
      Input cells: number input, max shown as placeholder
      Enter key moves to next cell (keyboard-friendly)
      "Ab" checkbox marks student absent (zeros out marks)
      Cell turns: green if marks >= pass_marks, red if below, yellow if absent
    
  BULK ACTIONS:
    "Mark All Absent" per subject (for practical exams when a group was absent)
  
  SUBMIT BUTTON: "Submit Marks" → confirmation "Submit N marks for X students. This will be sent for approval."
  After submission: cells become read-only, "Submitted" badge shown

─── PAGE: /marks/:exam_id/approve ───
  Per-class approval panel:
  Table: Class | Sections | Subjects Complete | Students | Status | Approve button
  "Approve All" button
  After approval: "Publish Results" button per class (with is_public toggle)
```

---

---

# ═══════════════════════════════════════════════
# PHASE 7 — Results & Report Cards
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists.

PHASE 7 GOAL: Result viewing, report cards, public result lookup, bulk print.

─── API (/api/results/) ───

GET /api/results/student/:id
  Query: academic_year_id?
  Returns all published results for a student across all exams
  Each result: { exam, subjects_with_marks, overall_gpa, overall_grade, position }

GET /api/results/exam/:exam_id
  Query: class_id, section_id?
  Returns full result set for published exam
  Include: merit list sorted by GPA/marks, position numbers

GET /api/results/public/lookup (NO AUTH)
  Query: roll_no + registration_no OR student_uid, exam_id?
  Only returns PUBLISHED + is_public=true results
  Returns limited public view (no internal flags)

GET /api/results/tabulation/:exam_id/:class_id
  Returns structured tabulation data for PDF/print
  All students × all subjects + GPA + position

─── Reports (/api/results/reports/) ───

GET /api/results/reports/merit-list/:exam_id/:class_id → ranked list PDF
GET /api/results/reports/subject-analysis/:exam_id/:class_id → per-subject stats PDF
GET /api/results/reports/campus-wide/:exam_id → all classes summary PDF
GET /api/results/reports/notice-board/:exam_id/:class_id → large print tabulation

─── ADMIN UI (/results) ───

─── PAGE: /results ───
  List of all exams with publish status per class
  Quick-access to: View Results | Print Tabulation | Manage Publication

─── PAGE: /results/:exam_id ───
  Tabs per class covered by this exam
  Per class tab:
    Merit list table: rank | photo | name | roll | subject marks columns | total | GPA | grade | position
    Subject analysis section: per-subject pass%, avg marks bar chart
    Print buttons: Merit List | Tabulation | Individual Report Cards (bulk)

─── PAGE: /students/:id (Results Tab) ───
  (Already in Phase 3 — ensure result data is populated)

─── PUBLIC RESULT LOOKUP (apps/website /result) ───
  Search form: 
    "Enter your Roll Number" + "Registration Number" or "Student ID"
    Optional: Select Exam
    "Find Result" button
  
  Result display card:
    Student name, class, roll
    Per-subject results table
    Overall GPA, grade, position
    Institution branding (logo, name)
    "Print" button (browser print, clean layout)

─── PAGE: /documents/print (Bulk Print Panel) ───
  
  LEFT: Document type selector (icon grid)
    📄 Marksheet  📋 Report Card  📊 Tabulation Sheet
    🎴 Admit Card 📇 Student ID Card  📜 Testimonial
    🔁 Transfer Certificate 📅 Attendance Sheet
    More...
  
  RIGHT: Filters (change per document type)
    For Marksheet/Report Card: Select Exam → Select Class → Select Section → "All Students" or search individual
    For Admit Card: Select Exam → Class → Section
    For ID Card: Class → Section → "All" or search
    
  PREVIEW COUNT: "This will generate 45 documents"
  
  ACTION BUTTONS:
    "Preview One" → shows first document in modal
    "Download All as PDF" → generates bulk PDF
    "Download Excel Data" → downloads data as Excel
```

---

---

# ═══════════════════════════════════════════════
# PHASE 8 — Fee & Finance Module
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists.

PHASE 8 GOAL: Fee structures, invoice generation, collection, payment gateways, reports.

─── API (/api/fees/ and /api/payments/) ───

FEE STRUCTURE:
POST /api/fees/structures
  Body: { academic_year_id, class_id?, section_id?, category, name, amount, frequency, due_day }
GET  /api/fees/structures?academic_year_id=&class_id=
PUT  /api/fees/structures/:id
DELETE /api/fees/structures/:id → block if invoices generated

INVOICE GENERATION:
POST /api/fees/invoices/generate
  Body: { fee_structure_id, month?, year?, student_ids?: [] (if empty = all eligible students) }
  Logic:
    For each student: check if invoice already exists (prevent duplicate)
    Calculate due_date based on due_day
    Check FeeRules: apply fine if overdue existing invoices
    Create Invoice records
  Returns: { created: N, skipped_duplicates: N }

POST /api/fees/invoices/generate-bulk-monthly
  Body: { academic_year_id, month, year }
  Generate all monthly invoices for all active students across all fee structures

GET  /api/fees/invoices?student_id=&status=&class_id=&month=&year=
GET  /api/fees/invoices/:id → invoice detail with payment history
PUT  /api/fees/invoices/:id/waive → apply waiver (ADMIN/ACCOUNTANT only, requires reason)

COLLECTION (manual):
POST /api/fees/collect
  Body: { invoice_id, amount, gateway: "CASH" | "BANK_TRANSFER", notes?, collected_by_id }
  Apply FeeRules: calculate fine if overdue
  Create Payment record
  Update Invoice.amount_paid, recalculate status
  Generate receipt PDF (via PDF service)
  Return: { payment, receipt_url }

ONLINE PAYMENT (gateway):
POST /api/payments/initiate
  Body: { invoice_id, gateway: "BKASH" | "NAGAD" | "SSLCOMMERZ" }
  Call gateway adapter.initiatePayment()
  Return: { payment_url, session_id } → frontend redirects student to payment URL

POST /api/payments/callback/bkash   → bKash webhook
POST /api/payments/callback/nagad   → Nagad callback
POST /api/payments/callback/sslcommerz → SSLCommerz IPN
  All callbacks: verify signature → update Invoice+Payment → send confirmation SMS

GET /api/fees/reports/daily-collection?date=
GET /api/fees/reports/monthly-summary?month=&year=
GET /api/fees/reports/dues?class_id=&days_overdue=
GET /api/fees/reports/defaulters?class_id=&days_overdue=
GET /api/fees/reports/export?from=&to= → Excel

PAYMENT ADAPTERS: (server/api/src/services/payment/)
  gateway.interface.ts: PaymentAdapter interface
  bkash.adapter.ts: bKash Checkout API integration (sandbox + production)
  nagad.adapter.ts: Nagad API integration
  sslcommerz.adapter.ts: SSLCommerz integration

─── ADMIN UI (/fees) ───

─── PAGE: /fees ───
  Dashboard cards: Today's Collection | This Month | Outstanding Total | Defaulters count
  Quick actions: Generate Monthly Invoices | Collect Payment | View Reports

─── PAGE: /fees/structures ───
  Table of fee structures grouped by academic year
  "Add Fee Structure" → dialog with all fields
  Copy from previous year button

─── PAGE: /fees/invoices ───
  Powerful filter bar: Student search | Class | Section | Status | Month | Year
  Table: Student | UID | Class | Category | Amount | Fine | Paid | Status | Due Date | Actions
  Bulk generate invoices button per month

─── PAGE: /fees/collect ───
  Student search bar (search by name, UID, phone)
  On student select: show all outstanding invoices
  Each invoice: check to select → amount to collect → payment method
  "Collect" button → receipt generated, print option

─── PAGE: /fees/reports ───
  Tabs: Daily Collection | Monthly Summary | Due Report | Defaulters | Export
  Each tab: appropriate filters + data table + Download PDF/Excel buttons
```

---

---

# ═══════════════════════════════════════════════
# PHASE 9 — Online Admission
# ═══════════════════════════════════════════════

```
Read CLAUDE.md. Check what exists.

PHASE 9 GOAL: Online admission cycle management + applicant processing + auto-enrollment.
[Full prompt continues from PHASE_PROMPTS_PART2.md]
```

---

## 📌 Phases 9–18 in PHASE_PROMPTS_PART2.md

Phases 9 through 18 (Admission, Documents, Website Maintenance, HR, Library/Transport/Hostel, Analytics, Portal PWA, Public Website, IoT Device Service, Notification Service) are documented in PHASE_PROMPTS_PART2.md.

Create that file next using:
"Continue Phase 9 through 18 for the Education ERP. Read CLAUDE.md and PHASE_PROMPTS.md first."