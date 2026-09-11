import { hashSync } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isFlagVerificationConfigured,
  isValidFlagInput,
  verifyWriteupFlag,
} from "@/lib/flag-verification.server";

// A test fixture only; never used by runtime configuration or the client.
const flagHashEnv = "WRITEUP_ALPHA_FLAG_HASH";
const secondEnv = "WRITEUP_BETA_FLAG_HASH";
const testFlag = "TEST{alpha-fixture}";
const testHash = hashSync(testFlag, 10);
const secondFlag = "TEST{beta-fixture}";
const secondHash = hashSync(secondFlag, 10);

beforeEach(() => {
  vi.stubEnv(flagHashEnv, testHash);
  vi.stubEnv(secondEnv, secondHash);
});
afterEach(() => vi.unstubAllEnvs());

describe("server flag verification", () => {
  it("verifies an exact flag and rejects incorrect values", async () => {
    await expect(verifyWriteupFlag(testFlag, flagHashEnv)).resolves.toBe(true);
    await expect(verifyWriteupFlag(`${testFlag} `, flagHashEnv)).resolves.toBe(
      false,
    );
    await expect(verifyWriteupFlag("wrong", flagHashEnv)).resolves.toBe(false);
    await expect(verifyWriteupFlag(secondFlag, secondEnv)).resolves.toBe(true);
    await expect(verifyWriteupFlag(testFlag, secondEnv)).resolves.toBe(false);
    await expect(verifyWriteupFlag(secondFlag, flagHashEnv)).resolves.toBe(
      false,
    );
  });

  it("does not disable other write-ups when one hash is missing", async () => {
    vi.stubEnv(flagHashEnv, "");
    expect(isFlagVerificationConfigured(flagHashEnv)).toBe(false);
    await expect(verifyWriteupFlag(testFlag, flagHashEnv)).resolves.toBe(false);
    expect(isFlagVerificationConfigured(secondEnv)).toBe(true);
    await expect(verifyWriteupFlag(secondFlag, secondEnv)).resolves.toBe(true);
  });

  it("rejects bcrypt truncation, Unicode byte overflow, NUL and non-string input", async () => {
    vi.stubEnv(flagHashEnv, hashSync("a".repeat(72), 10));
    await expect(verifyWriteupFlag("a".repeat(72), flagHashEnv)).resolves.toBe(
      true,
    );
    await expect(verifyWriteupFlag("a".repeat(73), flagHashEnv)).resolves.toBe(
      false,
    );
    for (const invalid of [
      "",
      "😀".repeat(19),
      "flag\0",
      null,
      undefined,
      {},
      [testFlag],
      123,
    ]) {
      expect(isValidFlagInput(invalid)).toBe(false);
      await expect(verifyWriteupFlag(invalid, flagHashEnv)).resolves.toBe(
        false,
      );
    }
    expect(isValidFlagInput("😀".repeat(18))).toBe(true);
  });

  it("fails closed with missing, malformed, weak or excessive-cost hash", async () => {
    for (const invalidHash of [
      "",
      "plaintext",
      testHash.replace("$10$", "$04$"),
      testHash.replace("$10$", "$31$"),
    ]) {
      vi.stubEnv(flagHashEnv, invalidHash);
      expect(isFlagVerificationConfigured(flagHashEnv)).toBe(false);
      await expect(verifyWriteupFlag(testFlag, flagHashEnv)).resolves.toBe(
        false,
      );
    }
  });

  it("rejects public or malformed environment references even if they contain a valid hash", async () => {
    for (const invalidEnv of [
      "NEXT_PUBLIC_FLAG_HASH",
      "SESSION_SECRET",
      "NODE_ENV",
      "VERCEL",
      "lowercase_hash",
      "FLAG-HASH",
      "1FLAG_HASH",
      "A".repeat(121),
    ]) {
      vi.stubEnv(invalidEnv, testHash);
      expect(isFlagVerificationConfigured(invalidEnv)).toBe(false);
      await expect(verifyWriteupFlag(testFlag, invalidEnv)).resolves.toBe(
        false,
      );
    }
    expect(isFlagVerificationConfigured("")).toBe(false);
  });
});
