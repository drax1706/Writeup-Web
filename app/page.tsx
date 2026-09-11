import Link from "next/link";
import { Icon } from "@/components/Icon";
import { WriteupCard } from "@/components/WriteupCard";
import { getWriteupSummaries } from "@/lib/writeup-catalog.server";
import { profileLinks } from "@/lib/profile.server";

const tools = [
  { href: "/tools/encoder", title: "Encoder / Decoder", description: "URL, Base64, Base64URL & Hex", icon: "code" },
  { href: "/tools/jwt", title: "JWT Analyzer", description: "Đọc header, payload và claims", icon: "key" },
] as const;

export default async function HomePage() {
  const writeups = await getWriteupSummaries();
  const latest = writeups[0];
  const locked = writeups.filter((writeup) => writeup.access === "locked");
  const topics = new Set(writeups.flatMap((writeup) => writeup.vulnerabilities)).size;
  const github = profileLinks.find((link) => link.label === "GitHub");

  return (
    <div className="container editorial-home">
      <section className="editorial-hero" aria-labelledby="hero-title">
        <div className="editorial-hero-copy">
          <p className="eyebrow"><span className="status-dot" /> WEB CTF · GHI CHÉP CÁ NHÂN</p>
          <h1 id="hero-title">Web CTF &amp;<br /><span>Security Notes</span></h1>
          <p className="editorial-hero-lead">Một góc nhỏ để mình ghi lại quá trình học <strong>An toàn thông tin.</strong></p>
          <p className="editorial-hero-description">Ở đây chủ yếu là các bài Web CTF mình đã làm, cách mình suy nghĩ khi gặp bài, những chỗ từng mắc và kiến thức rút ra sau khi giải xong.</p>
          <div className="editorial-hero-actions">
            <Link className="button button-primary" href={latest ? `/writeups/${latest.slug}` : "/writeups"} prefetch={latest?.access === "locked" ? false : undefined}>
              {latest ? "Xem bài mới nhất" : "Xem write-up"}<Icon name="arrow" width="18" height="18" />
            </Link>
            {github ? <a className="button button-secondary" href={github.href} rel="noopener noreferrer" target="_blank">GitHub<Icon name="external" width="17" height="17" /></a>
              : <button className="button button-secondary" type="button" disabled title="Chưa có liên kết GitHub">GitHub<Icon name="external" width="17" height="17" /></button>}
          </div>
        </div>
        <div className="editorial-research" role="group" aria-label="Ghi chú phân tích Web CTF">
          <div className="editorial-research-heading"><span><Icon name="code" width="18" height="18" />research-notes.md</span><span className="editorial-file-type">Markdown</span></div>
          <div className="editorial-research-code" translate="no">
            <p><span className="line-number">01</span><span className="research-comment"># Web CTF notes</span></p>
            <p><span className="line-number">02</span><span>&nbsp;</span></p>
            <p><span className="line-number">03</span><span><b>observe</b>(request, response)</span></p>
            <p><span className="line-number">04</span><span><b>question</b>(the_assumptions)</span></p>
            <p><span className="line-number">05</span><span><b>trace</b>(input → impact)</span></p>
            <p><span className="line-number">06</span><span><b>fix</b>(the_root_cause)</span></p>
            <p><span className="line-number">07</span><span>&nbsp;</span></p>
            <p><span className="line-number">08</span><span className="research-comment">payload · root cause · fix</span></p>
          </div>
          <div className="editorial-research-footer"><span><span className="status-dot" /> Ghi chú Web CTF</span><span>UTF-8</span></div>
        </div>
      </section>

      <dl className="editorial-stats" aria-label="Thống kê thư viện">
        <div><dt>{writeups.length.toString().padStart(2, "0")}</dt><dd>Bài phân tích</dd></div>
        <div><dt>{tools.length.toString().padStart(2, "0")}</dt><dd>Công cụ</dd></div>
        <div><dt>{topics.toString().padStart(2, "0")}</dt><dd>Chủ đề bảo mật</dd></div>
      </dl>

      <div className="editorial-columns">
        <section aria-labelledby="recent-title">
          <div className="section-heading"><h2 id="recent-title">Write-up mới nhất</h2><Link className="arrow-link" href="/writeups">Xem tất cả<Icon name="arrow" width="17" height="17" /></Link></div>
          <div className="writeup-list">
            {writeups.slice(0, 3).map((writeup) => <WriteupCard key={writeup.slug} writeup={writeup} />)}
            {!writeups.length ? <div className="empty-state"><h3>Chưa có write-up</h3><p>Bài đã đăng sẽ xuất hiện ở đây.</p></div> : null}
          </div>
        </section>
        <aside className="editorial-related" aria-label="Công cụ và thực hành">
          <section className="editorial-tools" aria-labelledby="tools-title">
            <div className="section-heading"><h2 id="tools-title">Bộ công cụ</h2><Icon name="code" width="22" height="22" /></div>
            <div className="tool-links">{tools.map((tool) => <Link className="tool-link" key={tool.href} href={tool.href}><span className="tool-icon"><Icon name={tool.icon} width="21" height="21" /></span><span><strong>{tool.title}</strong><small>{tool.description}</small></span><Icon name="arrow" width="17" height="17" /></Link>)}</div>
            <p className="local-note"><Icon name="shield" width="17" height="17" />Dữ liệu được xử lý trong trình duyệt.</p>
          </section>
          <section className="proof-card" aria-labelledby="proof-title">
            <div className="proof-top"><span className="access-badge access-locked"><Icon name="lock" width="15" height="15" />Cần flag</span><span className="proof-count">{locked.length} bài viết</span></div>
            <h2 id="proof-title">Proof of Solve</h2>
            <p>Một số write-up cần flag để đọc.<br />Nhập flag của challenge để mở bài tương ứng.</p>
            <Link className="button button-secondary" href="/writeups?access=locked">Xem bài cần flag<Icon name="arrow" width="17" height="17" /></Link>
          </section>
          <p className="editorial-aside-note">Write-up gồm:<br />Cách khai thác, nguyên nhân<br /><span>và hướng khắc phục.</span></p>
        </aside>
      </div>
    </div>
  );
}
