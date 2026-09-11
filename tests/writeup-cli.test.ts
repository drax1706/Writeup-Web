import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { parseEnv } from "node:util";
import { compare } from "bcryptjs";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createWriteup,
  configureWriteupFlag,
  readFlagFromStdin,
} from "../scripts/writeup-cli.mjs";

let root: string;
const secret = "existing-session-secret-to-preserve-for-all-articles";
const decodeHash = (value: string | undefined) => {
  if (!value) throw new Error("Expected a persisted flag hash");
  return value.replaceAll("\\$", "$");
};

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "websec-cli-"));
});

afterEach(async () => {
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith("websec-cli-")
  ) {
    throw new Error("Refusing cleanup outside the allocated fixture directory");
  }
  await rm(resolved, { recursive: true, force: true });
});

async function locked(slug = "my-lab") {
  return createWriteup({
    root,
    slug,
    title: "Một bài viết mới",
    access: "locked",
  });
}

describe("write-up authoring commands", () => {
  it("scaffolds a public draft with quoted Unicode front matter", async () => {
    const created = await createWriteup({
      root,
      slug: "my-lab",
      title: 'Bài mới: "XSS" 🔐',
    });
    const source = await readFile(created.filePath, "utf8");
    const { data, content } = matter(source);
    expect(data).toMatchObject({
      title: 'Bài mới: "XSS" 🔐',
      slug: "my-lab",
      draft: true,
    });
    expect(data.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.summary.length).toBeGreaterThanOrEqual(20);
    expect(content).toContain("## Cách khắc phục");
    expect(data).not.toHaveProperty("flagHashEnv");
  });

  it("keeps locked metadata separate from Markdown and defaults to a draft", async () => {
    const created = await locked();
    const metadata = JSON.parse(await readFile(created.filePath, "utf8"));
    const body = await readFile(
      path.join(path.dirname(created.filePath), "writeup.md"),
      "utf8",
    );
    expect(metadata).toMatchObject({
      slug: "my-lab",
      draft: true,
      flagHashEnv: "WRITEUP_FLAG_HASH_MY_LAB",
    });
    expect(metadata).not.toHaveProperty("content");
    expect(body).toContain("## Tổng quan");
    expect(body).not.toContain("flagHashEnv");
    await expect(
      readFile(path.join(root, ".env.local"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses same-access and cross-access collisions without altering content", async () => {
    const created = await createWriteup({
      root,
      slug: "my-lab",
      title: "Existing",
    });
    const original = await readFile(created.filePath, "utf8");
    await expect(
      createWriteup({ root, slug: "my-lab", title: "Replacement" }),
    ).rejects.toThrow("đã tồn tại");
    await expect(locked()).rejects.toThrow("đã tồn tại");
    expect(await readFile(created.filePath, "utf8")).toBe(original);
    await locked("locked-lab");
    await expect(
      createWriteup({ root, slug: "locked-lab", title: "Replacement" }),
    ).rejects.toThrow("đã tồn tại");
  });

  it.each(["../../escape", "UpperCase", "under_score", "x".repeat(101)])(
    "rejects unsafe slug %s",
    async (slug) => {
      await expect(
        createWriteup({ root, slug, title: "Invalid" }),
      ).rejects.toThrow("Slug");
    },
  );

  it("adds independent flags while preserving other env values and session secret", async () => {
    await locked("first-lab");
    await locked("second-lab");
    const existing = `# keep this comment\r\nPROFILE_CV_URL=https://example.com/cv\r\nOTHER="line one\nSESSION_SECRET=inside-an-unrelated-multiline-value\nline three"\r\nSESSION_SECRET=${secret}\r\n`;
    await writeFile(path.join(root, ".env.local"), existing);
    await configureWriteupFlag({
      root,
      slug: "first-lab",
      flag: "FIRST{xin-chào}",
    });
    await configureWriteupFlag({
      root,
      slug: "second-lab",
      flag: "SECOND{different}",
    });
    const source = await readFile(path.join(root, ".env.local"), "utf8");
    const env = parseEnv(source);
    expect(source.startsWith(existing)).toBe(true);
    expect(env.SESSION_SECRET).toBe(secret);
    expect(source).toContain("\\$2b\\$12\\$");
    expect(source).not.toContain("FIRST{xin-chào}");
    expect(source).not.toContain("SECOND{different}");
    await expect(
      compare("FIRST{xin-chào}", decodeHash(env.WRITEUP_FLAG_HASH_FIRST_LAB)),
    ).resolves.toBe(true);
    await expect(
      compare("SECOND{different}", decodeHash(env.WRITEUP_FLAG_HASH_FIRST_LAB)),
    ).resolves.toBe(false);
    await expect(
      compare(
        "SECOND{different}",
        decodeHash(env.WRITEUP_FLAG_HASH_SECOND_LAB),
      ),
    ).resolves.toBe(true);
  });

  it("requires explicit replacement to rotate a flag and retains existing sessions' secret", async () => {
    await locked();
    await configureWriteupFlag({ root, slug: "my-lab", flag: "OLD{flag}" });
    const before = await readFile(path.join(root, ".env.local"), "utf8");
    await expect(
      configureWriteupFlag({ root, slug: "my-lab", flag: "NEW{flag}" }),
    ).rejects.toThrow("--replace");
    expect(await readFile(path.join(root, ".env.local"), "utf8")).toBe(before);
    await configureWriteupFlag({
      root,
      slug: "my-lab",
      flag: "NEW{flag}",
      replace: true,
    });
    const after = parseEnv(
      await readFile(path.join(root, ".env.local"), "utf8"),
    );
    expect(after.SESSION_SECRET).toBe(parseEnv(before).SESSION_SECRET);
    await expect(
      compare("OLD{flag}", decodeHash(after.WRITEUP_FLAG_HASH_MY_LAB)),
    ).resolves.toBe(false);
    await expect(
      compare("NEW{flag}", decodeHash(after.WRITEUP_FLAG_HASH_MY_LAB)),
    ).resolves.toBe(true);
  });

  it("generates a flag and secret without saving the plaintext flag", async () => {
    await locked();
    const result = await configureWriteupFlag({
      root,
      slug: "my-lab",
      generate: true,
    });
    const source = await readFile(result.envPath, "utf8");
    const env = parseEnv(source);
    expect(result.generatedFlag).toMatch(/^FLAG\{[A-Za-z0-9_-]+\}$/);
    expect(source).not.toContain(result.generatedFlag);
    expect(Buffer.byteLength(env.SESSION_SECRET ?? "")).toBeGreaterThanOrEqual(
      32,
    );
    await expect(
      compare(result.generatedFlag!, decodeHash(env.WRITEUP_FLAG_HASH_MY_LAB)),
    ).resolves.toBe(true);
  });

  it.each(["", "é".repeat(37), "bad\0flag", "two\nlines", "\uD800"])(
    "rejects invalid flag input before changing env",
    async (flag) => {
      await locked();
      await writeFile(
        path.join(root, ".env.local"),
        `SESSION_SECRET=${secret}\n`,
      );
      await expect(
        configureWriteupFlag({ root, slug: "my-lab", flag }),
      ).rejects.toThrow("Flag");
      expect(await readFile(path.join(root, ".env.local"), "utf8")).toBe(
        `SESSION_SECRET=${secret}\n`,
      );
    },
  );

  it.each(["NEXT_PUBLIC_FLAG_HASH", "SESSION_SECRET"])(
    "rejects unsafe flag env reference %s",
    async (flagHashEnv) => {
      const created = await locked();
      const metadata = JSON.parse(await readFile(created.filePath, "utf8"));
      await writeFile(
        created.filePath,
        JSON.stringify({ ...metadata, flagHashEnv }),
      );
      await expect(
        configureWriteupFlag({ root, slug: "my-lab", flag: "TEST{flag}" }),
      ).rejects.toThrow("flagHashEnv");
      await expect(
        readFile(path.join(root, ".env.local"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("does not overwrite malformed existing session configuration", async () => {
    await locked();
    const before = "SESSION_SECRET=short\nKEEP=value\n";
    await writeFile(path.join(root, ".env.local"), before);
    await expect(
      configureWriteupFlag({ root, slug: "my-lab", generate: true }),
    ).rejects.toThrow("quá ngắn");
    expect(await readFile(path.join(root, ".env.local"), "utf8")).toBe(before);
  });

  it("reads a single UTF-8 flag from stdin without stripping meaningful spaces", async () => {
    await expect(
      readFlagFromStdin(Readable.from([Buffer.from(" FLAG{Việt Nam} \r\n")])),
    ).resolves.toBe(" FLAG{Việt Nam} ");
    await expect(
      readFlagFromStdin(Readable.from([Buffer.from("one\ntwo\n")])),
    ).rejects.toThrow("một dòng");
    await expect(
      readFlagFromStdin(Readable.from([Buffer.from("é".repeat(38))])),
    ).rejects.toThrow("72 byte");
    await expect(
      readFlagFromStdin(Readable.from([Buffer.from([0xff])])),
    ).rejects.toThrow();
  });
});
