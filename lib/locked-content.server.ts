import "server-only";

import { readFile } from "node:fs/promises";
import { extractHeadings } from "@/lib/markdown";
import { verifyUnlockSession } from "@/lib/unlock-session.server";
import { getWriteupEntryBySlug } from "@/lib/writeup-catalog.server";
import type { Writeup } from "@/types/writeup";

export function createLockedWriteupReader(findEntry = getWriteupEntryBySlug) {
  return async function readLockedWriteup(
    slug: string,
    sessionToken?: string,
  ): Promise<Writeup | null> {
    // Authenticate before any protected-body I/O, including when called without a page.
    if (!verifyUnlockSession(sessionToken, slug)) return null;
    const entry = await findEntry(slug);
    if (!entry || entry.access !== "locked") return null;
    const content = await readFile(entry.contentPath, "utf8");
    return {
      metadata: entry.metadata,
      content,
      headings: extractHeadings(content),
    };
  };
}

export const getLockedWriteupBySlug = createLockedWriteupReader();
