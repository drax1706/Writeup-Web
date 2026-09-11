import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "highlight.js/styles/github-dark.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WebSec Vault", template: "%s · WebSec Vault" },
  description: "Blog cá nhân về Web CTF và bảo mật web. Write-up về cách khai thác, nguyên nhân lỗ hổng và hướng khắc phục.",
};
export const viewport: Viewport = { themeColor: "#0b1418" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main-content">Đến nội dung chính</a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
