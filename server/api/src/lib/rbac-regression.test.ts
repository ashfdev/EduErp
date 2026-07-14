import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { signAccessToken } from "./jwt";
import { prisma } from "./prisma";

// Regression coverage for the access-control gaps fixed in the "full-repo
// audit" pass (commit 70ce780) — health, discipline, and transport are
// staff-only and must never be reachable by a STUDENT/GUARDIAN portal
// token, and quiz authoring must stay scoped to the assigned subject
// teacher. These are deliberately black-box HTTP tests (via supertest)
// rather than unit tests, since the bug class they guard against is
// "wrong role slipped past middleware," which only shows up at the HTTP
// boundary.

const app = createApp();

function tokenFor(sub: string, role: string): string {
  return signAccessToken({ sub, role, portal: "admin" });
}

describe("staff-only modules reject STUDENT/GUARDIAN portal tokens", () => {
  // No DB fixtures needed here — authorize() rejects on req.user.role alone,
  // before any handler (and therefore any DB lookup) runs.
  const studentToken = tokenFor(randomUUID(), "STUDENT");
  const guardianToken = tokenFor(randomUUID(), "GUARDIAN");

  it("GET /api/student-health/student/:id — 403 for STUDENT", async () => {
    const res = await request(app).get(`/api/student-health/student/${randomUUID()}`).set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/discipline/student/:id — 403 for GUARDIAN", async () => {
    const res = await request(app).get(`/api/discipline/student/${randomUUID()}`).set("Authorization", `Bearer ${guardianToken}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/transport/vehicles — 403 for STUDENT", async () => {
    const res = await request(app).get("/api/transport/vehicles").set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it("POST /api/quizzes/questions — 403 for GUARDIAN", async () => {
    const res = await request(app)
      .post("/api/quizzes/questions")
      .set("Authorization", `Bearer ${guardianToken}`)
      .send({ subject_id: randomUUID(), question_text: "x", options: [], correct_option: "a", marks: 1 });
    expect(res.status).toBe(403);
  });
});

describe("class-teacher ownership — health/discipline records", () => {
  const cleanup: Array<() => Promise<unknown>> = [];
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()!();
  });

  async function buildStudentWithClassTeacher(suffix: string) {
    const year = await prisma.academicYear.create({ data: { label: `RBAC Test ${suffix}`, start_date: new Date("2026-01-01"), end_date: new Date("2026-12-31") } });
    cleanup.push(() => prisma.academicYear.delete({ where: { id: year.id } }));
    const klass = await prisma.class.create({ data: { academic_year_id: year.id, name_en: `RBAC Class ${suffix}`, numeric_level: 9 } });
    cleanup.push(() => prisma.class.delete({ where: { id: klass.id } }));

    const correctTeacherUser = await prisma.user.create({ data: { name_en: "Correct Teacher", role: "CLASS_TEACHER", phone: `0181${suffix}`, password_hash: "x" } });
    cleanup.push(() => prisma.user.delete({ where: { id: correctTeacherUser.id } }));
    const correctTeacher = await prisma.staff.create({ data: { user_id: correctTeacherUser.id, staff_uid: `RBAC-CT-${suffix}`, name_en: "Correct Teacher", designation: "Class Teacher" } });
    cleanup.push(() => prisma.staff.delete({ where: { id: correctTeacher.id } }));

    const wrongTeacherUser = await prisma.user.create({ data: { name_en: "Wrong Teacher", role: "CLASS_TEACHER", phone: `0182${suffix}`, password_hash: "x" } });
    cleanup.push(() => prisma.user.delete({ where: { id: wrongTeacherUser.id } }));
    const wrongTeacher = await prisma.staff.create({ data: { user_id: wrongTeacherUser.id, staff_uid: `RBAC-WT-${suffix}`, name_en: "Wrong Teacher", designation: "Class Teacher" } });
    cleanup.push(() => prisma.staff.delete({ where: { id: wrongTeacher.id } }));

    const section = await prisma.section.create({ data: { class_id: klass.id, name: "A", class_teacher_id: correctTeacher.id } });
    cleanup.push(() => prisma.section.delete({ where: { id: section.id } }));

    const guardian = await prisma.guardian.create({ data: { name_en: `RBAC Guardian ${suffix}`, relation: "FATHER", phone: `0183${suffix}` } });
    cleanup.push(() => prisma.guardian.delete({ where: { id: guardian.id } }));
    const student = await prisma.student.create({
      data: {
        student_uid: `RBAC-STU-${suffix}`,
        name_en: `RBAC Student ${suffix}`,
        gender: "MALE",
        current_class_id: klass.id,
        current_section_id: section.id,
        guardian_id: guardian.id,
        admission_date: new Date("2026-01-01"),
      },
    });
    cleanup.push(() => prisma.student.delete({ where: { id: student.id } }));

    return { studentId: student.id, correctTeacherUserId: correctTeacherUser.id, wrongTeacherUserId: wrongTeacherUser.id };
  }

  it("health: the student's actual class teacher can view the record", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const fixture = await buildStudentWithClassTeacher(suffix);
    const res = await request(app)
      .get(`/api/student-health/student/${fixture.studentId}`)
      .set("Authorization", `Bearer ${tokenFor(fixture.correctTeacherUserId, "CLASS_TEACHER")}`);
    expect(res.status).toBe(200);
  });

  it("health: a class teacher of a DIFFERENT section is forbidden, not silently scoped", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const fixture = await buildStudentWithClassTeacher(suffix);
    const res = await request(app)
      .get(`/api/student-health/student/${fixture.studentId}`)
      .set("Authorization", `Bearer ${tokenFor(fixture.wrongTeacherUserId, "CLASS_TEACHER")}`);
    expect(res.status).toBe(403);
  });

  it("discipline: mirrors the same wrong-section rejection", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const fixture = await buildStudentWithClassTeacher(suffix);
    const res = await request(app)
      .get(`/api/discipline/student/${fixture.studentId}`)
      .set("Authorization", `Bearer ${tokenFor(fixture.wrongTeacherUserId, "CLASS_TEACHER")}`);
    expect(res.status).toBe(403);
  });

  it("health: ADMIN bypasses the ownership check for any student", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const fixture = await buildStudentWithClassTeacher(suffix);
    const res = await request(app)
      .get(`/api/student-health/student/${fixture.studentId}`)
      .set("Authorization", `Bearer ${tokenFor(randomUUID(), "ADMIN")}`);
    expect(res.status).toBe(200);
  });
});

describe("quiz authoring — subject-teacher ownership", () => {
  const cleanup: Array<() => Promise<unknown>> = [];
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()!();
  });

  it("a SUBJECT_TEACHER with no SubjectTeacherAssignment for the subject is forbidden", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const year = await prisma.academicYear.create({ data: { label: `Quiz RBAC ${suffix}`, start_date: new Date("2026-01-01"), end_date: new Date("2026-12-31") } });
    cleanup.push(() => prisma.academicYear.delete({ where: { id: year.id } }));
    const klass = await prisma.class.create({ data: { academic_year_id: year.id, name_en: `Quiz RBAC Class ${suffix}`, numeric_level: 9 } });
    cleanup.push(() => prisma.class.delete({ where: { id: klass.id } }));
    const subject = await prisma.subject.create({ data: { class_id: klass.id, name_en: "Unassigned Subject", code: `QRBAC-${suffix}` } });
    cleanup.push(() => prisma.subject.delete({ where: { id: subject.id } }));

    const teacherUser = await prisma.user.create({ data: { name_en: "Unassigned Teacher", role: "SUBJECT_TEACHER", phone: `0184${suffix}`, password_hash: "x" } });
    cleanup.push(() => prisma.user.delete({ where: { id: teacherUser.id } }));
    const teacher = await prisma.staff.create({ data: { user_id: teacherUser.id, staff_uid: `QRBAC-T-${suffix}`, name_en: "Unassigned Teacher", designation: "Subject Teacher" } });
    cleanup.push(() => prisma.staff.delete({ where: { id: teacher.id } }));
    // Deliberately NOT creating a SubjectTeacherAssignment — this teacher
    // has no claim on this subject.

    const res = await request(app)
      .post("/api/quizzes/questions")
      .set("Authorization", `Bearer ${tokenFor(teacherUser.id, "SUBJECT_TEACHER")}`)
      .send({ subject_id: subject.id, question_text: "2+2?", options: [{ key: "a", text: "4" }, { key: "b", text: "5" }], correct_option: "a", marks: 1 });

    expect(res.status).toBe(403);
  });

  it("a SUBJECT_TEACHER who IS assigned to the subject may author a question", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 6);
    const year = await prisma.academicYear.create({ data: { label: `Quiz RBAC OK ${suffix}`, start_date: new Date("2026-01-01"), end_date: new Date("2026-12-31") } });
    cleanup.push(() => prisma.academicYear.delete({ where: { id: year.id } }));
    const klass = await prisma.class.create({ data: { academic_year_id: year.id, name_en: `Quiz RBAC OK Class ${suffix}`, numeric_level: 9 } });
    cleanup.push(() => prisma.class.delete({ where: { id: klass.id } }));
    const subject = await prisma.subject.create({ data: { class_id: klass.id, name_en: "Assigned Subject", code: `QRBACOK-${suffix}` } });
    cleanup.push(() => prisma.subject.delete({ where: { id: subject.id } }));

    const teacherUser = await prisma.user.create({ data: { name_en: "Assigned Teacher", role: "SUBJECT_TEACHER", phone: `0185${suffix}`, password_hash: "x" } });
    cleanup.push(() => prisma.user.delete({ where: { id: teacherUser.id } }));
    const teacher = await prisma.staff.create({ data: { user_id: teacherUser.id, staff_uid: `QRBACOK-T-${suffix}`, name_en: "Assigned Teacher", designation: "Subject Teacher" } });
    cleanup.push(() => prisma.staff.delete({ where: { id: teacher.id } }));
    const assignment = await prisma.subjectTeacherAssignment.create({ data: { subject_id: subject.id, staff_id: teacher.id, academic_year_id: year.id } });
    cleanup.push(() => prisma.subjectTeacherAssignment.delete({ where: { id: assignment.id } }));

    const res = await request(app)
      .post("/api/quizzes/questions")
      .set("Authorization", `Bearer ${tokenFor(teacherUser.id, "SUBJECT_TEACHER")}`)
      .send({ subject_id: subject.id, question_text: "2+2?", options: [{ key: "a", text: "4" }, { key: "b", text: "5" }], correct_option: "a", marks: 1 });

    expect(res.status).toBe(201);
    if (res.status === 201) cleanup.push(() => prisma.question.delete({ where: { id: res.body.data.id } }));
  });
});
