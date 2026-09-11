import "server-only";

import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import { cache } from "react";
import { extractHeadings } from "@/lib/markdown";
import {
  getWriteupEntries,
  getWriteupEntryBySlug,
} from "@/lib/writeup-catalog.server";
import type { Writeup, WriteupMetadata } from "@/types/writeup";

export const getPublicWriteups = cache(async (): Promise<WriteupMetadata[]> =>
  (await getWriteupEntries())
    .filter((entry) => entry.access === "public")
    .map((entry) => entry.metadata),
);

export const getPublicWriteupBySlug = cache(
  async (slug: string): Promise<Writeup | null> => {
    const entry = await getWriteupEntryBySlug(slug);
    // A guessed filename must not expose a locked or draft article.
    if (!entry || entry.access !== "public") return null;
    const { content } = matter(await readFile(entry.contentPath, "utf8"));
    return {
      metadata: entry.metadata,
      content,
      headings: extractHeadings(content),
    };
  },
);
