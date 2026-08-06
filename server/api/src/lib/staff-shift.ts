// A staff member's effective shift hours (Plan Twenty-Five, Phase D) — a
// nullable custom-hours pair on Staff (for staff whose real hours don't
// match any shift: accountant, guard, admin staff) takes precedence over
// their assigned Shift when both happen to be set. Returns null when
// neither is configured, which is the exact "no shift-based tracking at
// all" state every staff member was already in before this phase — every
// downstream consumer (late-window matching, overtime) must treat null the
// same way it already treats a missing shift today.
export interface StaffShiftSource {
  custom_shift_start_time?: string | null;
  custom_shift_end_time?: string | null;
  shift?: { start_time: string; end_time: string } | null;
}

export function resolveStaffShiftTimes(staff: StaffShiftSource): { start_time: string; end_time: string } | null {
  if (staff.custom_shift_start_time && staff.custom_shift_end_time) {
    return { start_time: staff.custom_shift_start_time, end_time: staff.custom_shift_end_time };
  }
  if (staff.shift) {
    return { start_time: staff.shift.start_time, end_time: staff.shift.end_time };
  }
  return null;
}
