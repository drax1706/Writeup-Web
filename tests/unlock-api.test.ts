import { hashSync } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/writeups/[slug]/unlock/route";
import {
  consumeUnlockAttempt,
  createUnlockRateLimiter,
} from "@/lib/unlock-rate-limit.server";
import {
  getUnlockCookieName,
  verifyUnlockSession,
} from "@/lib/unlock-session.server";

const catalog = vi.hoisted(() => ({ findEntry: vi.fn() }));
vi.mock("@/lib/writeup-catalog.server", () => ({
  getWriteupEntryBySlug: catalog.findEntry,
}));
vi.mock("@/lib/unlock-rate-limit.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/unlock-rate-limit.server")>();
  return {
    ...actual,
    consumeUnlockAttempt: vi.fn(actual.createUnlockRateLimiter()),
  };
});

const origin = "https://vault.example";
const TEST_SLUG = "locked-alpha";
const SECOND_SLUG = "locked-beta";
const FLAG_HASH_ENV = "WRITEUP_ALPHA_FLAG_HASH";
const SECOND_HASH_ENV = "WRITEUP_BETA_FLAG_HASH";
const testFlag = "TEST{api-alpha-fixture}";
const testHash = hashSync(testFlag, 10);
const secondFlag = "TEST{api-beta-fixture}";
const secondHash = hashSync(secondFlag, 10);
let clientId = 0;

function entry(slug: string, flagHashEnv: string) {
  return {
    access: "locked" as const,
    metadata: {
      slug,
      title: `Write-up ${slug}`,
      platform: "Test Lab",
      difficulty: "Easy" as const,
      vulnerabilities: ["Access Control"],
      publishedAt: "2026-09-09",
      summary: "A write-up used only as a test fixture.",
    },
    contentPath: `/unused-test-fixtures/${slug}/writeup.md`,
    flagHashEnv,
  };
}

