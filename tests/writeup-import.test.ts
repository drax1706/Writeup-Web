import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importWriteup } from "../scripts/import-writeup.mjs";
import { checkContent } from "../scripts/check-content.mjs";
import { readWriteupSources } from "../lib/writeup-sources.mjs";

let fixture: string;
let root: string;
let file: string;

beforeEach(async () => {
  fixture = await mkdtemp(path.join(os.tmpdir(), "vault-import-"));
  root = path.join(fixture, "site");
  file = path.join(fixture, "export", "notes.md");
  await mkdir(root);
  await mkdir(path.dirname(file));
});
afterEach(async () => {
  if (
    path.dirname(path.resolve(fixture)) !== path.resolve(os.tmpdir()) ||
    !path.basename(fixture).startsWith("vault-import-")
  )
    throw new Error("Unsafe fixture cleanup");
  await rm(fixture, { recursive: true, force: true });
});

describe("Markdown import and preflight", () => {
  it("validates the first reference definition, matching the Markdown renderer", async () => {
    await writeFile(
      file,
      "# Duplicate references\n\n![screen][capture]\n\n[capture]: missing.png\n[capture]: https://example.com/safe.png\n",
    );
    await expect(
      importWriteup({ root, file, slug: "duplicate-ref" }),
    ).rejects.toThrow("Ảnh local bị thiếu");
    expect(await readdir(root)).toEqual([]);
    await writeFile(file, "# Valid\n\nBody\n");
    const result = await importWriteup({ root, file, slug: "duplicate-ref" });
    const output = await readFile(result.filePath, "utf8");
    await writeFile(
      result.filePath,
      output +
        "\n![screen][capture]\n\n[capture]: /images/missing.png\n[capture]: https://example.com/safe.png\n",
    );
    await expect(checkContent({ root })).rejects.toThrow("Thiếu file ảnh");
  });
  it("imports plain Unicode Markdown into a validated draft without modifying the source", async () => {
    const source =
      "# Phân tích mới 🔐\n\n## Nguyên nhân\n\nMột nội dung Markdown.\n";
    await writeFile(file, source);
    const result = await importWriteup({ root, file, slug: "new-notes" });
    const parsed = matter(await readFile(result.filePath, "utf8"));
    expect(parsed.data).toMatchObject({
      title: "Phân tích mới 🔐",
      slug: "new-notes",
      draft: true,
    });
    expect(parsed.content.trim()).toBe(source.trim());
    expect(await readFile(file, "utf8")).toBe(source);
    expect(await checkContent({ root })).toEqual({
      published: 0,
      drafts: 1,
      locked: 0,
    });
    expect(
      (await readWriteupSources(path.join(root, "content")))[0].draft,
    ).toBe(true);
  });

  it("copies only known metadata and makes a published source a draft", async () => {
    await writeFile(
      file,
      "---\ntitle: Imported\nslug: from-metadata\nplatform: CTF\ndifficulty: Hard\nvulnerabilities: [IDOR]\npublishedAt: 2026-09-01\nsummary: A deliberately public summary of this write-up.\ndraft: false\nsortOrder: 3\nflag: PRIVATE_METADATA_MUST_NOT_TRANSFER\n---\n## Body\n",
    );
    const result = await importWriteup({ root, file });
    const output = await readFile(result.filePath, "utf8");
    expect(matter(output).data).toMatchObject({
      slug: "from-metadata",
      draft: true,
      difficulty: "Hard",
      publishedAt: "2026-09-01",
      sortOrder: 3,
    });
    expect(output).not.toContain("PRIVATE_METADATA");
  });

  it("rewrites inline/reference images, handles encoded spaces, and ignores code samples", async () => {
    await mkdir(path.join(path.dirname(file), "assets"));
    const asset = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await writeFile(
      path.join(path.dirname(file), "assets", "screen shot.png"),
      asset,
    );
    await writeFile(
      file,
      '# Images\n\n![shot](assets/screen%20shot.png "caption")\n\n![Again][pic]\n\n[pic]: <assets/screen shot.png> "ref caption"\n\n```md\n![sample](missing.png)\n```\n\n![Remote](https://example.com/photo.png)\n',
    );
    const result = await importWriteup({ root, file, slug: "image-notes" });
    const output = await readFile(result.filePath, "utf8");
    expect(result.imagesCopied).toBe(1);
    expect(output).toContain(
      '![shot](</images/image-notes/image-1.png> "caption")',
    );
    expect(output).toContain(
      '[pic]: </images/image-notes/image-1.png> "ref caption"',
    );
    expect(output).toContain("![sample](missing.png)");
    expect(output).toContain("https://example.com/photo.png");
    expect(
      await readFile(path.join(root, "public/images/image-notes/image-1.png")),
    ).toEqual(asset);
    await expect(checkContent({ root })).resolves.toMatchObject({ drafts: 1 });
  });

  it("imports locked content without putting body text or source env references into metadata", async () => {
    await writeFile(
      file,
      "---\ntitle: Secret lesson\nflagHashEnv: NEXT_PUBLIC_FLAG_HASH\n---\n## Body\nPROTECTED_BODY_SENTINEL\n",
    );
    const result = await importWriteup({
      root,
      file,
      slug: "locked-notes",
      access: "locked",
    });
    const metadata = await readFile(result.filePath, "utf8");
    expect(metadata).not.toContain("PROTECTED_BODY_SENTINEL");
    expect(metadata).not.toContain("NEXT_PUBLIC_");
    expect(JSON.parse(metadata)).toMatchObject({
      flagHashEnv: "WRITEUP_FLAG_HASH_LOCKED_NOTES",
      draft: true,
    });
    expect(
      await readFile(
        path.join(path.dirname(result.filePath), "writeup.md"),
        "utf8",
      ),
    ).toContain("PROTECTED_BODY_SENTINEL");
  });

  it.each([
    "missing.png",
    "../outside.png",
    "%2e%2e/outside.png",
    "x.svg",
    "data:image/png;base64,anything",
    "assets\\x.png",
  ])(
    "rejects unsupported or unsafe image %s without partial output",
    async (image) => {
      await writeFile(file, `# Unsafe\n\n![image](<${image}>)\n`);
      await expect(
        importWriteup({ root, file, slug: "unsafe" }),
      ).rejects.toThrow();
      expect(await readdir(root)).toEqual([]);
    },
  );

  it("refuses to expose locked local images in public", async () => {
    await writeFile(file, "# Private\n\n![solution](screen.png)\n");
    await expect(
      importWriteup({ root, file, slug: "private", access: "locked" }),
    ).rejects.toThrow("không tự chép");
    expect(await readdir(root)).toEqual([]);
  });

  it("does not overwrite existing article content or asset directories", async () => {
    await writeFile(file, "# First\n\nBody\n");
    const first = await importWriteup({ root, file, slug: "same" });
    const original = await readFile(first.filePath, "utf8");
    await expect(
      importWriteup({ root, file, slug: "same", access: "locked" }),
    ).rejects.toThrow("đã tồn tại");
    expect(await readFile(first.filePath, "utf8")).toBe(original);
    await mkdir(path.join(root, "public/images/assets"), { recursive: true });
    await writeFile(
      path.join(path.dirname(file), "screen.png"),
      "image fixture",
    );
    await writeFile(file, "# Assets\n\n![image](screen.png)");
    await expect(importWriteup({ root, file, slug: "assets" })).rejects.toThrow(
      "Thư mục ảnh",
    );
    expect(await readdir(path.join(root, "content/public"))).toEqual([
      "same.md",
    ]);
  });

  it("rejects bad metadata before copying images", async () => {
    await writeFile(file, "---\ndifficulty: Impossible\n---\n# Invalid\n");
    await expect(
      importWriteup({ root, file, slug: "invalid" }),
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });

  it("reports missing public assets with the article slug and fails until corrected", async () => {
    await writeFile(file, "# Valid\n\nBody\n");
    const result = await importWriteup({ root, file, slug: "broken-image" });
    const content = await readFile(result.filePath, "utf8");
    await writeFile(
      result.filePath,
      content + "\n![missing](/images/missing.png)\n",
    );
    await expect(checkContent({ root })).rejects.toThrow("broken-image");
    await mkdir(path.join(root, "public/images"), { recursive: true });
    await writeFile(path.join(root, "public/images/missing.png"), "fixture");
    await expect(checkContent({ root })).resolves.toMatchObject({ drafts: 1 });
  });
});
