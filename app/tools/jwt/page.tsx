import type { Metadata } from "next";
import Link from "next/link";

import { JwtAnalyzer } from "@/components/JwtAnalyzer";

export const metadata: Metadata = {
  title: "JWT Analyzer",
  description:
    "Đọc header, payload và thời hạn của JWT trong trình duyệt. Không xác minh chữ ký hoặc gửi token lên máy chủ.",
};

export default function JwtPage() {
  return (
    <div className="container page-shell tool-page">
      <header className="page-heading">
        <div className="tool-intro-meta">
          <p className="eyebrow">CÔNG CỤ WEB CTF</p>
          <span className="local-badge">
            <span aria-hidden="true">●</span> Xử lý trong trình duyệt
          </span>
        </div>
        <h1>
          JWT Analyzer<span className="accent-text">.</span>
        </h1>
        <p>
          Đọc header, payload và các mốc thời gian của JWT. Công cụ không
          xác minh chữ ký.
        </p>
      </header>
      <nav aria-label="Công cụ Web CTF" className="tool-tabs">
        <Link href="/tools/encoder">Encoder / Decoder</Link>
        <Link aria-current="page" className="active" href="/tools/jwt">
          JWT Analyzer
        </Link>
      </nav>
      <JwtAnalyzer />
    </div>
  );
}
