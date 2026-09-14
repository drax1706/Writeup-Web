import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWriteupCatalog } from "@/lib/writeup-catalog.server";
import { readWriteupSources } from "@/lib/writeup-sources.mjs";
import { createLockedWriteupReader } from "@/lib/locked-content.server";
import {
  createUnlockSession,
  UNLOCK_SESSION_TTL_SECONDS,
} from "@/lib/unlock-session.server";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "vault-catalog-"));
  vi.stubEnv(
    "SESSION_SECRET",
    "catalog-test-secret-with-at-least-32-characters",
  );
  vi.clearAllMocks();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
  if (
    !path.resolve(root).startsWith(temporaryRoot) ||
    !path.basename(root).startsWith("vault-catalog-")
  )
    throw new Error("Unsafe fixture cleanup");
  await rm(root, { recursive: true, force: true });
});

function metadata(slug: string, extra: Record<string, unknown> = {}) {
  return {
    title: `Write-up ${slug}`,
    slug,
    platform: "Test Lab",
    difficulty: "Easy",
    vulnerabilities: ["Access Control"],
    publishedAt: "2026-09-09",
    summary: "Public description of a private lab solution.",
    ...extra,
  };
}

async function publicArticle(
  slug: string,
  extra: Record<string, unknown> = {},
) {
  await mkdir(path.join(root, "public"), { recursive: true });
  await writeFile(
    path.join(root, "public", `${slug}.md`),
    matter.stringify("## Public article", metadata(slug, extra)),
    "utf8",
  );
}

async function lockedArticle(
  slug: string,
  extra: Record<string, unknown> = {},
) {
  const directory = path.join(root, "locked", slug);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "metadata.json"),
    JSON.stringify(
      metadata(slug, {
        flagHashEnv: `WRITEUP_FLAG_HASH_${slug.replaceAll("-", "_").toUpperCase()}`,
        ...extra,
      }),
    ),
    "utf8",
  );
  await writeFile(
    path.join(directory, "writeup.md"),
    `## Protected ${slug}\n\nprivate-body-${slug}`,
    "utf8",
  );
}

