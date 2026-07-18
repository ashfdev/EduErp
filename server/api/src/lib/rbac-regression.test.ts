import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { signAccessToken } from "./jwt";
import { prisma } from "./prisma";
import * as roles from "./roles";
import { refreshPermissions } from "./permissions";

// Phase 84 migration-correctness gate: this file's entire suite (not just
// the table-driven block below) is run twice — once against roles.ts's
// hardcoded array defaults (comment this call out / it's a no-op before
// the Permission table is seeded), and once after calling
// refreshPermissions() here, which overwrites every constant's contents
// from the DB. The seed is an exact mirror of the hardcoded arrays, so an
// identical pass/fail result both times is the actual proof the migration
// didn't change any real authorization behavior.
beforeAll(async () => {
  await refreshPermissions();
});

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

// Table-driven smoke test for the editable Role & Permission matrix (Phase
// 84) — for every one of roles.ts's 38 permission-key constants, hit one
// representative route with a token for a role the LIVE array currently
// allows (expect non-403) and one it currently disallows (expect exactly
// 403). Deliberately reads the arrays via the `roles` namespace import
// (not destructured constants) so the same test, run unmodified, reflects
// whatever the array's CURRENT contents are — hardcoded defaults before the
// Phase 84 migration, DB-loaded values after. Run before AND after the
// seed/loader swap and diff the two result sets for exact parity; that
// parity check (not this file) is the actual migration-correctness gate.
//
// "Non-403" rather than "200" for the allowed case: authorize() runs before
// any body/param validation, so a 400/404 from the handler afterward is a
// perfectly valid "the permission check passed" signal — asserting a real
// 200 would require realistic fixtures for all 38 routes, which is what
// this smoke test is deliberately avoiding.
const ALL_USER_ROLES = [
  "SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT",
  "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN", "STUDENT", "GUARDIAN",
] as const;

const PERMISSION_ROUTE_TABLE: {
  key: keyof typeof roles;
  method: "get" | "post" | "put" | "delete";
  path: string;
  // Some routes layer a self-service ownership resolution (e.g.
  // resolveOwnStaffId) on top of the base authorize() gate — a role can be
  // correctly listed in the permission array and still 403 with a synthetic
  // token that has no real Staff row behind it. Force a specific "allowed"
  // role for those and let the test build a real Staff fixture instead of
  // treating that 403 as a false permission-check failure.
  forceAllowedRole?: string;
  needsStaffFixture?: boolean;
}[] = [
  { key: "SETTINGS_INSTITUTION_ROLES", method: "put", path: "/api/settings/institution" },
  { key: "SETTINGS_ACADEMIC_ROLES", method: "post", path: "/api/settings/academic-years" },
  { key: "SETTINGS_USERS_ROLES", method: "get", path: "/api/settings/users" },
  { key: "DEVICE_MANAGE_ROLES", method: "get", path: "/api/devices" },
  { key: "STUDENT_CRUD_ROLES", method: "post", path: "/api/students" },
  { key: "STUDENT_PROMOTE_ROLES", method: "get", path: "/api/students/promotion-roster?class_id=x" },
  { key: "ATTENDANCE_MARK_ROLES", method: "post", path: "/api/attendance/mark" },
  { key: "EXAM_MANAGE_ROLES", method: "post", path: "/api/exams" },
  { key: "MARK_ENTRY_ROLES", method: "post", path: "/api/marks/submit" },
  { key: "MARK_VIEW_ROLES", method: "get", path: "/api/marks/x/x/x" },
  { key: "MARK_APPROVAL_ROLES", method: "post", path: "/api/marks/approve/x/x" },
  { key: "RESULT_PUBLISH_ROLES", method: "get", path: "/api/marks/publish-status/x" },
  { key: "QUIZ_MANAGE_ROLES", method: "get", path: "/api/quizzes/questions" },
  { key: "FEE_COLLECTION_ROLES", method: "post", path: "/api/fees/structures" },
  { key: "ADMISSION_MANAGE_ROLES", method: "post", path: "/api/admission/cycles" },
  { key: "ADMISSION_ENROLL_ROLES", method: "post", path: "/api/admission/applications/x/enroll" },
  { key: "WEBSITE_CONTENT_ROLES", method: "post", path: "/api/website/notices" },
  { key: "HR_MANAGE_ROLES", method: "post", path: "/api/hr/jobs" },
  { key: "LEAVE_APPROVE_ROLES", method: "put", path: "/api/hr/leaves/x/approve" },
  { key: "PAYROLL_MANAGE_ROLES", method: "post", path: "/api/hr/payroll/calculate" },
  { key: "LIBRARY_MANAGE_ROLES", method: "post", path: "/api/library/books" },
  { key: "TRANSPORT_MANAGE_ROLES", method: "get", path: "/api/transport/vehicles" },
  { key: "HOSTEL_MANAGE_ROLES", method: "post", path: "/api/hostel/blocks" },
  { key: "ANALYTICS_MESSAGE_ROLES", method: "get", path: "/api/analytics/defaulters-risk" },
  { key: "PORTAL_ROLES", method: "get", path: "/api/portal/me" },
  { key: "STAFF_ONLY_ROLES", method: "get", path: "/api/documents/student/x/id-card" },
  { key: "TEACHER_APP_ROLES", method: "get", path: "/api/teacher/schedule/today" },
  { key: "ACCOUNTS_MANAGE_ROLES", method: "post", path: "/api/accounts/chart/bulk-import" },
  { key: "VOUCHER_APPROVE_ROLES", method: "post", path: "/api/accounts/vouchers/x/approve" },
  { key: "VOUCHER_POST_ROLES", method: "post", path: "/api/accounts/vouchers/x/post" },
  { key: "INVENTORY_MANAGE_ROLES", method: "post", path: "/api/inventory/asset-categories" },
  { key: "REQUISITION_APPROVE_ROLES", method: "put", path: "/api/inventory/requisitions/x/approve" },
  { key: "HEALTH_MANAGE_ROLES", method: "get", path: "/api/student-health/student/x" },
  { key: "DISCIPLINE_MANAGE_ROLES", method: "get", path: "/api/discipline/student/x" },
  { key: "COMPLAINT_MANAGE_ROLES", method: "put", path: "/api/complaints/x" },
  { key: "PTM_MANAGE_ROLES", method: "get", path: "/api/ptm/slots", forceAllowedRole: "CLASS_TEACHER", needsStaffFixture: true },
  { key: "APPRAISAL_MANAGE_ROLES", method: "post", path: "/api/appraisals/templates" },
  { key: "BULK_SMS_ROLES", method: "post", path: "/api/notifications/bulk-sms/preview" },
];

