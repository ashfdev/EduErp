-- Real bug found (2026-08-10, QA audit spot-check): Staff.biometric_id and
-- Student.biometric_id had no uniqueness constraint at all. The biometric
-- punch processor (services/device/src/processor/punch.processor.ts)
-- resolves a punch via `findFirst({ where: { biometric_id } })` with no
-- explicit ordering -- if a device UID were ever assigned to two currently
-- active people at once (e.g. an admin reassigns a device slot when a staff
-- member is replaced but forgets to clear the old row's biometric_id first),
-- which row's punch gets recorded is genuinely ambiguous, and a resigned-
-- but-not-deleted staff member's stale biometric_id could still match new
-- punches meant for their replacement.
--
-- Partial unique indexes (not expressible via Prisma's @@unique without a
-- WHERE clause) scoped to currently-active rows only, matching the exact
-- pattern already used for RoutineSlot's own collision constraints
-- (20260806130000_routine_slot_group_null_constraint) -- deliberately NOT a
-- blanket unique-forever constraint, since a resigned/graduated/transferred
-- person's old device UID must remain freely reassignable to whoever
-- inherits that physical device slot next.
CREATE UNIQUE INDEX "Staff_biometric_id_active_key"
  ON "Staff" (biometric_id)
  WHERE biometric_id IS NOT NULL AND deleted_at IS NULL AND is_active = true;

CREATE UNIQUE INDEX "Student_biometric_id_active_key"
  ON "Student" (biometric_id)
  WHERE biometric_id IS NOT NULL AND deleted_at IS NULL AND status = 'ACTIVE';
