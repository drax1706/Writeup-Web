import type { Metadata } from "next";
import Link from "next/link";

import { EncoderTool } from "@/components/EncoderTool";

export const metadata: Metadata = {
  title: "Encoder / Decoder",
  description:
    "Encode và decode URL, Base64, Base64URL và Hex với UTF-8. Dữ liệu được xử lý trong trình duyệt, không gửi lên máy chủ.",
};

export default function EncoderPage() {
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
          Encoder / Decoder<span className="accent-text">.</span>
        </h1>
        <p>
          Encode và decode URL, Base64, Base64URL và Hex. Hỗ trợ văn bản
          Unicode UTF-8.
        </p>
      </header>
      <nav aria-label="Công cụ Web CTF" className="tool-tabs">
        <Link aria-current="page" className="active" href="/tools/encoder">
          Encoder / Decoder
        </Link>
        <Link href="/tools/jwt">JWT Analyzer</Link>
      </nav>
      <EncoderTool />
    </div>
  );
}
