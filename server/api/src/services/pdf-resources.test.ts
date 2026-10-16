import { describe, expect, it } from "vitest";
import { isAllowedPdfResource } from "./pdf.service";

const origins = new Set(["https://erpapi.example.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]);

describe("isAllowedPdfResource", () => {
  it("allows inline data, the API's own uploads and Google Fonts", () => {
    expect(isAllowedPdfResource("data:image/png;base64,AAAA", origins)).toBe(true);
    expect(isAllowedPdfResource("about:blank", origins)).toBe(true);
    expect(isAllowedPdfResource("https://erpapi.example.com/api/uploads/local-file/direct?blobKey=branding/x.png", origins)).toBe(true);
    expect(isAllowedPdfResource("https://fonts.gstatic.com/s/notosansbengali/v1/a.woff2", origins)).toBe(true);
  });

  it("blocks local files, internal services and other sites", () => {
    expect(isAllowedPdfResource("file:///etc/passwd", origins)).toBe(false);
    expect(isAllowedPdfResource("http://redis:6379/", origins)).toBe(false);
    expect(isAllowedPdfResource("http://169.254.169.254/latest/meta-data/", origins)).toBe(false);
    expect(isAllowedPdfResource("https://attacker.example.net/x.png", origins)).toBe(false);
    expect(isAllowedPdfResource("http://erpapi.example.com/api/x", origins)).toBe(false);
  });
});
