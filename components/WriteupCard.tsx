import Link from "next/link";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { Icon } from "@/components/Icon";
import { formatPublishedDate } from "@/lib/format-date";
import type { WriteupSummary } from "@/types/writeup";

export function WriteupCard({ writeup }: { writeup: WriteupSummary }) {
  return (
    <article className="writeup-card" data-access={writeup.access} aria-labelledby={`writeup-${writeup.slug}`}>
      <div className="card-meta">
        <span className="platform-name">{writeup.platform}</span><span aria-hidden="true">/</span>
        <DifficultyBadge difficulty={writeup.difficulty} />
        {writeup.access === "locked" ? <span className="access-badge access-locked"><Icon name="lock" width="14" height="14" />Cần flag</span> : null}
      </div>
      <h3 id={`writeup-${writeup.slug}`}><Link href={`/writeups/${writeup.slug}`} prefetch={writeup.access === "locked" ? false : undefined}>{writeup.title}<Icon name="arrow" width="21" height="21" /></Link></h3>
      <p>{writeup.summary}</p>
      <div className="card-footer"><div role="group" aria-label="Các lỗ hổng" className="tag-list">{writeup.vulnerabilities.map((topic) => <span className="tag" key={topic}>{topic}</span>)}</div><time dateTime={writeup.publishedAt}>{formatPublishedDate(writeup.publishedAt)}</time></div>
    </article>
  );
}
