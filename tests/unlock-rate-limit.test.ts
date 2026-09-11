import { afterEach, describe, expect, it, vi } from "vitest";

import { createUnlockRateLimiter, getUnlockRateLimitIdentity } from "@/lib/unlock-rate-limit.server";

afterEach(() => vi.unstubAllEnvs());

describe("unlock rate limiter", () => {
  it("limits a client to five attempts per fifteen-minute window", () => {
    const consume = createUnlockRateLimiter();
    for (let index = 0; index < 5; index++) expect(consume("one", 0).allowed).toBe(true);
    expect(consume("one", 0)).toEqual({ allowed: false, retryAfter: 900 });
    expect(consume("one", 899_000)).toEqual({ allowed: false, retryAfter: 1 });
    expect(consume("two", 899_000).allowed).toBe(true);
    expect(consume("one", 900_000).allowed).toBe(true);
  });

  it("caps aggregate work even when requests claim distinct identities", () => {
    const consume = createUnlockRateLimiter();
    for (let index = 0; index < 30; index++) expect(consume(`client-${index}`, 0).allowed).toBe(true);
    expect(consume("new-client", 0)).toEqual({ allowed: false, retryAfter: 60 });
    expect(consume("new-client", 60_000).allowed).toBe(true);
  });

  it("ignores spoofable forwarding headers outside the trusted Vercel edge", () => {
    vi.stubEnv("VERCEL", "");
    const baseline = getUnlockRateLimitIdentity(new Headers());
    expect(getUnlockRateLimitIdentity(new Headers({ "x-forwarded-for": "192.0.2.1", "x-vercel-forwarded-for": "192.0.2.1" }))).toBe(baseline);
    vi.stubEnv("VERCEL", "1");
    const identity = getUnlockRateLimitIdentity(new Headers({ "x-vercel-forwarded-for": "192.0.2.1" }));
    expect(identity).not.toBe(baseline);
    expect(identity).not.toContain("192.0.2.1");
    expect(getUnlockRateLimitIdentity(new Headers({ "x-vercel-forwarded-for": "invalid" }))).toBe(baseline);
  });
});