describe("Phase 84 — permission matrix table-driven smoke test", () => {
  for (const entry of PERMISSION_ROUTE_TABLE) {
    const currentRoles = roles[entry.key] as readonly string[];
    const allowedRole = entry.forceAllowedRole ?? (currentRoles.includes("ADMIN") ? "ADMIN" : currentRoles[currentRoles.length - 1]!);
    const disallowedRole = ALL_USER_ROLES.find((r) => !currentRoles.includes(r));

    it(`${entry.key}: ${allowedRole} gets non-403 on ${entry.method.toUpperCase()} ${entry.path}`, async () => {
      let sub: string = randomUUID();
      let cleanup: (() => Promise<unknown>) | undefined;
      if (entry.needsStaffFixture) {
        const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
        const user = await prisma.user.create({ data: { name_en: "Smoke Test Staff", role: allowedRole as never, phone: `0199${suffix}`, password_hash: "x" } });
        const staff = await prisma.staff.create({ data: { user_id: user.id, staff_uid: `SMOKE-${suffix}`, name_en: "Smoke Test Staff", designation: allowedRole } });
        sub = user.id;
        cleanup = async () => {
          await prisma.staff.delete({ where: { id: staff.id } });
          await prisma.user.delete({ where: { id: user.id } });
        };
      }
      try {
        const token = signAccessToken({ sub, role: allowedRole, portal: "admin" });
        const res = await (request(app)[entry.method](entry.path) as request.Test).set("Authorization", `Bearer ${token}`).send({});
        expect(res.status).not.toBe(403);
      } finally {
        if (cleanup) await cleanup();
      }
    });

    if (disallowedRole) {
      it(`${entry.key}: ${disallowedRole} gets exactly 403 on ${entry.method.toUpperCase()} ${entry.path}`, async () => {
        const token = signAccessToken({ sub: randomUUID(), role: disallowedRole, portal: "admin" });
        const res = await (request(app)[entry.method](entry.path) as request.Test).set("Authorization", `Bearer ${token}`).send({});
        expect(res.status).toBe(403);
      });
    }
  }
});
