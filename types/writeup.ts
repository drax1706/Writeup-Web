import { DIFFICULTIES } from "@/lib/writeup-policy.mjs";
export { DIFFICULTIES } from "@/lib/writeup-policy.mjs";

export type Difficulty = (typeof DIFFICULTIES)[number];

export type WriteupMetadata = {
  title: string;
  slug: string;
  platform: string;
  difficulty: Difficulty;
  vulnerabilities: string[];
  publishedAt: string;
  summary: string;
};

export type Heading = {
  depth: 2 | 3;
  text: string;
  id: string;
};

export type WriteupAccess = "public" | "locked";

// Only these fields are safe to serialize to a list/search client component.
export type WriteupSummary = WriteupMetadata & { access: WriteupAccess };

export type Writeup = {
  metadata: WriteupMetadata;
  content: string;
  headings: Heading[];
};

export type PublicWriteup = Writeup;
