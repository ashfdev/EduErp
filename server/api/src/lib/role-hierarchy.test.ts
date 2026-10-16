import { describe, expect, it } from "vitest";
import { canAssignRole, assertCanAssignRole, assertCanManageUser } from "./role-hierarchy";

describe("canAssignRole", () => {
  it("lets SUPER_ADMIN grant any role", () => {
    expect(canAssignRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "IT_ADMIN")).toBe(true);
  });

  it("lets ADMIN grant everything except SUPER_ADMIN", () => {
    expect(canAssignRole("ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "IT_ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "ACCOUNTANT")).toBe(true);
  });

  it("stops IT_ADMIN and PRINCIPAL from granting admin-level roles", () => {
    for (const actor of ["IT_ADMIN", "PRINCIPAL"] as const) {
      expect(canAssignRole(actor, "SUPER_ADMIN")).toBe(false);
      expect(canAssignRole(actor, "ADMIN")).toBe(false);
      expect(canAssignRole(actor, "IT_ADMIN")).toBe(false);
      expect(canAssignRole(actor, "SUBJECT_TEACHER")).toBe(true);
    }
  });
});

describe("assert helpers", () => {
  it("throw a 403 for a role the actor can't grant or an account it can't manage", () => {
    expect(() => assertCanAssignRole("IT_ADMIN", "SUPER_ADMIN")).toThrow(/can't give/);
    expect(() => assertCanManageUser("IT_ADMIN", "ADMIN")).toThrow(/can't manage/);
    expect(() => assertCanManageUser("ADMIN", "ACCOUNTANT")).not.toThrow();
  });
});
