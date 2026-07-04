import { describe, expect, it } from "vitest";
import { createStudentSchema, updateStudentSchema } from "./students";
import { deviceSchema, enrollUserSchema } from "./devices";
import { notificationConfigUpdateSchema } from "./settings";
import { loginSchema, forgotPasswordSchema } from "./auth";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "./portal";

const VALID_STUDENT = {
  name_en: "Md. Rakib Hasan",
  gender: "MALE" as const,
  father_phone: "01712345678",
  current_class_id: "class-9",
  academic_year_id: "year-2026",
};

describe("createStudentSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(createStudentSchema.safeParse(VALID_STUDENT).success).toBe(true);
  });

  it("rejects a father_phone that isn't 11 digits starting with 01", () => {
    const result = createStudentSchema.safeParse({ ...VALID_STUDENT, father_phone: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing current_class_id", () => {
    const { current_class_id: _omit, ...rest } = VALID_STUDENT;
    const result = createStudentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid gender enum value", () => {
    const result = createStudentSchema.safeParse({ ...VALID_STUDENT, gender: "UNKNOWN" });
    expect(result.success).toBe(false);
  });
});

describe("updateStudentSchema", () => {
  it("allows a partial update with no academic_year_id (immutable on update)", () => {
    expect(updateStudentSchema.safeParse({ name_en: "New Name" }).success).toBe(true);
  });

  it("still enforces the phone format on partial update", () => {
    const result = updateStudentSchema.safeParse({ father_phone: "not-a-phone" });
    expect(result.success).toBe(false);
  });
});

describe("deviceSchema", () => {
  it("accepts a minimal valid device", () => {
    expect(deviceSchema.safeParse({ name: "Main Gate", type: "FINGERPRINT" }).success).toBe(true);
  });

  it("rejects an unknown device type", () => {
    expect(deviceSchema.safeParse({ name: "Main Gate", type: "IRIS_SCANNER" }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(deviceSchema.safeParse({ type: "RFID" }).success).toBe(false);
  });
});

describe("enrollUserSchema", () => {
  it("accepts STUDENT and STAFF person types", () => {
    expect(enrollUserSchema.safeParse({ person_id: "s1", person_type: "STUDENT" }).success).toBe(true);
    expect(enrollUserSchema.safeParse({ person_id: "s1", person_type: "STAFF" }).success).toBe(true);
  });

  it("rejects an unknown person_type", () => {
    expect(enrollUserSchema.safeParse({ person_id: "s1", person_type: "GUARDIAN" }).success).toBe(false);
  });
});

describe("notificationConfigUpdateSchema", () => {
  it("requires both BN and EN templates to be non-empty", () => {
    expect(notificationConfigUpdateSchema.safeParse({ is_enabled: true, template_bn: "", template_en: "hi" }).success).toBe(false);
    expect(notificationConfigUpdateSchema.safeParse({ is_enabled: true, template_bn: "হ্যালো", template_en: "hi" }).success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("requires both identifier and portal", () => {
    expect(loginSchema.safeParse({ identifier: "01700000000", password: "x", portal: "admin" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "01700000000", password: "x" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("validates the BD phone format", () => {
    expect(forgotPasswordSchema.safeParse({ phone: "01700000000" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ phone: "0000" }).success).toBe(false);
  });
});

describe("push subscribe/unsubscribe schemas", () => {
  it("requires both p256dh and auth keys to subscribe", () => {
    expect(pushSubscribeSchema.safeParse({ endpoint: "https://example.com/push", keys: { p256dh: "a", auth: "b" } }).success).toBe(true);
    expect(pushSubscribeSchema.safeParse({ endpoint: "https://example.com/push", keys: { p256dh: "a" } }).success).toBe(false);
  });

  it("only needs an endpoint to unsubscribe", () => {
    expect(pushUnsubscribeSchema.safeParse({ endpoint: "https://example.com/push" }).success).toBe(true);
    expect(pushUnsubscribeSchema.safeParse({}).success).toBe(false);
  });
});
