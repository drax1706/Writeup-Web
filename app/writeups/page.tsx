import type { Metadata } from "next";
import { Suspense } from "react";

import { WriteupExplorer } from "@/components/WriteupExplorer";
import { getWriteupSummaries } from "@/lib/writeup-catalog.server";

export const metadata: Metadata = {
  title: "Write-ups",
  description:
    "Các write-up về Web CTF, có thể lọc theo nền tảng, độ khó và lỗ hổng.",
};

export default async function WriteupsPage() {
  const writeups = await getWriteupSummaries();

  return (
    <div className="container page-shell">
      <header className="page-heading">
        <p className="eyebrow">WEB CTF</p>
        <h1>Write-ups</h1>
        <p>
          Tìm và lọc write-up theo nền tảng, độ khó hoặc lỗ hổng. Bài có nhãn
          “Cần flag” yêu cầu flag của challenge để đọc.
        </p>
      </header>
      <section aria-label="Danh sách write-up">
        <h2 className="sr-only">Danh sách write-up</h2>
        <Suspense fallback={<p role="status">Đang tải write-up…</p>}>
          <WriteupExplorer writeups={writeups} />
        </Suspense>
      </section>
    </div>
  );
}
