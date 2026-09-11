import { describe, expect, it } from "vitest";

import { encodeBase64Url } from "@/lib/encoding";
import { analyzeJwt } from "@/lib/jwt";

function tokenFor(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
) {
  return `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(
    JSON.stringify(payload),
  )}.test-signature`;
}

describe("analyzeJwt", () => {
  it("decodes Unicode header and payload claims", () => {
    const result = analyzeJwt(
      tokenFor({ sub: "người-dùng", role: "pentester" }),
      2_000,
    );

    expect(result.header).toMatchObject({ alg: "HS256", typ: "JWT" });
    expect(result.payload).toMatchObject({
      sub: "người-dùng",
      role: "pentester",
    });
    expect(result.algorithm).toBe("HS256");
    expect(result.warnings[0]).toContain("chưa được xác minh chữ ký");
  });

  it("marks a token as expired when now reaches exp", () => {
    const result = analyzeJwt(tokenFor({ exp: 2_000 }), 2_000);

    expect(result.expired).toBe(true);
    expect(result.warnings).toContain("Token đã hết hạn theo claim exp.");
  });

  it("marks a token as not active before nbf", () => {
    const result = analyzeJwt(tokenFor({ nbf: 2_001 }), 2_000);

    expect(result.notYetValid).toBe(true);
    expect(result.warnings).toContain(
      "Token chưa có hiệu lực theo claim nbf.",
    );
  });

  it("reports malformed NumericDate claims without crashing", () => {
    const result = analyzeJwt(tokenFor({ exp: "tomorrow" }), 2_000);

    expect(result.expiresAt).toBeNull();
    expect(result.warnings).toContain(
      "Claim exp không phải NumericDate hợp lệ.",
    );
  });

  it("accepts an unsigned token while warning that it cannot authenticate", () => {
    const token = `${encodeBase64Url('{"alg":"none"}')}.${encodeBase64Url("{}")}.`;
    const result = analyzeJwt(token);

    expect(result.signature).toBe("");
    expect(result.warnings).toContain(
      "Token khai báo alg=none; không được dùng để xác thực.",
    );
    expect(result.warnings).toContain("JWT không có dữ liệu chữ ký.");
  });

  it.each([
    `${encodeBase64Url("{}")}=.${encodeBase64Url("{}")}.`,
    `${encodeBase64Url("{}")} =.${encodeBase64Url("{}")}.`,
    `${encodeBase64Url("{}")}\n.${encodeBase64Url("{}")}.`,
    `${encodeBase64Url("{}")}.${encodeBase64Url("{}")}=.`,
    `${encodeBase64Url("{}")}.${encodeBase64Url("{}")} =.`,
    `${encodeBase64Url("{}")}.${encodeBase64Url("{}")}\t.`,
    `${encodeBase64Url("{}")}.${encodeBase64Url("{}")}.a`,
  ])("rejects non-compact Base64URL JWT segments", (token) => {
    expect(() => analyzeJwt(token)).toThrow("Base64URL");
  });

  it.each([
    "not-a-jwt",
    "abc.def",
    `${encodeBase64Url("{}")}.${encodeBase64Url("{}")}.*invalid*`,
    `${encodeBase64Url("[]")}.${encodeBase64Url("{}")}.`,
    `${encodeBase64Url("not json")}.${encodeBase64Url("{}")}.abc`,
  ])("rejects malformed tokens", (token) => {
    expect(() => analyzeJwt(token)).toThrow();
  });
});
