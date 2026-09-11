import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { isSafeSlug } from "@/lib/writeup-schema";

export const UNLOCK_SESSION_TTL_SECONDS = 30 * 60;

function sessionSecret(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) return null;
  return Buffer.from(secret, "utf8");
}

export function isUnlockSessionConfigured(): boolean {
  return sessionSecret() !== null;
}

export function getUnlockCookieName(slug: string): string {
  if (!isSafeSlug(slug) || slug.length > 100) throw new Error("Invalid slug");
  const prefix = process.env.NODE_ENV === "production" ? "__Secure-" : "";
  return `${prefix}vault_unlock_${slug}`;
}

export function getUnlockCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/writeups",
    maxAge: UNLOCK_SESSION_TTL_SECONDS,
    expires: new Date(Date.now() + UNLOCK_SESSION_TTL_SECONDS * 1000),
  };
}

export function createUnlockSession(slug: string, now = Date.now()): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("Unlock session is not configured");
  if (!isSafeSlug(slug) || slug.length > 100) throw new Error("Invalid slug");

  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      sub: slug,
      iat: issuedAt,
      exp: issuedAt + UNLOCK_SESSION_TTL_SECONDS,
      nonce: randomBytes(16).toString("base64url"),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUnlockSession(
  token: string | undefined,
  slug: string,
  now = Date.now(),
): boolean {
  const secret = sessionSecret();
  if (!secret || !token || token.length > 1024) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, encodedSignature] = parts;
  if (
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]{43}$/.test(encodedSignature)
  ) return false;

  const signature = Buffer.from(encodedSignature, "base64url");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (
    signature.toString("base64url") !== encodedSignature ||
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  ) return false;

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return false;
    const value = claims as Record<string, unknown>;
    const seconds = Math.floor(now / 1000);
    return (
      value.v === 1 &&
      value.sub === slug &&
      typeof value.iat === "number" &&
      Number.isSafeInteger(value.iat) &&
      value.iat <= seconds &&
      typeof value.exp === "number" &&
      Number.isSafeInteger(value.exp) &&
      value.exp > seconds &&
      value.exp - value.iat === UNLOCK_SESSION_TTL_SECONDS &&
      typeof value.nonce === "string" &&
      /^[A-Za-z0-9_-]{22}$/.test(value.nonce)
    );
  } catch {
    return false;
  }
}
