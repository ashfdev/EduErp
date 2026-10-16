import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { authenticate } from "./authenticate";
import { signAccessToken } from "../lib/jwt";

function testApp() {
  const app = express();
  const ok = (_req: express.Request, res: express.Response) => res.json({ success: true });
  app.get("/api/auth/me", authenticate, ok);
  app.post("/api/auth/change-password", authenticate, ok);
  app.get("/api/students", authenticate, ok);
  return app;
}

const tempPasswordToken = signAccessToken({ sub: "user-1", role: "GUARDIAN", portal: "portal", pwc: true });
const normalToken = signAccessToken({ sub: "user-1", role: "GUARDIAN", portal: "portal" });

describe("authenticate with a temporary password", () => {
  it("blocks every other endpoint until the password is changed", async () => {
    const res = await request(testApp()).get("/api/students?page=1").set("Authorization", `Bearer ${tempPasswordToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("still allows the password change and the user's own profile", async () => {
    const app = testApp();
    const change = await request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${tempPasswordToken}`);
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tempPasswordToken}`);
    expect(change.status).toBe(200);
    expect(me.status).toBe(200);
  });

  it("lets a normal token through", async () => {
    const res = await request(testApp()).get("/api/students").set("Authorization", `Bearer ${normalToken}`);
    expect(res.status).toBe(200);
  });
});
