import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import path from "node:path";

// Parse Markdown rather than matching text inside fenced code blocks.
export function markdownImages(markdown) {
  const tree = remark().use(remarkGfm).parse(markdown);
  const definitions = new Map();
  const targets = new Set();
  visit(tree, "definition", (node) => {
    // CommonMark resolves the first definition; match the renderer exactly.
    if (!definitions.has(node.identifier))
      definitions.set(node.identifier, node);
  });
  visit(tree, (node) => {
    if (node.type === "image") targets.add(node);
    if (node.type === "imageReference") {
      const definition = definitions.get(node.identifier);
      if (definition) targets.add(definition);
    }
  });
  return { tree, images: [...targets] };
}

export function imageLocation(url) {
  if (/^https?:\/\//i.test(url) || url.startsWith("//"))
    return { kind: "remote" };
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || !url || url.startsWith("#")) {
    throw new Error(
      "Ảnh phải dùng HTTPS/HTTP, đường dẫn public hoặc file tương đối.",
    );
  }
  let decoded;
  try {
    decoded = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  } catch {
    throw new Error("Đường dẫn ảnh có URL encoding không hợp lệ.");
  }
  if (!decoded || /[\\\0:]/.test(decoded))
    throw new Error("Đường dẫn ảnh không hợp lệ.");
  return {
    kind: decoded.startsWith("/") ? "public" : "relative",
    pathname: decoded,
  };
}

export function resolveInside(root, relative) {
  const resolved = path.resolve(root, relative);
  const difference = path.relative(root, resolved);
  if (
    !difference ||
    difference === ".." ||
    difference.startsWith(`..${path.sep}`) ||
    path.isAbsolute(difference)
  ) {
    throw new Error("Đường dẫn ảnh phải nằm trong thư mục nguồn.");
  }
  return resolved;
}

export function rewriteImages(markdown, replacements) {
  // Replacing nodes back-to-front preserves all other Markdown byte-for-byte.
  for (const { node, url } of [...replacements].sort(
    (a, b) => b.node.position.start.offset - a.node.position.start.offset,
  )) {
    const title = node.title == null ? "" : ` ${JSON.stringify(node.title)}`;
    const text =
      node.type === "definition"
        ? `[${node.label ?? node.identifier}]: <${url}>${title}`
        : `![${(node.alt ?? "").replace(/[\\[\]]/g, "\\$&")}](${`<${url}>`}${title})`;
    markdown =
      markdown.slice(0, node.position.start.offset) +
      text +
      markdown.slice(node.position.end.offset);
  }
  return markdown;
}
