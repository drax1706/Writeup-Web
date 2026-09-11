import assert from "node:assert/strict";
import { isSafeWriteupSlug } from "../lib/writeup-policy.mjs";

// Run against an already running production server. Secrets are read only from
// this process's environment and are never logged or written to a file.
const flag = process.env.SMOKE_FLAG;
const slug = process.env.SMOKE_SLUG;
if (!flag || !slug || !isSafeWriteupSlug(slug)) {
  console.error(
    "Set SMOKE_FLAG and a valid SMOKE_SLUG for a published locked write-up before running this smoke check.",
  );
  process.exit(1);
}

const base = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000");
const articlePath = `/writeups/${slug}`;
const apiPath = `/api/writeups/${slug}/unlock`;
// The optional marker should be a unique, plain-text passage inside the body,
// absent from its public title/summary. It is never included in diagnostics.
const protectedMarkers = process.env.SMOKE_PROTECTED_MARKER
  ? [process.env.SMOKE_PROTECTED_MARKER]
  : [];
let checks = 0;

function check(condition, message) {
  // Do not include response bodies, flag, or cookie in assertion diagnostics.
  assert.ok(condition, message);
  checks += 1;
}

function noStore(response) {
  check(
    response.headers.get("cache-control")?.includes("no-store"),
    "Protected responses must disable caching",
  );
}

async function getArticle({ cookie, rsc = false } = {}) {
  const response = await fetch(
    new URL(`${articlePath}${rsc ? "?_rsc" : ""}`, base),
    {
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(rsc ? { RSC: "1" } : {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    },
  );
  check(response.status === 200, "Article route must return 200");
  noStore(response);
  if (rsc)
    check(
      response.headers.get("content-type")?.includes("text/x-component"),
      "RSC probe must receive a React server component response",
    );
  const body = await response.text();
  check(!body.includes(flag), "Article response must never disclose the flag");
  return body;
}

function expectLocked(body) {
  check(
    protectedMarkers.every((marker) => !body.includes(marker)),
    "Unauthenticated or invalid sessions must not receive the protected body",
  );
  check(
    !body.includes("article-layout"),
    "Locked response must not render the article body",
  );
  check(
    body.includes("unlock-panel"),
    "Locked response must show the unlock form",
  );
}

async function unlock(value) {
  const response = await fetch(new URL(apiPath, base), {
    method: "POST",
    headers: { Origin: base.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ flag: value }),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  noStore(response);
  return response;
}

try {
  expectLocked(await getArticle());
  expectLocked(await getArticle({ rsc: true }));
  console.log("PASS anonymous HTML and RSC exclude protected content");

  const incorrectFlag =
    flag === "intentionally-incorrect-smoke-input"
      ? "another-incorrect-smoke-input"
      : "intentionally-incorrect-smoke-input";
  const wrong = await unlock(incorrectFlag);
  check(
    wrong.status === 401,
    `Wrong flag must return 401, received ${wrong.status} (restart the local server if its rate limit was already consumed)`,
  );
  check(!wrong.headers.has("set-cookie"), "Wrong flag must not issue a cookie");
  console.log("PASS wrong flag does not create a session");

  const correct = await unlock(flag);
  check(correct.status === 200, "Correct flag must return 200");
  const result = await correct.json();
  check(
    result?.ok === true && Object.keys(result).length === 1,
    "Unlock API must return status only",
  );
  const setCookie = correct.headers.get("set-cookie") ?? "";
  check(
    setCookie.startsWith(`__Secure-vault_unlock_${slug}=`),
    "Production cookie must use the secure prefix and selected slug",
  );
  check(
    /;\s*HttpOnly/i.test(setCookie) && /;\s*Secure/i.test(setCookie),
    "Production cookie must be HttpOnly and Secure",
  );
  check(
    /;\s*SameSite=strict/i.test(setCookie) &&
      /;\s*Max-Age=1800/i.test(setCookie),
    "Production cookie must have strict same-site policy and thirty-minute expiry",
  );
  check(
    /;\s*Path=\/writeups(?:;|$)/i.test(setCookie),
    "Unlock cookie must be restricted to write-up routes",
  );
  check(!setCookie.includes(flag), "Cookie must not contain the flag");
  const cookie = setCookie.split(";", 1)[0];
  for (const rsc of [false, true]) {
    const body = await getArticle({ cookie, rsc });
    check(
      body.includes("article-layout"),
      "Valid session must render the article body",
    );
    check(
      !body.includes("unlock-panel"),
      "Valid session must no longer show the unlock form",
    );
    check(
      protectedMarkers.every((marker) => body.includes(marker)),
      "Valid session must receive the protected article",
    );
  }
  console.log(
    "PASS signed session opens HTML and RSC for the selected write-up",
  );

  expectLocked(await getArticle());
  expectLocked(await getArticle({ rsc: true }));
  const dot = cookie.lastIndexOf(".");
  check(dot > 0, "Signed cookie must contain a signature");
  const replacement = cookie[dot + 1] === "a" ? "b" : "a";
  const tampered = `${cookie.slice(0, dot + 1)}${replacement}${cookie.slice(dot + 2)}`;
  expectLocked(await getArticle({ cookie: tampered }));
  expectLocked(await getArticle({ cookie: tampered, rsc: true }));
  console.log(
    "PASS new anonymous requests and tampered sessions remain locked",
  );
  console.log(`PASS ${checks} HTTP assertions, including no-store responses`);
  console.log(
    "The test forwards the Secure cookie manually; verify actual browser cookie storage separately over HTTPS.",
  );
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? `FAIL ${error.message}`
      : "FAIL HTTP smoke check could not finish; check the server and its configuration.",
  );
  process.exitCode = 1;
}
