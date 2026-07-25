-- CreateTable
CREATE TABLE "MarksheetDisplaySettings" (
    "id" TEXT NOT NULL,
    "show_institute_banner" BOOLEAN NOT NULL DEFAULT true,
    "show_qr_code" BOOLEAN NOT NULL DEFAULT true,
    "show_general_ability_table" BOOLEAN NOT NULL DEFAULT false,
    "show_student_image" BOOLEAN NOT NULL DEFAULT true,
    "show_attendance_info" BOOLEAN NOT NULL DEFAULT true,
    "show_subject_full_marks" BOOLEAN NOT NULL DEFAULT true,
    "show_subject_pass_marks" BOOLEAN NOT NULL DEFAULT false,
    "show_highest_in_class" BOOLEAN NOT NULL DEFAULT false,
    "show_highest_in_section" BOOLEAN NOT NULL DEFAULT false,
    "show_position_in_class" BOOLEAN NOT NULL DEFAULT false,
    "show_position_in_section" BOOLEAN NOT NULL DEFAULT false,
    "show_average_position" BOOLEAN NOT NULL DEFAULT false,
    "show_average_percentage" BOOLEAN NOT NULL DEFAULT false,
    "show_average_marks" BOOLEAN NOT NULL DEFAULT false,
    "show_average_grade_point" BOOLEAN NOT NULL DEFAULT false,
    "show_average_remarks" BOOLEAN NOT NULL DEFAULT false,
    "show_published_date" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarksheetDisplaySettings_pkey" PRIMARY KEY ("id")
);
