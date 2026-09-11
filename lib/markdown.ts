import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import { remark } from "remark";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

import type { Heading } from "@/types/writeup";

export function extractHeadings(markdown: string): Heading[] {
  const tree = remark().use(remarkParse).parse(markdown);
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];

  visit(tree, "heading", (node) => {
    // rehype-slug visits every heading, including levels omitted from the TOC.
    // Match its visible text and advance the same duplicate counter first.
    const headingText = toString(node, {
      includeImageAlt: false,
      includeHtml: false,
    });
    const id = slugger.slug(headingText);
    const text = headingText.trim();

    if ((node.depth !== 2 && node.depth !== 3) || !text) {
      return;
    }

    headings.push({
      depth: node.depth,
      text,
      id,
    });
  });

  return headings;
}
