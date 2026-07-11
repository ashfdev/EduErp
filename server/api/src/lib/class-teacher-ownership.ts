import { prisma } from "./prisma";
import { forbidden, notFound } from "./errors";

// Shared by any module where CLASS_TEACHER is granted access to a specific
// student's records (health, discipline) but must be scoped to their own
// class — mirrors attendance.routes.ts's assertSectionOwnership, just
// entered from a student_id instead of a section_id directly. ADMIN/
// SUPER_ADMIN/PRINCIPAL bypass, matching every other ownership check in
// this codebase.
export async function assertClassTeacherOfStudent(userId: string, role: string, studentId: string): Promise<void> {
  if (role === "ADMIN" || role === "SUPER_ADMIN" || role === "PRINCIPAL") return;

  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { current_section_id: true } });
  if (!student) throw notFound("Student not found");
  if (!student.current_section_id) throw forbidden("You are not the class teacher for this student");

  const staff = await prisma.staff.findFirst({ where: { user_id: userId } });
  const section = staff
    ? await prisma.section.findFirst({ where: { id: student.current_section_id, class_teacher_id: staff.id } })
    : null;
  if (!section) throw forbidden("You are not the class teacher for this student");
}
