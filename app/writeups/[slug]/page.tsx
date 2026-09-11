import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { UnlockForm } from "@/components/UnlockForm";
import { Icon } from "@/components/Icon";
import { getLockedWriteupBySlug } from "@/lib/locked-content.server";
import { getWriteupEntryBySlug } from "@/lib/writeup-catalog.server";
import {
  getUnlockCookieName,
  UNLOCK_SESSION_TTL_SECONDS,
} from "@/lib/unlock-session.server";

import { DifficultyBadge } from "@/components/DifficultyBadge";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { TableOfContents } from "@/components/TableOfContents";
import { getPublicWriteupBySlug } from "@/lib/content.server";
import { formatPublishedDate } from "@/lib/format-date";

type WriteupPageProps = {
  params: Promise<{ slug: string }>;
};

// Every read checks the current session. Authorized HTML/RSC must never be static.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: WriteupPageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getWriteupEntryBySlug(slug);
  if (!entry) {
    return { title: "Không tìm thấy write-up" };
  }

  return {
    title: entry.metadata.title,
    description: entry.metadata.summary,
    ...(entry.access === "locked"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function WriteupPage({ params }: WriteupPageProps) {
  const { slug } = await params;
  const entry = await getWriteupEntryBySlug(slug);
  if (!entry) notFound();

  const locked = entry.access === "locked";
  const writeup = locked
    ? await getLockedWriteupBySlug(
        slug,
        (await cookies()).get(getUnlockCookieName(slug))?.value,
      )
    : await getPublicWriteupBySlug(slug);

  if (!writeup && !locked) {
    notFound();
  }

  const metadata = entry.metadata;

  return (
    <div className="container article-shell">
      <Link className="back-link" href="/writeups">
        ← Tất cả write-up
      </Link>

      <header className="article-header">
        <div className="article-meta">
          <span>{metadata.platform}</span>
          <DifficultyBadge difficulty={metadata.difficulty} />
          <span className={`access-badge access-${entry.access}`}>
            <Icon name={locked ? "lock" : "book"} width="12" height="12" />
            {locked ? "Cần flag" : "Công khai"}
          </span>
          <time dateTime={metadata.publishedAt}>
            {formatPublishedDate(metadata.publishedAt)}
          </time>
        </div>
        <h1>{metadata.title}</h1>
        <p>{metadata.summary}</p>
        <div className="tag-list">
          {metadata.vulnerabilities.map((vulnerability) => (
            <span className="tag" key={vulnerability}>
              {vulnerability}
            </span>
          ))}
        </div>
      </header>

      {locked && !writeup ? (
        <section className="unlock-panel" aria-labelledby="unlock-title">
          <div>
            <span className="stat-icon amber">
              <Icon name="lock" />
            </span>
            <h2 id="unlock-title">Mở bài bằng flag</h2>
            <p>
              Nhập flag của challenge để đọc write-up.
            </p>
            <div className="unlock-info">
              <Icon name="shield" width="15" height="15" />
              <span>
                Bài viết được mở trong{" "}
                {UNLOCK_SESSION_TTL_SECONDS / 60} phút trên trình duyệt này.
              </span>
            </div>
          </div>
          <UnlockForm key={slug} slug={slug} />
        </section>
      ) : null}
      {locked && writeup ? (
        <div className="unlocked-status" role="status">
          <Icon name="check" width="17" height="17" />
          Flag hợp lệ. Bạn có thể đọc bài trong phiên hiện tại.
        </div>
      ) : null}
      {writeup ? (
        <div className="article-layout">
          <div>
            <MarkdownRenderer markdown={writeup.content} />
          </div>
          <aside>
            <TableOfContents headings={writeup.headings} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
