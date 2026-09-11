import type { Readable } from "node:stream";
import type { Stats } from "node:fs";
import type { WriteupMetadata } from "../types/writeup";

export const projectRoot: string;
export function existing(filePath: string): Promise<Stats | null>;
export function assertPlainPath(root: string, filePath: string): Promise<void>;

export function createWriteup(options: {
  slug: string;
  title: string;
  access?: "public" | "locked";
  root?: string;
  metadata?: Partial<WriteupMetadata>;
  content?: string;
}): Promise<{
  access: "public" | "locked";
  slug: string;
  filePath: string;
  flagHashEnv?: string;
}>;
export function configureWriteupFlag(options: {
  slug: string;
  flag?: string;
  generate?: boolean;
  replace?: boolean;
  root?: string;
}): Promise<{ envPath: string; flagHashEnv: string; generatedFlag?: string }>;
export function readFlagFromStdin(input?: Readable): Promise<string>;
export function readHiddenFlag(): Promise<string>;
