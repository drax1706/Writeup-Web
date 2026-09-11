import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { readWriteupSources } from "../lib/writeup-sources.mjs";
import { assertPlainPath, existing, projectRoot } from "./writeup-cli.mjs";
import {
  imageLocation,
  markdownImages,
  resolveInside,
} from "./markdown-images.mjs";

export async function checkContent({ root = projectRoot } = {}) {
  root = path.resolve(root);
  const sources = await readWriteupSources(path.join(root, "content"));
  const errors = [];
  for (const { entry } of sources) {
    // Authoring/CI can read the repository, including drafts and locked files.
    const source = await readFile(entry.contentPath, "utf8");
    const body = entry.access === "public" ? matter(source).content : source;
    if (!body.trim()) errors.push(`${entry.metadata.slug}: thân bài rỗng.`);
    for (const image of markdownImages(body).images) {
      try {
        const location = imageLocation(image.url);
        if (location.kind === "remote") continue;
        if (location.kind !== "public")
          throw new Error(
            "Ảnh local cần import hoặc chuyển sang đường dẫn /images/...",
          );
        const target = resolveInside(
          path.join(root, "public"),
          location.pathname.slice(1),
        );
        await assertPlainPath(root, target);
        if (!(await existing(target))?.isFile())
          throw new Error("Thiếu file ảnh trong public.");
      } catch (error) {
        errors.push(
          `${entry.metadata.slug}:${image.position.start.line}: ${error.message}`,
        );
      }
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    published: sources.filter((source) => !source.draft).length,
    drafts: sources.filter((source) => source.draft).length,
    locked: sources.filter(
      (source) => !source.draft && source.entry.access === "locked",
    ).length,
  };
}
