import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";

const CLIENT_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 1000;
const MAX_CLIENTS = 10_000;

type Bucket = { attempts: number; resetAt: number };
type LimitResult = { allowed: boolean; retryAfter: number };

/**
 * A bounded, per-process MVP guard. Instances/restarts do not share counters.
 * Use a durable shared limiter before relying on this at production scale.
 */
export function createUnlockRateLimiter() {
  const clients = new Map<string, Bucket>();
  let global: Bucket = { attempts: 0, resetAt: 0 };

  return (identity: string, now = Date.now()): LimitResult => {
    if (global.resetAt <= now) global = { attempts: 0, resetAt: now + GLOBAL_WINDOW_MS };
    if (global.attempts >= 30) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((global.resetAt - now) / 1000)) };
    }

    for (const [key, bucket] of clients) {
      if (bucket.resetAt <= now) clients.delete(key);
    }
    const existing = clients.get(identity);
    if (!existing && clients.size >= MAX_CLIENTS) {
      return { allowed: false, retryAfter: 60 };
    }

    const bucket = existing ?? { attempts: 0, resetAt: now + CLIENT_WINDOW_MS };
    if (bucket.attempts >= 5) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    bucket.attempts += 1;
    global.attempts += 1;
    clients.set(identity, bucket);
    return { allowed: true, retryAfter: 0 };
  };
}

export function getUnlockRateLimitIdentity(headers: Headers): string {
  // Vercel overwrites this header at its edge. Do not trust user-supplied
  // X-Forwarded-For on arbitrary self-hosted deployments.
  const forwarded = process.env.VERCEL === "1"
    ? headers.get("x-vercel-forwarded-for")?.trim()
    : undefined;
  const identity = forwarded && isIP(forwarded) ? forwarded : "shared-anonymous";
  return createHash("sha256").update(identity).digest("hex");
}

export const consumeUnlockAttempt = createUnlockRateLimiter();
