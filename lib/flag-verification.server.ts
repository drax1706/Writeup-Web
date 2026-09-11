import "server-only";

import { compare } from "bcryptjs";
import { isSafeFlagHashEnv } from "@/lib/writeup-policy.mjs";

// bcrypt ignores bytes after byte 72. Reject those inputs instead of accepting
// several different flags that share the same prefix.
export const MAX_FLAG_BYTES = 72;

function configuredHash(flagHashEnv: string): string | null {
  if (!isSafeFlagHashEnv(flagHashEnv)) return null;
  const hash = process.env[flagHashEnv];
  if (!hash || !/^\$2[aby]\$(10|11|12|13|14)\$[./A-Za-z0-9]{53}$/.test(hash)) {
    return null;
  }
  return hash;
}

export function isFlagVerificationConfigured(flagHashEnv: string): boolean {
  return configuredHash(flagHashEnv) !== null;
}

export function isValidFlagInput(flag: unknown): flag is string {
  return (
    typeof flag === "string" &&
    flag.length > 0 &&
    Buffer.byteLength(flag, "utf8") <= MAX_FLAG_BYTES &&
    !flag.includes("\0")
  );
}

export async function verifyWriteupFlag(
  flag: unknown,
  flagHashEnv: string,
): Promise<boolean> {
  const hash = configuredHash(flagHashEnv);
  if (!hash || !isValidFlagInput(flag)) return false;

  try {
    return await compare(flag, hash);
  } catch {
    return false;
  }
}
