// Shared by the Next.js server and the authoring CLI; no secrets or filesystem I/O.
export const SLUG_MAX_LENGTH = 100;
export const DIFFICULTIES = ["Easy", "Medium", "Hard", "Insane"];

export function isSafeWriteupSlug(value) {
  return (
    typeof value === "string" &&
    value.length <= SLUG_MAX_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

export function isSafeFlagHashEnv(value) {
  return (
    typeof value === "string" &&
    /^[A-Z][A-Z0-9_]{0,119}$/.test(value) &&
    /(?:^|_)FLAG_HASH(?:_|$)/.test(value) &&
    !value.startsWith("NEXT_PUBLIC_")
  );
}

export function flagHashEnvForSlug(slug) {
  if (!isSafeWriteupSlug(slug)) throw new Error("Invalid write-up slug");
  return `WRITEUP_FLAG_HASH_${slug.replaceAll("-", "_").toUpperCase()}`;
}
