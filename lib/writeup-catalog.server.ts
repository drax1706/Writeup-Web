import "server-only";

import path from "node:path";
import { cache } from "react";

import { isSafeSlug, writeupMetadataSchema } from "@/lib/writeup-schema";
import { readWriteupSources } from "@/lib/writeup-sources.mjs";
import type { WriteupEntry } from "@/lib/writeup-sources.mjs";
import type { WriteupSummary } from "@/types/writeup";

export type { WriteupEntry } from "@/lib/writeup-sources.mjs";

export function toWriteupSummary(entry: WriteupEntry): WriteupSummary {
  // Parse the allowlist again, never spread the server entry into client props.
  return {
    ...writeupMetadataSchema.parse(entry.metadata),
    access: entry.access,
  };
}

/** The shared source reader also powers Node authoring and validation tools. */
export function createWriteupCatalog(contentRoot: string) {
  const getWriteupEntries = cache(async (): Promise<WriteupEntry[]> =>
    (await readWriteupSources(contentRoot))
      .filter(({ draft }) => !draft)
      .map(({ entry }) => entry)
      .sort(
        (left, right) =>
          right.metadata.publishedAt.localeCompare(left.metadata.publishedAt) ||
          (left.sortOrder ?? Infinity) - (right.sortOrder ?? Infinity) ||
          left.metadata.slug.localeCompare(right.metadata.slug),
      ),
  );

  const getWriteupEntryBySlug = cache(
    async (slug: string): Promise<WriteupEntry | null> => {
      if (!isSafeSlug(slug)) return null;
      return (
        (await getWriteupEntries()).find(
          (entry) => entry.metadata.slug === slug,
        ) ?? null
      );
    },
  );

  async function getWriteupSummaries(): Promise<WriteupSummary[]> {
    return (await getWriteupEntries()).map(toWriteupSummary);
  }

  return { getWriteupEntries, getWriteupEntryBySlug, getWriteupSummaries };
}

export type WriteupCatalog = ReturnType<typeof createWriteupCatalog>;
export const { getWriteupEntries, getWriteupEntryBySlug, getWriteupSummaries } =
  createWriteupCatalog(path.join(process.cwd(), "content"));
