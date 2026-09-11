import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUnlockSession,
  getUnlockCookieName,
  getUnlockCookieOptions,
  UNLOCK_SESSION_TTL_SECONDS,
  verifyUnlockSession,
} from "@/lib/unlock-session.server";
const TEST_SLUG = "locked-alpha";

const now = Date.parse("2026-09-08T00:00:00Z");

beforeEach(() =>
  vi.stubEnv(
    "SESSION_SECRET",
    "test-only-session-secret-at-least-32-characters",
  ),
);
afterEach(() => vi.unstubAllEnvs());

describe("signed unlock sessions", () => {
  it("accepts its slug until the exact expiration boundary", () => {
    const token = createUnlockSession(TEST_SLUG, now);
    expect(verifyUnlockSession(token, TEST_SLUG, now)).toBe(true);
    expect(
      verifyUnlockSession(
        token,
        TEST_SLUG,
        now + UNLOCK_SESSION_TTL_SECONDS * 1000 - 1,
      ),
    ).toBe(true);
    expect(
      verifyUnlockSession(
        token,
        TEST_SLUG,
        now + UNLOCK_SESSION_TTL_SECONDS * 1000,
      ),
    ).toBe(false);
    expect(verifyUnlockSession(token, "different-writeup", now)).toBe(false);
    expect(verifyUnlockSession(token, TEST_SLUG, now - 1000)).toBe(false);
  });

  it("rejects tampered payloads, signatures, invalid encodings and missing cookies", () => {
    const token = createUnlockSession(TEST_SLUG, now);
    const [payload, signature] = token.split(".");
    const altered = Buffer.from(
      JSON.stringify({ sub: TEST_SLUG, exp: 9999999999 }),
    ).toString("base64url");
    for (const invalid of [
      undefined,
      "",
      "x",
      `${altered}.${signature}`,
      `${payload}.${"a".repeat(43)}`,
      `${token}.extra`,
      `${token}=`,
      "a".repeat(1025),
    ]) {
      expect(verifyUnlockSession(invalid, TEST_SLUG, now)).toBe(false);
    }
  });

  it("fails closed on missing/short secret and revokes old tokens on rotation", () => {
    const token = createUnlockSession(TEST_SLUG, now);
    vi.stubEnv(
      "SESSION_SECRET",
      "another-test-secret-with-at-least-32-characters",
    );
    expect(verifyUnlockSession(token, TEST_SLUG, now)).toBe(false);
    for (const invalidSecret of ["", "short"]) {
      vi.stubEnv("SESSION_SECRET", invalidSecret);
      expect(verifyUnlockSession(token, TEST_SLUG, now)).toBe(false);
      expect(() => createUnlockSession(TEST_SLUG, now)).toThrow();
    }
  });

  it("creates unique sessions and rejects invalid cookie slugs", () => {
    expect(createUnlockSession(TEST_SLUG, now)).not.toBe(
      createUnlockSession(TEST_SLUG, now),
    );
    expect(() => createUnlockSession("../secrets", now)).toThrow();
    expect(() => getUnlockCookieName("a; Secure")).toThrow();
  });

  it("uses a short lived, httpOnly same-site cookie with secure production prefix", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getUnlockCookieName(TEST_SLUG)).toBe(
      "__Secure-vault_unlock_locked-alpha",
    );
    expect(getUnlockCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/writeups",
      maxAge: 1800,
    });
    vi.stubEnv("NODE_ENV", "development");
    expect(getUnlockCookieName(TEST_SLUG)).toBe("vault_unlock_locked-alpha");
    expect(getUnlockCookieOptions().secure).toBe(false);
  });
});
