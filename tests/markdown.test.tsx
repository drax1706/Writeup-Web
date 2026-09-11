import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { extractHeadings } from "@/lib/markdown";

describe("Markdown rendering", () => {
  it("drops raw HTML and unsafe URL protocols", () => {
    const maliciousMarkdown = `
<script>alert('xss')</script>
<img src=x onerror="alert('xss')">
[unsafe](javascript:alert('xss'))

Normal text.
`;
    const html = renderToStaticMarkup(
      <MarkdownRenderer markdown={maliciousMarkdown} />,
    );

    expect(html).toContain("Normal text.");
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
  });

  it("uses the same GitHub-style IDs for duplicate headings", () => {
    expect(extractHeadings("## Demo\n\n## Demo\n\n### Result")).toEqual([
      { depth: 2, text: "Demo", id: "demo" },
      { depth: 2, text: "Demo", id: "demo-1" },
      { depth: 3, text: "Result", id: "result" },
    ]);
  });

  it("keeps TOC anchors aligned when omitted heading levels share a title", () => {
    const markdown = "# Demo\n\n## Demo\n\n#### Demo\n\n### Demo";
    const headings = extractHeadings(markdown);
    const html = renderToStaticMarkup(<MarkdownRenderer markdown={markdown} />);

    expect(headings).toEqual([
      { depth: 2, text: "Demo", id: "demo-1" },
      { depth: 3, text: "Demo", id: "demo-3" },
    ]);
    for (const heading of headings) {
      expect(html).toContain(`<h${heading.depth} id="${heading.id}">`);
    }
  });

  it("uses rendered text for anchors containing inline HTML and images", () => {
    const markdown = "## <span>Demo</span> ![icon](/images/icon.svg)";
    const [heading] = extractHeadings(markdown);
    const html = renderToStaticMarkup(<MarkdownRenderer markdown={markdown} />);

    expect(heading).toEqual({ depth: 2, text: "Demo", id: "demo-" });
    expect(html).toContain(`<h2 id="${heading.id}">`);
  });
});
