import { NextResponse } from "next/server";

import {
  isFlagVerificationConfigured,
  isValidFlagInput,
  verifyWriteupFlag,
} from "@/lib/flag-verification.server";
import { getWriteupEntryBySlug } from "@/lib/writeup-catalog.server";
import { isSafeWriteupSlug } from "@/lib/writeup-policy.mjs";
import {
  consumeUnlockAttempt,
  getUnlockRateLimitIdentity,
} from "@/lib/unlock-rate-limit.server";
import {
  createUnlockSession,
  getUnlockCookieName,
  getUnlockCookieOptions,
  isUnlockSessionConfigured,
} from "@/lib/unlock-session.server";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 512;

function reply(body: { error: string } | { ok: true }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || /[\s\\\/#?@]/.test(host)) return false;

  // Next may construct request.url with its internal listening hostname.
  // Browser Host is the public authority, and browsers cannot override it.
  // Only Vercel's trusted edge may supply the externally used protocol.
  const requestProtocol = new URL(request.url).protocol.slice(0, -1);
  const protocol =
    process.env.VERCEL === "1"
      ? (request.headers.get("x-forwarded-proto") ?? requestProtocol)
      : requestProtocol;
  if (protocol !== "http" && protocol !== "https") return false;

  try {
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const sizeHeader = request.headers.get("content-length");
  if (
    sizeHeader &&
    (!/^\d+$/.test(sizeHeader) || Number(sizeHeader) > MAX_BODY_BYTES)
  ) {
    throw new Error("Invalid body");
  }
  if (!request.body) throw new Error("Invalid body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Invalid body");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!isSafeWriteupSlug(slug))
    return reply({ error: "Không tìm thấy bài viết." }, 404);
  const entry = await getWriteupEntryBySlug(slug);
  if (!entry || entry.access !== "locked")
    return reply({ error: "Không tìm thấy bài viết." }, 404);

  if (!isSameOriginRequest(request)) {
    return reply({ error: "Yêu cầu không hợp lệ." }, 403);
  }
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/json"
  ) {
    return reply({ error: "Yêu cầu phải có định dạng JSON." }, 415);
  }
  if (
    !isFlagVerificationConfigured(entry.flagHashEnv) ||
    !isUnlockSessionConfigured()
  ) {
    return reply(
      { error: "Chưa thể mở bài lúc này. Thử lại sau." },
      503,
    );
  }

  const limit = consumeUnlockAttempt(
    getUnlockRateLimitIdentity(request.headers),
  );
  if (!limit.allowed) {
    const response = reply(
      { error: "Bạn đã thử quá nhiều lần. Thử lại sau." },
      429,
    );
    response.headers.set("Retry-After", String(limit.retryAfter));
    return response;
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch {
    return reply({ error: "Yêu cầu không hợp lệ." }, 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("flag" in body) ||
    !isValidFlagInput(body.flag)
  )
    return reply({ error: "Flag không hợp lệ." }, 400);

  if (!(await verifyWriteupFlag(body.flag, entry.flagHashEnv))) {
    return reply({ error: "Flag không đúng. Kiểm tra lại flag đã nhập." }, 401);
  }
  const response = reply({ ok: true }, 200);
  response.cookies.set(
    getUnlockCookieName(slug),
    createUnlockSession(slug),
    getUnlockCookieOptions(),
  );
  return response;
}
