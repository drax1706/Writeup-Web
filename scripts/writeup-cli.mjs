import { randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { emitKeypressEvents } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { hash } from "bcryptjs";
import { publicWriteupSourceSchema } from "../lib/writeup-source-schema.mjs";
import {
  flagHashEnvForSlug,
  isSafeFlagHashEnv,
  isSafeWriteupSlug,
} from "../lib/writeup-policy.mjs";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const templateBody = `## Tổng quan\n\nMô tả bối cảnh và phạm vi lab được phép kiểm thử.\n\n## Phân tích nguyên nhân\n\nGhi lại quan sát, giả thuyết và bằng chứng.\n\n## Cách khắc phục\n\nGiải thích cách sửa lỗi và kiểm chứng kết quả.\n\n## Bài học rút ra\n\nTóm tắt những điều cần ghi nhớ.\n`;

function assertSlug(slug) {
  if (!isSafeWriteupSlug(slug))
    throw new Error(
      "Slug chỉ dùng chữ thường, số, dấu gạch ngang và tối đa 100 ký tự.",
    );
}

export async function existing(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function assertPlainPath(root, filePath) {
  const relative = path.relative(root, filePath);
  if (
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Đường dẫn nằm ngoài project.");
  }
  let current = root;
  for (const part of ["", ...relative.split(path.sep)]) {
    current = path.join(current, part);
    if ((await existing(current))?.isSymbolicLink())
      throw new Error("Không xử lý đường dẫn symlink.");
  }
}

export async function createWriteup({
  slug,
  title,
  access = "public",
  root = projectRoot,
  metadata: suppliedMetadata = {},
  content = templateBody,
}) {
  assertSlug(slug);
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
    throw new Error("Title phải có từ 1 đến 120 ký tự.");
  }
  if (access !== "public" && access !== "locked")
    throw new Error("Access phải là public hoặc locked.");
  root = path.resolve(root);
  const publicPath = path.join(root, "content", "public", `${slug}.md`);
  const lockedPath = path.join(root, "content", "locked", slug);
  await assertPlainPath(root, publicPath);
  await assertPlainPath(root, lockedPath);
  if ((await existing(publicPath)) || (await existing(lockedPath))) {
    throw new Error(
      "Slug đã tồn tại; không ghi đè bài viết. Hãy chọn slug khác.",
    );
  }
  if (typeof content !== "string")
    throw new Error("Nội dung phải là Markdown.");
  const metadata = publicWriteupSourceSchema.parse({
    platform: "Personal Lab",
    difficulty: "Easy",
    vulnerabilities: ["Access Control"],
    publishedAt: new Date().toISOString().slice(0, 10),
    summary:
      "Bản nháp phân tích lab: hãy cập nhật mô tả và metadata trước khi xuất bản.",
    ...suppliedMetadata,
    title: title.trim(),
    slug,
    draft: true,
  });
  if (access === "public") {
    await mkdir(path.dirname(publicPath), { recursive: true });
    const frontMatter = Object.entries(metadata)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    await writeFile(publicPath, `---\n${frontMatter}\n---\n\n${content}`, {
      flag: "wx",
    });
    return { access, slug, filePath: publicPath };
  }
  const flagHashEnv = flagHashEnvForSlug(slug);
  await mkdir(path.dirname(lockedPath), { recursive: true });
  await mkdir(lockedPath);
  const metadataPath = path.join(lockedPath, "metadata.json");
  let wroteMetadata = false;
  try {
    await writeFile(
      metadataPath,
      `${JSON.stringify({ ...metadata, flagHashEnv }, null, 2)}\n`,
      { flag: "wx" },
    );
    wroteMetadata = true;
    await writeFile(path.join(lockedPath, "writeup.md"), content, {
      flag: "wx",
    });
  } catch (error) {
    if (wroteMetadata) await unlink(metadataPath);
    await rmdir(lockedPath).catch(() => {});
    throw error;
  }
  return { access, slug, filePath: metadataPath, flagHashEnv };
}

function validateFlag(flag) {
  if (
    typeof flag !== "string" ||
    !flag ||
    !flag.isWellFormed() ||
    /[\0\r\n]/.test(flag) ||
    Buffer.byteLength(flag, "utf8") > 72
  ) {
    throw new Error(
      "Flag phải là một dòng UTF-8 hợp lệ, không rỗng và tối đa 72 byte.",
    );
  }
}

// Locate complete assignments, including quoted multiline values, so unrelated
// dotenv formatting/comments and multiline secrets remain byte-for-byte intact.
function assignments(source) {
  const pattern =
    /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(?:"(?:\\.|[^"\\])*"|'[^']*'|`[^`]*`|[^\r\n]*)[^\r\n]*/gm;
  return [...source.matchAll(pattern)].map((match) => ({
    key: match[1],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function setEnvValue(source, key, value) {
  const matches = assignments(source).filter((entry) => entry.key === key);
  if (matches.length > 1)
    throw new Error(
      `Biến ${key} bị khai báo nhiều lần; hãy sửa .env.local trước.`,
    );
  const escapedValue = value.replaceAll("$", "\\$");
  const line = `${key}=${escapedValue}`;
  const match = matches[0];
  if (match)
    return source.slice(0, match.start) + line + source.slice(match.end);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return (
    source + (source && !source.endsWith("\n") ? newline : "") + line + newline
  );
}

export async function configureWriteupFlag({
  slug,
  flag,
  generate = false,
  replace = false,
  root = projectRoot,
}) {
  assertSlug(slug);
  if (generate && flag !== undefined)
    throw new Error("Chỉ chọn một cách cung cấp flag.");
  const generatedFlag = generate
    ? `FLAG{${randomBytes(18).toString("base64url")}}`
    : undefined;
  const value = generatedFlag ?? flag;
  validateFlag(value);
  root = path.resolve(root);
  const metadataPath = path.join(
    root,
    "content",
    "locked",
    slug,
    "metadata.json",
  );
  await assertPlainPath(root, metadataPath);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (
    metadata.slug !== slug ||
    metadata.flagHashEnv === "SESSION_SECRET" ||
    !isSafeFlagHashEnv(metadata.flagHashEnv)
  ) {
    throw new Error(
      "Metadata bài khóa có slug hoặc flagHashEnv không hợp lệ; tên biến phải thuộc nhóm FLAG_HASH và chỉ dùng ở server.",
    );
  }
  const key = metadata.flagHashEnv;
  const envPath = path.join(root, ".env.local");
  await assertPlainPath(root, envPath);
  const stat = await existing(envPath);
  if (stat && !stat.isFile())
    throw new Error(".env.local phải là file thông thường.");
  const lockPath = `${envPath}.lock`;
  const lock = await open(lockPath, "wx", 0o600).catch((error) => {
    if (error.code === "EEXIST")
      throw new Error(
        "Đang có tiến trình cập nhật .env.local; hãy thử lại sau.",
      );
    throw error;
  });
  const temporaryPath = `${envPath}.${randomBytes(8).toString("hex")}.tmp`;
  let wroteTemporary = false;
  try {
    const before = stat ? await readFile(envPath, "utf8") : "";
    const env = parseEnv(before);
    if (env[key] && !replace)
      throw new Error(`Đã có ${key}; dùng --replace khi chủ động đổi flag.`);
    if (
      env.SESSION_SECRET &&
      Buffer.byteLength(env.SESSION_SECRET, "utf8") < 32
    ) {
      throw new Error(
        "SESSION_SECRET hiện tại quá ngắn; hãy sửa cấu hình trước. Chưa thay đổi file.",
      );
    }
    const flagHash = await hash(value, 12);
    let after = setEnvValue(before, key, flagHash);
    if (!env.SESSION_SECRET)
      after = setEnvValue(
        after,
        "SESSION_SECRET",
        randomBytes(48).toString("base64url"),
      );
    if (
      assignments(before).filter((entry) => entry.key === "SESSION_SECRET")
        .length > 1
    ) {
      throw new Error(
        "SESSION_SECRET bị khai báo nhiều lần; hãy sửa .env.local trước.",
      );
    }
    await writeFile(temporaryPath, after, { flag: "wx", mode: 0o600 });
    wroteTemporary = true;
    const current = await existing(envPath);
    if (
      Boolean(current) !== Boolean(stat) ||
      (current && (await readFile(envPath, "utf8")) !== before)
    ) {
      throw new Error(
        ".env.local vừa thay đổi bởi tiến trình khác; chưa ghi đè, hãy chạy lại.",
      );
    }
    await rename(temporaryPath, envPath);
    wroteTemporary = false;
    return { envPath, flagHashEnv: key, generatedFlag };
  } finally {
    if (wroteTemporary) await unlink(temporaryPath);
    await lock.close();
    await unlink(lockPath);
  }
}

export async function readFlagFromStdin(input = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 74) throw new Error("Flag tối đa 72 byte UTF-8.");
    chunks.push(buffer);
  }
  const flag = new TextDecoder("utf8", { fatal: true, ignoreBOM: true })
    .decode(Buffer.concat(chunks))
    .replace(/\r?\n$/, "");
  validateFlag(flag);
  return flag;
}

export function readHiddenFlag() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error(
      "Dùng terminal tương tác, --stdin hoặc --generate để cấp flag. Không truyền flag trên argv.",
    );
  }
  process.stderr.write("Nhập flag (không hiển thị): ");
  const wasRaw = process.stdin.isRaw;
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && (key.name === "c" || key.name === "d"))
        return finish(new Error("Đã hủy nhập flag; chưa thay đổi cấu hình."));
      if (key.name === "return" || key.name === "enter") return finish();
      if (key.name === "backspace")
        value = Array.from(value).slice(0, -1).join("");
      else if (!key.ctrl && !key.meta && text) value += text;
    };
    process.stdin.on("keypress", onKey);
  });
}