function request(body: unknown, extraHeaders?: HeadersInit, slug = TEST_SLUG) {
  return new Request(`${origin}/api/writeups/${slug}/unlock`, {
    method: "POST",
    headers: {
      origin,
      host: new URL(origin).host,
      "content-type": "application/json",
      "x-vercel-forwarded-for": `192.0.2.${clientId}`,
      ...extraHeaders,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function send(req: Request, slug = TEST_SLUG) {
  return POST(req, { params: Promise.resolve({ slug }) });
}

beforeEach(() => {
  vi.stubEnv(FLAG_HASH_ENV, testHash);
  vi.stubEnv(SECOND_HASH_ENV, secondHash);
  vi.stubEnv("SESSION_SECRET", "api-tests-only-secret-at-least-32-characters");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(consumeUnlockAttempt).mockImplementation(createUnlockRateLimiter());
  catalog.findEntry.mockReset().mockImplementation(async (slug: string) => {
    if (slug === TEST_SLUG) return entry(TEST_SLUG, FLAG_HASH_ENV);
    if (slug === SECOND_SLUG) return entry(SECOND_SLUG, SECOND_HASH_ENV);
    if (slug === "public-article")
      return { ...entry(slug, FLAG_HASH_ENV), access: "public" };
    // Drafts are excluded by the catalog just like unknown entries.
    return null;
  });
  clientId += 1;
});
afterEach(() => vi.unstubAllEnvs());

describe("unlock API", () => {
  it("issues a production cookie for a correct flag without returning article or flag", async () => {
    const response = await send(request({ flag: testFlag }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toContain("no-store");
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Max-Age=1800");
    expect(cookie).toContain("Path=/writeups");
    expect(cookie).not.toContain(testFlag);
    expect(cookie).not.toContain(FLAG_HASH_ENV);
    const token = response.cookies.get(getUnlockCookieName(TEST_SLUG))?.value;
    expect(verifyUnlockSession(token, TEST_SLUG)).toBe(true);
    expect(verifyUnlockSession(token, SECOND_SLUG)).toBe(false);
    expect(
      response.cookies.get(getUnlockCookieName(SECOND_SLUG)),
    ).toBeUndefined();
  });

  it("uses independent hashes and cookie names for multiple locked write-ups", async () => {
    const wrong = await send(
      request({ flag: testFlag }, {}, SECOND_SLUG),
      SECOND_SLUG,
    );
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    const correct = await send(
      request({ flag: secondFlag }, {}, SECOND_SLUG),
      SECOND_SLUG,
    );
    expect(correct.status).toBe(200);
    const token = correct.cookies.get(getUnlockCookieName(SECOND_SLUG))?.value;
    expect(verifyUnlockSession(token, SECOND_SLUG)).toBe(true);
    expect(verifyUnlockSession(token, TEST_SLUG)).toBe(false);
    expect(correct.cookies.get(getUnlockCookieName(TEST_SLUG))).toBeUndefined();
  });

  it("does not issue a cookie for the wrong flag", async () => {
    const response = await send(request({ flag: "wrong" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    const redirectedConfig = await send(
      request({ flag: secondFlag, flagHashEnv: SECOND_HASH_ENV }),
    );
    expect(redirectedConfig.status).toBe(400);
    expect(redirectedConfig.headers.get("set-cookie")).toBeNull();
  });

  it.each(["unknown", "draft-article", "public-article"])(
    "does not unlock unpublished or non-locked entries: %s",
    async (slug) => {
      const response = await send(request({ flag: testFlag }, {}, slug), slug);
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it.each(["../../secrets", "with/slash", "bad;cookie", "a".repeat(101)])(
    "rejects unsafe slugs before catalog lookup: %s",
    async (slug) => {
      const response = await send(request({ flag: testFlag }, {}, slug), slug);
      expect(response.status).toBe(404);
      expect(catalog.findEntry).not.toHaveBeenCalled();
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("rejects cross-origin, missing-origin, invalid media types and unknown slugs", async () => {
    expect(
      (
        await send(
          request({ flag: testFlag }, { origin: "https://other.example" }),
        )
      ).status,
    ).toBe(403);
    const noOrigin = request({ flag: testFlag });
    noOrigin.headers.delete("origin");
    expect((await send(noOrigin)).status).toBe(403);
    expect(
      (
        await send(
          request({ flag: testFlag }, { "content-type": "text/plain" }),
        )
      ).status,
    ).toBe(415);
    expect(
      (await send(request({ flag: testFlag }, {}, "unknown"), "unknown"))
        .status,
    ).toBe(404);
  });

  it("compares the browser Host when Next uses an internal request hostname", async () => {
    vi.stubEnv("VERCEL", "");
    const req = new Request(
      `http://localhost:3000/api/writeups/${TEST_SLUG}/unlock`,
      {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ flag: testFlag }),
      },
    );
    expect((await send(req)).status).toBe(200);
  });

  it("uses forwarded protocol only behind Vercel's trusted edge", async () => {
    const makeRequest = () =>
      new Request(`http://internal:3000/api/writeups/${TEST_SLUG}/unlock`, {
        method: "POST",
        headers: {
          host: "vault.example",
          origin,
          "content-type": "application/json",
          "x-forwarded-proto": "https",
          "x-vercel-forwarded-for": `192.0.2.${clientId}`,
        },
        body: JSON.stringify({ flag: testFlag }),
      });
    expect((await send(makeRequest())).status).toBe(200);
    vi.stubEnv("VERCEL", "");
    expect((await send(makeRequest())).status).toBe(403);
  });

  it("rejects missing or malformed authority and protocol headers", async () => {
    const noHost = request({ flag: testFlag });
    noHost.headers.delete("host");
    expect((await send(noHost)).status).toBe(403);
    for (const host of [
      "vault.example@evil.example",
      "vault.example/path",
      "vault.example#ignored",
      "vault.example:invalid",
      "vault.example,evil.example",
    ]) {
      expect((await send(request({ flag: testFlag }, { host }))).status).toBe(
        403,
      );
    }
    expect(
      (
        await send(
          request({ flag: testFlag }, { "x-forwarded-proto": "https,http" }),
        )
      ).status,
    ).toBe(403);
  });

  it("isolates missing per-write-up configuration and requires the shared signing secret", async () => {
    vi.stubEnv(FLAG_HASH_ENV, "");
    let response = await send(request({ flag: testFlag }));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(
      (await send(request({ flag: secondFlag }, {}, SECOND_SLUG), SECOND_SLUG))
        .status,
    ).toBe(200);
    vi.stubEnv("SESSION_SECRET", "");
    response = await send(
      request({ flag: secondFlag }, {}, SECOND_SLUG),
      SECOND_SLUG,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed on a public environment reference", async () => {
    vi.stubEnv("NEXT_PUBLIC_FLAG_HASH", testHash);
    catalog.findEntry.mockResolvedValue(
      entry(TEST_SLUG, "NEXT_PUBLIC_FLAG_HASH"),
    );
    const response = await send(request({ flag: testFlag }));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    "{",
    "null",
    "[]",
    '{"flag":123}',
    '{"flag":"ok","extra":true}',
    JSON.stringify({ flag: "😀".repeat(19) }),
    "x".repeat(513),
  ])("rejects malformed/bounded input %# without a cookie", async (body) => {
    const response = await send(request(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("enforces size independently of a dishonest content-length header", async () => {
    const response = await send(
      request("x".repeat(513), { "content-length": "1" }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(
      (
        await send(
          request({ flag: testFlag }, { "content-length": "10000000" }),
        )
      ).status,
    ).toBe(400);
  });

  it("returns a retry window after five attempts, including bad JSON", async () => {
    for (let index = 0; index < 5; index++) {
      expect((await send(request("{"))).status).toBe(400);
    }
    const response = await send(request({ flag: testFlag }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
