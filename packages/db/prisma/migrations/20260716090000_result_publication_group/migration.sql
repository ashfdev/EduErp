-- Add group_id to ResultPublication so a class's groups can be published
-- independently of each other (Phase 75). null means "this class has no
-- Groups defined" (unchanged existing behavior).
ALTER TABLE "ResultPublication" ADD COLUMN "group_id" TEXT;

-- Replace the old (exam_id, class_id) unique index with a constraint that
-- includes group_id. The original was created as a plain UNIQUE INDEX (not
-- a named table constraint), so it must be dropped with DROP INDEX.
DROP INDEX "ResultPublication_exam_id_class_id_key";
ALTER TABLE "ResultPublication" ADD CONSTRAINT "ResultPublication_exam_id_class_id_group_id_key" UNIQUE ("exam_id", "class_id", "group_id");

-- Postgres treats every NULL as distinct in a unique index, so the
-- constraint above alone would still allow duplicate rows for every
-- ungrouped class (group_id IS NULL). A partial unique index closes that
-- gap — mirrors RoutineSlot's identical nullable-section_id trap
-- (see migrations 20260714150000_review_fixes / 20260714150500_routine_teacher_clash_constraint).
CREATE UNIQUE INDEX "ResultPublication_exam_class_no_group_unique" ON "ResultPublication"("exam_id", "class_id") WHERE "group_id" IS NULL;
