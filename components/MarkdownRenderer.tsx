/* eslint-disable @next/next/no-img-element */
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { CopyCodeButton } from "@/components/CopyCodeButton";

type MarkdownRendererProps = {
  markdown: string;
};

function nodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeToText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeToText(node.props.children);
  }

  return "";
}

export function MarkdownRenderer({ markdown }: MarkdownRendererProps) {
  return (
    <article className="markdown-body">
      <ReactMarkdown
        rehypePlugins={[rehypeSlug, rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a({ children, href }) {
            const external = href?.startsWith("http");

            return (
              <a
                href={href}
                rel={external ? "noreferrer noopener" : undefined}
                target={external ? "_blank" : undefined}
              >
                {children}
              </a>
            );
          },
          img({ alt, src }) {
            return (
              <img alt={alt ?? ""} decoding="async" loading="lazy" src={src} />
            );
          },
          pre({ children }) {
            const code = nodeToText(children).replace(/\n$/, "");

            return (
              <div className="code-frame">
                <CopyCodeButton value={code} />
                <pre role="group" tabIndex={0} aria-label="Khối mã, có thể cuộn ngang">{children}</pre>
              </div>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
