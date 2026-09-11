import {
  lstat,
  mkdir,
  readFile,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { toString } from "mdast-util-to-string";
import { writeupMetadataSchema } from "../lib/writeup-source-schema.mjs";
import { isSafeWriteupSlug } from "../lib/writeup-policy.mjs";
import {
  assertPlainPath,
  createWriteup,
  existing,
  projectRoot,
} from "./writeup-cli.mjs";
import {
  imageLocation,
  markdownImages,
  resolveInside,
  rewriteImages,
} from "./markdown-images.mjs";

const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
]);

export async function importWriteup({
  file,
  slug,
  title,
  access = "public",
  root = projectRoot,
}) {
  if (typeof file !== "string" || !file)
    throw new Error("Cần --file trỏ tới file Markdown đã export.");
  if (access !== "public" && access !== "locked")
    throw new Error("Access phải là public hoặc locked.");
  root = path.resolve(root);
  const sourcePath = path.resolve(file);
  const sourceRoot = path.dirname(sourcePath);
  await assertPlainPath(sourceRoot, sourcePath);
  const info = await lstat(sourcePath);
  if (
    !info.isFile() ||
    !/\.md$/i.test(sourcePath) ||
    info.size > 2 * 1024 * 1024
  ) {
    throw new Error("Nguồn phải là file .md thông thường, tối đa 2 MiB.");
  }
  const source = new TextDecoder("utf-8", { fatal: true }).decode(
    await readFile(sourcePath),
  );
  const { data, content } = matter(source);
  const { tree, images } = markdownImages(content);
  slug ??= data.slug;
  if (!isSafeWriteupSlug(slug))
    throw new Error("Cần --slug hợp lệ hoặc trường slug trong front matter.");
  const heading = tree.children.find(
    (node) => node.type === "heading" && node.depth === 1,
  );
  title ??= data.title ?? (heading ? toString(heading) : undefined);
  if (typeof title !== "string" || !title.trim())
    throw new Error(
      "Cần --title, title trong front matter hoặc heading # đầu tiên.",
    );
  // Only known public fields are copied. Never infer summary from a protected body.
  const metadata = writeupMetadataSchema.parse({
    title,
    slug,
    platform: data.platform ?? "Personal Lab",
    difficulty: data.difficulty ?? "Easy",
    vulnerabilities: data.vulnerabilities ?? ["Access Control"],
    publishedAt:
      data.publishedAt instanceof Date
        ? data.publishedAt.toISOString().slice(0, 10)
        : (data.publishedAt ?? new Date().toISOString().slice(0, 10)),
    summary:
      data.summary ??
      "Bản nháp mới nhập: hãy cập nhật mô tả và metadata trước khi xuất bản.",
  });
  const publicPath = path.join(root, "content", "public", `${slug}.md`);
  const lockedPath = path.join(root, "content", "locked", slug);
  await assertPlainPath(root, publicPath);
  await assertPlainPath(root, lockedPath);
  if ((await existing(publicPath)) || (await existing(lockedPath)))
    throw new Error("Slug đã tồn tại; không ghi đè bài viết.");

  const assetDirectory = path.join(root, "public", "images", slug);
  const assets = new Map();
  const replacements = [];
  for (const node of images) {
    const location = imageLocation(node.url);
    if (location.kind === "remote") continue; // Offline importer never downloads URLs.
    if (location.kind === "public") {
      const target = resolveInside(
        path.join(root, "public"),
        location.pathname.slice(1),
      );
      await assertPlainPath(root, target);
      if (!(await existing(target))?.isFile())
        throw new Error("Ảnh public được tham chiếu chưa tồn tại.");
      continue;
    }
    if (access === "locked")
      throw new Error(
        "Bài khóa có ảnh local: không tự chép ảnh lời giải vào public. Dùng ảnh minh họa công khai hoặc private storage trước khi import.",
      );
    const assetPath = resolveInside(sourceRoot, location.pathname);
    await assertPlainPath(sourceRoot, assetPath);
    const extension = path.extname(assetPath).toLowerCase();
    if (!imageExtensions.has(extension))
      throw new Error(
        "Ảnh local hỗ trợ PNG, JPG, GIF, WebP, AVIF. Chuyển SVG/HTML sang ảnh trước khi import.",
      );
    const assetInfo = await existing(assetPath);
    if (!assetInfo?.isFile() || assetInfo.size > 10 * 1024 * 1024)
      throw new Error("Ảnh local bị thiếu hoặc vượt quá 10 MiB.");
    let asset = assets.get(assetPath);
    if (!asset) {
      const name = `image-${assets.size + 1}${extension}`;
      asset = { name, bytes: await readFile(assetPath) };
      assets.set(assetPath, asset);
    }
    replacements.push({ node, url: `/images/${slug}/${asset.name}` });
  }

  // Finish all validation before writing. Roll back only files created by this import.
  const writtenAssets = [];
  let createdAssetDirectory = false;
  try {
    if (assets.size) {
      await assertPlainPath(root, assetDirectory);
      if (await existing(assetDirectory))
        throw new Error("Thư mục ảnh của slug đã tồn tại; không ghi đè ảnh.");
      await mkdir(path.dirname(assetDirectory), { recursive: true });
      await mkdir(assetDirectory);
      createdAssetDirectory = true;
      for (const asset of assets.values()) {
        const target = path.join(assetDirectory, asset.name);
        await writeFile(target, asset.bytes, { flag: "wx" });
        writtenAssets.push(target);
      }
    }
    const result = await createWriteup({
      root,
      slug,
      title,
      access,
      metadata,
      content: rewriteImages(content, replacements),
    });
    return { ...result, imagesCopied: assets.size };
  } catch (error) {
    for (const filePath of writtenAssets) await unlink(filePath);
    if (createdAssetDirectory) await rmdir(assetDirectory);
    throw error;
  }
}
