-- AlterTable
ALTER TABLE "User" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: every account that existed before this migration is already in
-- active use — retroactively forcing a password change on next login would
-- lock out the whole institution at once. Only accounts created or reset
-- AFTER this migration (via application code, not this DEFAULT) start out
-- true.
UPDATE "User" SET "must_change_password" = false;

