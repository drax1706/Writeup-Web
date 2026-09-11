import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

const fixtures = vi.hoisted(() => {
  const metadata = {
    title: "Fixture article",
    platform: "Test",
    difficulty: "Easy",
    vulnerabilities: ["Access Control"],
    summary: "Public metadata of an isolated fixture article.",
  };
  return [
    {
      access: "public",
      metadata: {
        ...metadata,
        slug: "fixture-newer",
        publishedAt: "2026-09-02",
      },
      contentPath: "/fixtures/newer.md",
    },
    {
      access: "locked",
      metadata: {
        ...metadata,
        slug: "fixture-locked",
        publishedAt: "2026-09-02",
      },
      contentPath: "/fixtures/locked.md",
      flagHashEnv: "FIXTURE_FLAG_HASH",
    },
    {
      access: "public",
      metadata: {
        ...metadata,
        slug: "fixture-older",
        publishedAt: "2026-09-01",
      },
      contentPath: "/fixtures/older.md",
    },
  ];
});

vi.mock("@/lib/writeup-catalog.server", () => ({
  getWriteupEntries: vi.fn(async () => fixtures),
  getWriteupEntryBySlug: vi.fn(
    async (slug: string) =>
      fixtures.find((entry) => entry.metadata.slug === slug) ?? null,
  ),
}));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

import {
  getPublicWriteupBySlug,
  getPublicWriteups,
} from "@/lib/content.server";

beforeEach(() => {
  vi.mocked(readFile).mockReset();
  vi.mocked(readFile).mockResolvedValue(
    "---\ntitle: Fixture\n---\n\n## Phân tích\n\nFixture body.\n",
  );
});

describe("public write-up content", () => {
  it("loads validated summaries sorted by newest first", async () => {
    const writeups = await getPublicWriteups();

    expect(writeups.map(({ slug }) => slug)).toEqual([
      "fixture-newer",
      "fixture-older",
    ]);
    for (let index = 1; index < writeups.length; index += 1) {
      expect(
        Date.parse(writeups[index - 1].publishedAt),
      ).toBeGreaterThanOrEqual(Date.parse(writeups[index].publishedAt));
    }
    expect(writeups.every((writeup) => !("content" in writeup))).toBe(true);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("loads one article and generates its table of contents", async () => {
    const writeup = await getPublicWriteupBySlug("fixture-newer");

    expect(writeup?.content).toContain("## Phân tích");
    expect(writeup?.content).not.toContain("title: Fixture");
    expect(readFile).toHaveBeenCalledExactlyOnceWith(
      "/fixtures/newer.md",
      "utf8",
    );
    expect(writeup?.headings).toContainEqual({
      depth: 2,
      id: "phân-tích",
      text: "Phân tích",
    });
  });

  it("rejects unsafe or missing slugs without reading arbitrary paths", async () => {
    await expect(getPublicWriteupBySlug("../../package")).resolves.toBeNull();
    await expect(getPublicWriteupBySlug("not-published")).resolves.toBeNull();
    await expect(getPublicWriteupBySlug("fixture-locked")).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });
});
