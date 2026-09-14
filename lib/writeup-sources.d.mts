import type { WriteupMetadata } from "../types/writeup";

type EntryBase = { metadata: WriteupMetadata; contentPath: string; sortOrder?: number };
export type WriteupEntry =
  | (EntryBase & { access: "public" })
  | (EntryBase & { access: "locked"; flagHashEnv: string });

export type WriteupSource = { entry: WriteupEntry; draft: boolean };

export function readWriteupSources(
  contentRoot: string,
): Promise<WriteupSource[]>;
