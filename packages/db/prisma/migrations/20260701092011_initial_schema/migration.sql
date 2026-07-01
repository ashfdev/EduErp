-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('SCHOOL', 'COLLEGE', 'UNIVERSITY', 'MADRASAH');

-- CreateEnum
CREATE TYPE "AcademicCalendarType" AS ENUM ('YEARLY', 'SEMESTER', 'TRIMESTER');

-- CreateEnum
CREATE TYPE "IdSequenceScope" AS ENUM ('GLOBAL', 'YEARLY', 'CLASS');

-- CreateEnum
CREATE TYPE "GradeScaleType" AS ENUM ('GPA_5', 'GPA_4', 'PERCENTAGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'EXAM_CONTROLLER', 'HEAD_OF_DEPT', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_MANAGER', 'HOSTEL_MANAGER', 'PROCTOR', 'REGISTRAR', 'IT_ADMIN', 'STUDENT', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('EN', 'BN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "GuardianRelation" AS ENUM ('FATHER', 'MOTHER', 'UNCLE', 'AUNT', 'BROTHER', 'SISTER', 'OTHER');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED', 'EXPELLED');

-- CreateEnum
CREATE TYPE "HistoryStatus" AS ENUM ('PROMOTED', 'FAILED', 'TRANSFERRED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('STUDENT', 'STAFF');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('BIOMETRIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('FINGERPRINT', 'RFID', 'GPS');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ERROR');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('THEORY', 'PRACTICAL', 'BOTH');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'ACTIVE', 'MARK_ENTRY', 'COMPLETED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MarkStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('ADMISSION', 'TUITION', 'EXAM', 'TRANSPORT', 'HOSTEL', 'LAB', 'LIBRARY', 'SPORTS', 'DEVELOPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "LateFeeType" AS ENUM ('FIXED', 'PERCENTAGE', 'DAILY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('BKASH', 'NAGAD', 'ROCKET', 'SSLCOMMERZ', 'AAMARPAY', 'CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID');

-- CreateEnum
CREATE TYPE "AuthorityRole" AS ENUM ('PRINCIPAL', 'VICE_PRINCIPAL', 'HEADMASTER', 'VICE_CHANCELLOR', 'PRO_VICE_CHANCELLOR', 'EXAM_CONTROLLER', 'REGISTRAR', 'PROCTOR', 'DEAN', 'HOD', 'LIBRARIAN', 'ACCOUNTANT', 'CLASS_TEACHER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('STUDENT_ID_CARD', 'STAFF_ID_CARD', 'ADMIT_CARD', 'REGISTRATION_CARD', 'MARKSHEET', 'REPORT_CARD', 'TABULATION_SHEET', 'TESTIMONIAL', 'TRANSFER_CERTIFICATE', 'ATTENDANCE_SHEET', 'ATTENDANCE_BLANK', 'FEE_RECEIPT', 'PAYSLIP', 'SYLLABUS', 'MERIT_LIST');

-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('PUBLIC', 'STUDENTS', 'STAFF', 'GUARDIANS', 'ALL');

-- CreateEnum
CREATE TYPE "NotificationTrigger" AS ENUM ('ABSENCE', 'LATE', 'FEE_DUE', 'RESULT_PUBLISHED', 'NOTICE', 'ADMISSION_CONFIRM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "DownloadCategory" AS ENUM ('SYLLABUS', 'EXAM_SCHEDULE', 'FORMS', 'RESULTS', 'CIRCULARS', 'OTHERS');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('PENDING', 'SHORTLISTED', 'WAITLISTED', 'REJECTED', 'CONFIRMED', 'ENROLLED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'PART_TIME');

-- CreateTable
CREATE TABLE "InstitutionProfile" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "tagline_en" TEXT,
    "tagline_bn" TEXT,
    "type" "InstitutionType" NOT NULL,
    "eiin" TEXT,
    "board" TEXT,
    "founded_year" INTEGER,
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#1a3c4a',
    "secondary_color" TEXT NOT NULL DEFAULT '#2e7d9a',
    "address" TEXT,
    "district" TEXT,
    "division" TEXT,
    "post_code" TEXT,
    "phone_primary" TEXT,
    "phone_secondary" TEXT,
    "email_primary" TEXT,
    "email_secondary" TEXT,
    "website_url" TEXT,
    "facebook_url" TEXT,
    "youtube_url" TEXT,
    "map_embed_code" TEXT,
    "principal_name" TEXT,
    "principal_designation" TEXT,
    "established_text" TEXT,
    "mission_text" TEXT,
    "vision_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionConfig" (
    "id" TEXT NOT NULL,
    "academic_calendar_type" "AcademicCalendarType" NOT NULL DEFAULT 'YEARLY',
    "has_shifts" BOOLEAN NOT NULL DEFAULT true,
    "has_sections" BOOLEAN NOT NULL DEFAULT true,
    "has_departments" BOOLEAN NOT NULL DEFAULT false,
    "has_semesters" BOOLEAN NOT NULL DEFAULT false,
    "show_hijri_calendar" BOOLEAN NOT NULL DEFAULT false,
    "term_class" TEXT NOT NULL DEFAULT 'Class',
    "term_section" TEXT NOT NULL DEFAULT 'Section',
    "term_teacher" TEXT NOT NULL DEFAULT 'Teacher',
    "term_principal" TEXT NOT NULL DEFAULT 'Principal',
    "term_exam_controller" TEXT NOT NULL DEFAULT 'Exam Controller',
    "term_student_id" TEXT NOT NULL DEFAULT 'Student ID',
    "term_roll" TEXT NOT NULL DEFAULT 'Roll No',
    "term_registration" TEXT NOT NULL DEFAULT 'Registration No',
    "extra_course_enrollment" BOOLEAN NOT NULL DEFAULT false,
    "show_practical_marks" BOOLEAN NOT NULL DEFAULT false,
    "show_subject_teacher_on_result" BOOLEAN NOT NULL DEFAULT true,
    "allow_partial_fee_payment" BOOLEAN NOT NULL DEFAULT true,
    "show_position_in_result" BOOLEAN NOT NULL DEFAULT true,
    "show_class_position" BOOLEAN NOT NULL DEFAULT true,
    "show_section_position" BOOLEAN NOT NULL DEFAULT true,
    "fourth_subject_rule" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentIdConfig" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'STU',
    "include_year" BOOLEAN NOT NULL DEFAULT true,
    "year_format" TEXT NOT NULL DEFAULT '2',
    "include_month" BOOLEAN NOT NULL DEFAULT false,
    "separator" TEXT NOT NULL DEFAULT '-',
    "sequence_digits" INTEGER NOT NULL DEFAULT 4,
    "sequence_scope" "IdSequenceScope" NOT NULL DEFAULT 'GLOBAL',
    "current_sequence" INTEGER NOT NULL DEFAULT 0,
    "preview_example" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentIdConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingScale" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "scale_type" "GradeScaleType" NOT NULL DEFAULT 'GPA_5',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeRange" (
    "id" TEXT NOT NULL,
    "grading_scale_id" TEXT NOT NULL,
    "min_marks" DOUBLE PRECISION NOT NULL,
    "max_marks" DOUBLE PRECISION NOT NULL,
    "grade_letter" TEXT NOT NULL,
    "grade_point" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamTypeConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "weight_in_annual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allows_absent_marking" BOOLEAN NOT NULL DEFAULT true,
    "has_practical" BOOLEAN NOT NULL DEFAULT false,
    "has_viva" BOOLEAN NOT NULL DEFAULT false,
    "practical_marks_separate" BOOLEAN NOT NULL DEFAULT false,
    "is_board_exam" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeRules" (
    "id" TEXT NOT NULL,
    "late_fee_enabled" BOOLEAN NOT NULL DEFAULT true,
    "late_fee_type" "LateFeeType" NOT NULL DEFAULT 'FIXED',
    "late_fee_amount" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "late_fee_daily_cap" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "grace_period_days" INTEGER NOT NULL DEFAULT 5,
    "fine_applies_to_exam_fee" BOOLEAN NOT NULL DEFAULT false,
    "block_result_on_due" BOOLEAN NOT NULL DEFAULT false,
    "block_admit_on_due" BOOLEAN NOT NULL DEFAULT false,
    "partial_payment_allowed" BOOLEAN NOT NULL DEFAULT true,
    "advance_payment_allowed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRules" (
    "id" TEXT NOT NULL,
    "min_attendance_percentage" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "late_arrival_window_minutes" INTEGER NOT NULL DEFAULT 15,
    "working_days_per_week" INTEGER NOT NULL DEFAULT 6,
    "count_late_as_absent_after" INTEGER NOT NULL DEFAULT 3,
    "sms_on_absent" BOOLEAN NOT NULL DEFAULT true,
    "sms_on_late" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityConfig" (
    "id" TEXT NOT NULL,
    "doc_type" "DocumentType" NOT NULL,
    "slot" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "authority_role" "AuthorityRole" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthoritySignature" (
    "id" TEXT NOT NULL,
    "role" "AuthorityRole" NOT NULL,
    "display_name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "signature_url" TEXT,
    "seal_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthoritySignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "doc_type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "html_content" TEXT NOT NULL,
    "css_content" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "preview_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationConfig" (
    "id" TEXT NOT NULL,
    "trigger" "NotificationTrigger" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "template_bn" TEXT NOT NULL,
    "template_en" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "code" TEXT NOT NULL,
    "head_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "department_id" TEXT,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "numeric_level" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "class_teacher_id" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 50,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "code" TEXT NOT NULL,
    "subject_type" "SubjectType" NOT NULL DEFAULT 'THEORY',
    "is_compulsory" BOOLEAN NOT NULL DEFAULT true,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "full_marks" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "pass_marks" DOUBLE PRECISION NOT NULL DEFAULT 33,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectTeacherAssignment" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "section_id" TEXT,
    "academic_year_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectTeacherAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "role" "UserRole" NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "lang_pref" "Lang" NOT NULL DEFAULT 'BN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "relation" "GuardianRelation" NOT NULL,
    "phone" TEXT NOT NULL,
    "nid" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "student_uid" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" "Gender" NOT NULL,
    "religion" TEXT,
    "blood_group" TEXT,
    "nationality" TEXT NOT NULL DEFAULT 'Bangladeshi',
    "nid_or_birth_reg" TEXT,
    "phone" TEXT,
    "guardian_id" TEXT,
    "father_name" TEXT,
    "father_phone" TEXT,
    "father_nid" TEXT,
    "father_occupation" TEXT,
    "mother_name" TEXT,
    "mother_phone" TEXT,
    "mother_nid" TEXT,
    "mother_occupation" TEXT,
    "address_permanent" TEXT,
    "address_current" TEXT,
    "district" TEXT,
    "current_class_id" TEXT,
    "current_section_id" TEXT,
    "current_roll_no" TEXT,
    "registration_no" TEXT,
    "board_roll" TEXT,
    "biometric_id" TEXT,
    "admission_date" TIMESTAMP(3),
    "previous_institution" TEXT,
    "previous_class" TEXT,
    "previous_result" TEXT,
    "photo_url" TEXT,
    "signature_url" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "has_disability" BOOLEAN NOT NULL DEFAULT false,
    "disability_note" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAcademicHistory" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "roll_no" TEXT,
    "final_gpa" DOUBLE PRECISION,
    "final_grade" TEXT,
    "status" "HistoryStatus" NOT NULL,
    "promoted_by_id" TEXT,
    "promoted_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAcademicHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSubject" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "is_inherited" BOOLEAN NOT NULL DEFAULT true,
    "academic_year_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "staff_uid" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "designation" TEXT NOT NULL,
    "department_id" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" "Gender",
    "religion" TEXT,
    "blood_group" TEXT,
    "nid" TEXT,
    "tin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "photo_url" TEXT,
    "signature_url" TEXT,
    "biometric_id" TEXT,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'PERMANENT',
    "joining_date" TIMESTAMP(3),
    "salary_structure_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "person_type" "PersonType" NOT NULL,
    "date" DATE NOT NULL,
    "shift_id" TEXT,
    "section_id" TEXT,
    "student_id" TEXT,
    "period_no" INTEGER,
    "status" "AttendanceStatus" NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "device_id" TEXT,
    "marked_by_id" TEXT,
    "override_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "brand" TEXT,
    "location" TEXT,
    "ip_address" TEXT,
    "port" INTEGER DEFAULT 4370,
    "last_sync_at" TIMESTAMP(3),
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePunchLog" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_user_id" TEXT NOT NULL,
    "punch_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mapped_person_id" TEXT,
    "is_processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DevicePunchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "exam_type_config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "mark_entry_opens_at" TIMESTAMP(3),
    "mark_entry_closes_at" TIMESTAMP(3),
    "grading_scale_id" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSubjectConfig" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "full_marks_theory" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "full_marks_practical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pass_marks_theory" DOUBLE PRECISION NOT NULL DEFAULT 33,
    "pass_marks_practical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pass_marks_combined" DOUBLE PRECISION NOT NULL DEFAULT 33,

    CONSTRAINT "ExamSubjectConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkEntry" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "marks_theory" DOUBLE PRECISION,
    "marks_practical" DOUBLE PRECISION,
    "marks_total" DOUBLE PRECISION,
    "is_absent" BOOLEAN NOT NULL DEFAULT false,
    "grade_letter" TEXT,
    "grade_point" DOUBLE PRECISION,
    "status" "MarkStatus" NOT NULL DEFAULT 'DRAFT',
    "entered_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSeatPlan" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "hall_name" TEXT,
    "seat_number" TEXT,
    "invigilator_id" TEXT,

    CONSTRAINT "ExamSeatPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultPublication" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "published_by_id" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResultPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "class_id" TEXT,
    "section_id" TEXT,
    "category" "FeeCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" "FeeFrequency" NOT NULL,
    "due_day" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "fee_structure_id" TEXT,
    "academic_year_id" TEXT NOT NULL,
    "category" "FeeCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount_due" DOUBLE PRECISION NOT NULL,
    "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fine_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "month" INTEGER,
    "year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "transaction_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "paid_at" TIMESTAMP(3),
    "receipt_url" TEXT,
    "notes" TEXT,
    "collected_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days_allowed" INTEGER NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "from_date" TIMESTAMP(3) NOT NULL,
    "to_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basic" DOUBLE PRECISION NOT NULL,
    "house_rent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transport" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pf_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tds_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "working_days" INTEGER NOT NULL,
    "present_days" INTEGER NOT NULL,
    "gross_salary" DOUBLE PRECISION NOT NULL,
    "deductions" DOUBLE PRECISION NOT NULL,
    "net_salary" DOUBLE PRECISION NOT NULL,
    "advance_deducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "payslip_url" TEXT,
    "processed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_url" TEXT,
    "audience" "NoticeAudience" NOT NULL DEFAULT 'PUBLIC',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "is_public_website" BOOLEAN NOT NULL DEFAULT true,
    "send_sms" BOOLEAN NOT NULL DEFAULT false,
    "sms_sent_at" TIMESTAMP(3),
    "publish_at" TIMESTAMP(3),
    "expire_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SliderImage" (
    "id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "btn_text" TEXT,
    "btn_link" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "publish_from" TIMESTAMP(3),
    "publish_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SliderImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryAlbum" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "description" TEXT,
    "cover_url" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "album_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "caption" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Download" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "category" "DownloadCategory" NOT NULL,
    "academic_year_id" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Download_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaticPage" (
    "id" TEXT NOT NULL,
    "page_key" TEXT NOT NULL,
    "title_en" TEXT,
    "title_bn" TEXT,
    "content_en" TEXT,
    "content_bn" TEXT,
    "meta_title" TEXT,
    "meta_desc" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaticPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoverningBodyMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'Governing Body',
    "photo_url" TEXT,
    "bio" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoverningBodyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionCycle" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "open_date" TIMESTAMP(3) NOT NULL,
    "close_date" TIMESTAMP(3) NOT NULL,
    "seat_count" INTEGER NOT NULL,
    "app_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_open" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "form_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionApplication" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "admission_roll" TEXT,
    "applicant_name" TEXT NOT NULL,
    "guardian_info" JSONB NOT NULL,
    "personal_info" JSONB NOT NULL,
    "previous_result" JSONB,
    "selected_subjects" JSONB,
    "documents" JSONB,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'PENDING',
    "merit_rank" INTEGER,
    "payment_id" TEXT,
    "enrolled_student_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionProfile_eiin_key" ON "InstitutionProfile"("eiin");

-- CreateIndex
CREATE INDEX "GradeRange_grading_scale_id_idx" ON "GradeRange"("grading_scale_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExamTypeConfig_code_key" ON "ExamTypeConfig"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityConfig_doc_type_slot_key" ON "AuthorityConfig"("doc_type", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationConfig_trigger_channel_key" ON "NotificationConfig"("trigger", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_label_key" ON "AcademicYear"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_head_id_key" ON "Department"("head_id");

-- CreateIndex
CREATE INDEX "Class_academic_year_id_idx" ON "Class"("academic_year_id");

-- CreateIndex
CREATE INDEX "Section_class_id_idx" ON "Section"("class_id");

-- CreateIndex
CREATE INDEX "Subject_class_id_idx" ON "Subject"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_class_id_code_key" ON "Subject"("class_id", "code");

-- CreateIndex
CREATE INDEX "SubjectTeacherAssignment_staff_id_idx" ON "SubjectTeacherAssignment"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectTeacherAssignment_subject_id_section_id_academic_yea_key" ON "SubjectTeacherAssignment"("subject_id", "section_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_user_id_idx" ON "RefreshToken"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Student_user_id_key" ON "Student"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Student_student_uid_key" ON "Student"("student_uid");

-- CreateIndex
CREATE INDEX "Student_current_class_id_idx" ON "Student"("current_class_id");

-- CreateIndex
CREATE INDEX "Student_current_section_id_idx" ON "Student"("current_section_id");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE INDEX "StudentAcademicHistory_student_id_idx" ON "StudentAcademicHistory"("student_id");

-- CreateIndex
CREATE INDEX "StudentSubject_student_id_idx" ON "StudentSubject"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSubject_student_id_subject_id_academic_year_id_key" ON "StudentSubject"("student_id", "subject_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_user_id_key" ON "Staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_staff_uid_key" ON "Staff"("staff_uid");

-- CreateIndex
CREATE INDEX "Staff_department_id_idx" ON "Staff"("department_id");

-- CreateIndex
CREATE INDEX "AttendanceRecord_person_id_date_idx" ON "AttendanceRecord"("person_id", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_section_id_date_idx" ON "AttendanceRecord"("section_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_person_id_person_type_date_shift_id_period_key" ON "AttendanceRecord"("person_id", "person_type", "date", "shift_id", "period_no");

-- CreateIndex
CREATE INDEX "DevicePunchLog_device_id_punch_at_idx" ON "DevicePunchLog"("device_id", "punch_at");

-- CreateIndex
CREATE INDEX "Exam_academic_year_id_idx" ON "Exam"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSubjectConfig_exam_id_subject_id_key" ON "ExamSubjectConfig"("exam_id", "subject_id");

-- CreateIndex
CREATE INDEX "MarkEntry_exam_id_student_id_idx" ON "MarkEntry"("exam_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "MarkEntry_exam_id_student_id_subject_id_key" ON "MarkEntry"("exam_id", "student_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeatPlan_exam_id_student_id_key" ON "ExamSeatPlan"("exam_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "ResultPublication_exam_id_class_id_key" ON "ResultPublication"("exam_id", "class_id");

-- CreateIndex
CREATE INDEX "Invoice_student_id_idx" ON "Invoice"("student_id");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transaction_id_key" ON "Payment"("transaction_id");

-- CreateIndex
CREATE INDEX "Payment_invoice_id_idx" ON "Payment"("invoice_id");

-- CreateIndex
CREATE INDEX "LeaveRequest_staff_id_idx" ON "LeaveRequest"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRecord_staff_id_month_year_key" ON "PayrollRecord"("staff_id", "month", "year");

-- CreateIndex
CREATE INDEX "GalleryImage_album_id_idx" ON "GalleryImage"("album_id");

-- CreateIndex
CREATE UNIQUE INDEX "StaticPage_page_key_key" ON "StaticPage"("page_key");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionApplication_admission_roll_key" ON "AdmissionApplication"("admission_roll");

-- CreateIndex
CREATE INDEX "AdmissionApplication_cycle_id_idx" ON "AdmissionApplication"("cycle_id");

-- AddForeignKey
ALTER TABLE "GradeRange" ADD CONSTRAINT "GradeRange_grading_scale_id_fkey" FOREIGN KEY ("grading_scale_id") REFERENCES "GradingScale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_class_teacher_id_fkey" FOREIGN KEY ("class_teacher_id") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectTeacherAssignment" ADD CONSTRAINT "SubjectTeacherAssignment_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectTeacherAssignment" ADD CONSTRAINT "SubjectTeacherAssignment_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_current_class_id_fkey" FOREIGN KEY ("current_class_id") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_current_section_id_fkey" FOREIGN KEY ("current_section_id") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAcademicHistory" ADD CONSTRAINT "StudentAcademicHistory_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAcademicHistory" ADD CONSTRAINT "StudentAcademicHistory_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSubject" ADD CONSTRAINT "StudentSubject_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSubject" ADD CONSTRAINT "StudentSubject_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePunchLog" ADD CONSTRAINT "DevicePunchLog_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_exam_type_config_id_fkey" FOREIGN KEY ("exam_type_config_id") REFERENCES "ExamTypeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_grading_scale_id_fkey" FOREIGN KEY ("grading_scale_id") REFERENCES "GradingScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubjectConfig" ADD CONSTRAINT "ExamSubjectConfig_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubjectConfig" ADD CONSTRAINT "ExamSubjectConfig_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkEntry" ADD CONSTRAINT "MarkEntry_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkEntry" ADD CONSTRAINT "MarkEntry_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkEntry" ADD CONSTRAINT "MarkEntry_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeatPlan" ADD CONSTRAINT "ExamSeatPlan_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeatPlan" ADD CONSTRAINT "ExamSeatPlan_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultPublication" ADD CONSTRAINT "ResultPublication_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "FeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "GalleryAlbum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionCycle" ADD CONSTRAINT "AdmissionCycle_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionCycle" ADD CONSTRAINT "AdmissionCycle_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "AdmissionCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
