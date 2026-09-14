import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

import {
  isSafeSlug,
  lockedWriteupSourceSchema,
  publicWriteupSourceSchema,
  writeupMetadataSchema,
} from "./writeup-source-schema.mjs";

function missing(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function directoryEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

async function requireFile(filePath) {
  // Content is repository data, but metadata and body paths cannot be symlinks.
  const info = await lstat(filePath);
  if (!info.isFile()) {
    throw new Error(`Expected a regular content file: ${filePath}`);
  }
}

/**
 * Read and validate all configured sources, including drafts, without React or
 * framework imports. Only public bodies are parsed for their front matter;
 * locked bodies are checked with lstat and are never read during discovery.
 */
export async function readWriteupSources(contentRoot) {
  const publicDirectory = path.resolve(contentRoot, "public");
  const lockedDirectory = path.resolve(contentRoot, "locked");

  async function readPublic(fileName) {
    const slug = fileName.slice(0, -3);
    if (!isSafeSlug(slug)) {
      throw new Error(`Invalid public write-up filename: ${fileName}`);
    }
    const contentPath = path.join(publicDirectory, fileName);
    const { data } = matter(await readFile(contentPath, "utf8"));
    const parsed = publicWriteupSourceSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(
        `Invalid front matter in ${fileName}: ${parsed.error.message}`,
      );
    }
    if (parsed.data.slug !== slug) {
      throw new Error(`Slug must match the filename: ${fileName}`);
    }
    return {
      draft: parsed.data.draft,
      entry: {
        access: "public",
        metadata: writeupMetadataSchema.parse(parsed.data),
        sortOrder: parsed.data.sortOrder,
        contentPath,
      },
    };
  }

  async function readLocked(slug) {
    if (!isSafeSlug(slug)) {
      throw new Error(`Invalid locked write-up directory: ${slug}`);
    }
    const metadataPath = path.join(lockedDirectory, slug, "metadata.json");
    const contentPath = path.join(lockedDirectory, slug, "writeup.md");
    await Promise.all([requireFile(metadataPath), requireFile(contentPath)]);
    let source;
    try {
      source = JSON.parse(await readFile(metadataPath, "utf8"));
    } catch {
      throw new Error(`Invalid JSON in ${metadataPath}`);
    }
    const parsed = lockedWriteupSourceSchema.safeParse(source);
    if (!parsed.success) {
      throw new Error(
        `Invalid locked metadata in ${metadataPath}: ${parsed.error.message}`,
      );
    }
    if (parsed.data.slug !== slug) {
      throw new Error(`Slug must match the directory: ${metadataPath}`);
    }
    return {
      draft: parsed.data.draft,
      entry: {
        access: "locked",
        metadata: writeupMetadataSchema.parse(parsed.data),
        sortOrder: parsed.data.sortOrder,
        contentPath,
        flagHashEnv: parsed.data.flagHashEnv,
      },
    };
  }

  const [publicFiles, lockedFolders] = await Promise.all([
    directoryEntries(publicDirectory),
    directoryEntries(lockedDirectory),
  ]);
  const sources = await Promise.all([
    ...publicFiles
      .filter((file) => file.isFile() && file.name.endsWith(".md"))
      .map((file) => readPublic(file.name)),
    ...lockedFolders
      .filter((folder) => folder.isDirectory())
      .map((folder) => readLocked(folder.name)),
  ]);
  const slugs = new Set();
  const flagEnvs = new Set();
  for (const { entry } of sources) {
    if (slugs.has(entry.metadata.slug)) {
      throw new Error(`Duplicate write-up slug: ${entry.metadata.slug}`);
    }
    slugs.add(entry.metadata.slug);
    if (entry.access === "locked") {
      if (flagEnvs.has(entry.flagHashEnv)) {
        throw new Error(
          `Locked write-ups must have distinct flagHashEnv names: ${entry.metadata.slug}`,
        );
      }
      flagEnvs.add(entry.flagHashEnv);
    }
  }
  return sources;
}
