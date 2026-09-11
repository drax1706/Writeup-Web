import { appendFile, readFile } from "node:fs/promises";

// Only a public URL is written to the summary; no cookies or secrets are used.
const deployed = new URL((await readFile("deployment-url.txt", "utf8")).trim());
if (
  deployed.protocol !== "https:" ||
  !deployed.hostname.endsWith(".vercel.app") ||
  deployed.username ||
  deployed.password
) {
  throw new Error("Expected the HTTPS deployment URL returned by Vercel CLI.");
}
for (const route of ["/", "/writeups", "/tools/encoder", "/tools/jwt"]) {
  const response = await fetch(new URL(route, deployed), {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (
    response.status !== 200 ||
    !response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new Error(
      `Deployment smoke check failed for ${route}: HTTP ${response.status}. Check deployment protection and server logs.`,
    );
  }
  await response.body?.cancel();
  console.log(`PASS ${route}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `\nProduction deployment: [Open website](${deployed.origin})\n\nPublic route smoke checks passed.\n`,
  );
}