describe("automatic write-up catalog", () => {
  it("keeps publication dates first and explicit same-day order stable across access modes", async () => {
    await publicArticle("a-second", { sortOrder: 2 });
    await lockedArticle("z-first", { sortOrder: 1 });
    await publicArticle("unordered");
    await publicArticle("max-order", { sortOrder: Number.MAX_SAFE_INTEGER });
    await publicArticle("older", { publishedAt: "2026-09-08", sortOrder: 0 });
    await publicArticle("newer", { publishedAt: "2026-09-10" });
    await publicArticle("draft-first", { sortOrder: 0, draft: true });
    const summaries = await createWriteupCatalog(root).getWriteupSummaries();
    expect(summaries.map(({ slug }) => slug)).toEqual([
      "newer", "z-first", "a-second", "max-order", "unordered", "older",
    ]);
    expect(summaries.every((summary) => !("sortOrder" in summary))).toBe(true);
  });

  it.each([-1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1])("rejects invalid sortOrder %s", async (sortOrder) => {
    await publicArticle("invalid-order", { sortOrder });
    await expect(readWriteupSources(root)).rejects.toThrow("Invalid front matter");
  });

  it("shares all validated draft and published sources with Node authoring tools", async () => {
    await publicArticle("published-public");
    await publicArticle("draft-public", { draft: true });
    await lockedArticle("published-locked");
    await lockedArticle("draft-locked", { draft: true });

    const sources = await readWriteupSources(root);
    expect(sources).toHaveLength(4);
    expect(sources.filter(({ draft }) => draft).map(({ entry }) => entry.metadata.slug).sort()).toEqual([
      "draft-locked", "draft-public",
    ]);
    expect(sources.every(({ entry }) => !("content" in entry))).toBe(true);
    expect(vi.mocked(readFile).mock.calls.some(([file]) => String(file).endsWith("writeup.md"))).toBe(false);

    const published = await createWriteupCatalog(root).getWriteupEntries();
    expect(published.map(({ metadata }) => metadata.slug).sort()).toEqual([
      "published-locked", "published-public",
    ]);
  });

  it("supports a completely empty collection and unsafe lookups", async () => {
    const catalog = createWriteupCatalog(root);
    expect(await catalog.getWriteupSummaries()).toEqual([]);
    for (const slug of ["missing", "../../secrets", "a".repeat(101)]) {
      expect(await catalog.getWriteupEntryBySlug(slug)).toBeNull();
    }
  });

  it("discovers public and multiple locked metadata without reading their bodies", async () => {
    await publicArticle("public-note", { publishedAt: "2026-09-01" });
    await lockedArticle("alpha-note");
    await lockedArticle("beta-note", { publishedAt: "2026-09-08" });
    await publicArticle("draft-public", { draft: true });
    await lockedArticle("draft-locked", { draft: true });
    const catalog = createWriteupCatalog(root);
    const summaries = await catalog.getWriteupSummaries();
    expect(summaries.map(({ slug, access }) => [slug, access])).toEqual([
      ["alpha-note", "locked"],
      ["beta-note", "locked"],
      ["public-note", "public"],
    ]);
    const serialized = JSON.stringify(summaries);
    for (const forbidden of [
      "flagHashEnv",
      "contentPath",
      "WRITEUP_FLAG_HASH",
      "private-body",
      "draft",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(
      vi
        .mocked(readFile)
        .mock.calls.some(([file]) => String(file).endsWith("writeup.md")),
    ).toBe(false);
    expect(await catalog.getWriteupEntryBySlug("draft-public")).toBeNull();
    expect(await catalog.getWriteupEntryBySlug("draft-locked")).toBeNull();
  });

  it("discovers another article without registering it in application code", async () => {
    await publicArticle("first-note");
    const catalog = createWriteupCatalog(root);
    expect(await catalog.getWriteupSummaries()).toHaveLength(1);
    await lockedArticle("added-later");
    expect(
      (await catalog.getWriteupSummaries()).map(({ slug }) => slug),
    ).toContain("added-later");
  });

  it("rejects duplicate slugs across access modes, including drafts", async () => {
    await publicArticle("collision");
    await lockedArticle("collision", { draft: true });
    await expect(
      createWriteupCatalog(root).getWriteupEntries(),
    ).rejects.toThrow("Duplicate write-up slug");
  });

  it("rejects accidentally shared environment variable references", async () => {
    await lockedArticle("first", { flagHashEnv: "SAME_FLAG_HASH" });
    await lockedArticle("second", { flagHashEnv: "SAME_FLAG_HASH" });
    await expect(
      createWriteupCatalog(root).getWriteupEntries(),
    ).rejects.toThrow("distinct flagHashEnv");
  });

  it.each([
    { slug: "another-slug" },
    { flagHashEnv: "NEXT_PUBLIC_FLAG_HASH" },
    { flagHashEnv: "../../secrets" },
    { contentPath: "../../secrets" },
    { flag: "do-not-store-plaintext-flags" },
    { draft: "false" },
  ])("rejects invalid or unsafe locked configuration %#", async (extra) => {
    await lockedArticle("locked-note", extra);
    await expect(
      createWriteupCatalog(root).getWriteupEntries(),
    ).rejects.toThrow();
  });

  it("rejects missing locked body and mismatching public front matter", async () => {
    await lockedArticle("missing-body");
    await rm(path.join(root, "locked", "missing-body", "writeup.md"));
    await expect(
      createWriteupCatalog(root).getWriteupEntries(),
    ).rejects.toThrow();
    await writeFile(
      path.join(root, "locked", "missing-body", "writeup.md"),
      "Restored",
    );
    await publicArticle("public-note", { slug: "wrong-name" });
    await expect(
      createWriteupCatalog(root).getWriteupEntries(),
    ).rejects.toThrow("Slug must match");
  });
});

describe("authorization with multiple locked articles", () => {
  it("reads only the article authorized by the signed session", async () => {
    await lockedArticle("alpha");
    await lockedArticle("beta");
    const catalog = createWriteupCatalog(root);
    const readLocked = createLockedWriteupReader(catalog.getWriteupEntryBySlug);
    const alphaToken = createUnlockSession("alpha");
    expect((await readLocked("alpha", alphaToken))?.content).toContain(
      "private-body-alpha",
    );
    vi.mocked(readFile).mockClear();
    for (const [slug, token] of [
      ["alpha", undefined],
      ["alpha", "forged"],
      ["beta", alphaToken],
      ["../../secret", alphaToken],
    ]) {
      expect(await readLocked(slug!, token)).toBeNull();
    }
    const expired = createUnlockSession(
      "alpha",
      Date.now() - UNLOCK_SESSION_TTL_SECONDS * 1000,
    );
    expect(await readLocked("alpha", expired)).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
    const betaToken = createUnlockSession("beta");
    expect((await readLocked("beta", betaToken))?.content).toContain(
      "private-body-beta",
    );
    expect((await readLocked("alpha", alphaToken))?.headings).toHaveLength(1);
  });

  it("a previously valid session cannot make a draft or public article a locked article", async () => {
    await lockedArticle("draft", { draft: true });
    await publicArticle("public-note");
    const readLocked = createLockedWriteupReader(
      createWriteupCatalog(root).getWriteupEntryBySlug,
    );
    for (const slug of ["draft", "public-note", "missing"]) {
      expect(await readLocked(slug, createUnlockSession(slug))).toBeNull();
    }
    expect(
      vi
        .mocked(readFile)
        .mock.calls.some(([file]) => String(file).endsWith("writeup.md")),
    ).toBe(false);
  });
});
