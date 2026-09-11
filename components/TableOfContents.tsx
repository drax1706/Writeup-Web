import type { Heading } from "@/types/writeup";

type TableOfContentsProps = { headings: Heading[] };

function HeadingLinks({ headings }: TableOfContentsProps) {
  return (
    <ol className="editorial-toc-list">
      {headings.map((heading) => (
        <li className={heading.depth === 3 ? "editorial-toc-subitem" : undefined} key={heading.id}>
          <a href={`#${heading.id}`}>{heading.text}</a>
        </li>
      ))}
    </ol>
  );
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  if (headings.length === 0) return null;

  return (
    <>
      <nav aria-label="Mục lục bài viết" className="editorial-toc">
        <p className="editorial-toc-title">Mục lục</p>
        <HeadingLinks headings={headings} />
      </nav>
      <details className="editorial-toc-mobile">
        <summary>Mục lục bài viết <span aria-hidden="true">+</span></summary>
        <nav aria-label="Mục lục bài viết">
          <HeadingLinks headings={headings} />
        </nav>
      </details>
    </>
  );
}
