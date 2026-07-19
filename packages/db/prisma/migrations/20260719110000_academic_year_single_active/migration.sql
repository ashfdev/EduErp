-- Defensive constraint: at most one AcademicYear row may be is_active = true.
-- The application's POST /:id/activate route already enforces this via an
-- atomic "deactivate all, then activate one" transaction, but a stray test
-- fixture with is_active=true (created directly against the DB, bypassing
-- the app layer) was found live in the dev database. This partial unique
-- index makes that class of bug impossible going forward, not just in the
-- one call path that already does the right thing.
CREATE UNIQUE INDEX "academic_year_single_active" ON "AcademicYear" (is_active) WHERE is_active = true;
