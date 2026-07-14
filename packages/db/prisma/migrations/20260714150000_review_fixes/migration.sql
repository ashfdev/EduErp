-- Fixes found during a post-merge correctness review of Phases 40-53.

-- ShiftPeriod was missing audit columns (created_at/updated_at), inconsistent
-- with the rest of the schema.
ALTER TABLE "ShiftPeriod" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ShiftPeriod" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- RoutineSlot's unique index on (class_id, section_id, day_of_week,
-- period_no) does not prevent duplicate slots when section_id is NULL,
-- because Postgres treats every NULL as distinct from every other NULL in a
-- unique index. A class without sections (or a manual entry that omits a
-- section) could otherwise get two conflicting slots for the same
-- class/day/period. This partial index closes that gap without touching the
-- existing index, which still correctly covers the has-a-section case.
CREATE UNIQUE INDEX "RoutineSlot_class_day_period_null_section_key" ON "RoutineSlot"("class_id", "day_of_week", "period_no") WHERE "section_id" IS NULL;
