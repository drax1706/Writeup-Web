import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="editorial-footer">
      <div className="editorial-footer-inner">
        <p><span className="editorial-footer-brand" translate="no">WebSec.</span> Blog cá nhân về Web CTF.</p>
        <nav aria-label="Liên kết cuối trang" className="editorial-footer-links">
          <Link href="/writeups">Write-ups</Link>
          <Link href="/tools/encoder">Công cụ</Link>
          <Link href="/writeups?access=locked">Proof of Solve</Link>
        </nav>
      </div>
    </footer>
  );
}
