import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import request from "supertest";
import { createApp } from "../app";
import { localFilePath } from "../services/storage.service";

const publicKey = "branding/00000000-test-direct-access.png";
const privateKey = "student-documents/00000000-test-direct-access.pdf";

beforeAll(async () => {
  for (const key of [publicKey, privateKey]) {
    await mkdir(dirname(localFilePath(key)), { recursive: true });
    await writeFile(localFilePath(key), "test");
  }
});

afterAll(async () => {
  for (const key of [publicKey, privateKey]) await rm(localFilePath(key), { force: true });
});

describe("GET /api/uploads/local-file/direct", () => {
  it("serves public categories such as branding", async () => {
    const res = await request(createApp()).get("/api/uploads/local-file/direct").query({ blobKey: publicKey });
    expect(res.status).toBe(200);
  });

  it("refuses private documents, which need a signed link", async () => {
    const res = await request(createApp()).get("/api/uploads/local-file/direct").query({ blobKey: privateKey });
    expect(res.status).toBe(404);
  });
});
