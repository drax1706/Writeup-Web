"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { WriteupCard } from "@/components/WriteupCard";
import { filterWriteups } from "@/lib/filter-writeups";
import type { WriteupSummary } from "@/types/writeup";

type WriteupExplorerProps = {
  writeups: WriteupSummary[];
};

export function WriteupExplorer({ writeups }: WriteupExplorerProps) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const platform = searchParams.get("platform") ?? "";
  const difficulty = searchParams.get("difficulty") ?? "";
  const vulnerability = searchParams.get("vulnerability") ?? "";
  const requestedAccess = searchParams.get("access");
  const access =
    requestedAccess === "public" || requestedAccess === "locked"
      ? requestedAccess
      : undefined;
  const hasFilters = Boolean(
    query || platform || difficulty || vulnerability || access,
  );

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    const queryString = params.toString();
    window.history.replaceState(
      null,
      "",
      queryString ? `/writeups?${queryString}` : "/writeups",
    );
  }

  const platforms = useMemo(
    () => [...new Set(writeups.map((writeup) => writeup.platform))].sort(),
    [writeups],
  );
  const difficulties = useMemo(
    () => [...new Set(writeups.map((writeup) => writeup.difficulty))],
    [writeups],
  );
  const vulnerabilities = useMemo(
    () =>
      [
        ...new Set(writeups.flatMap((writeup) => writeup.vulnerabilities)),
      ].sort(),
    [writeups],
  );
  const filteredWriteups = filterWriteups(writeups, {
    query,
    platform,
    difficulty,
    vulnerability,
    access,
  });

  function resetFilters() {
    window.history.replaceState(null, "", "/writeups");
  }

  return (
    <>
      <section aria-label="Tìm kiếm và lọc write-up" className="filters-panel">
        <label className="search-field">
          <span>Tìm kiếm</span>
          <input
            name="q"
            autoComplete="off"
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="SQL injection, XSS…"
            type="search"
            value={query}
          />
        </label>

        <label>
          <span>Nền tảng</span>
          <select
            name="platform"
            onChange={(event) => updateFilter("platform", event.target.value)}
            value={platform}
          >
            <option value="">Tất cả</option>
            {platforms.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Độ khó</span>
          <select
            name="difficulty"
            onChange={(event) => updateFilter("difficulty", event.target.value)}
            value={difficulty}
          >
            <option value="">Tất cả</option>
            {difficulties.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Lỗ hổng</span>
          <select
            name="vulnerability"
            onChange={(event) =>
              updateFilter("vulnerability", event.target.value)
            }
            value={vulnerability}
          >
            <option value="">Tất cả</option>
            {vulnerabilities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Quyền truy cập</span>
          <select
            name="access"
            onChange={(event) => updateFilter("access", event.target.value)}
            value={access ?? ""}
          >
            <option value="">Tất cả</option>
            <option value="public">Công khai</option>
            <option value="locked">Cần flag</option>
          </select>
        </label>
      </section>

      <div className="results-heading">
        <p role="status" aria-live="polite">
          Hiển thị <strong>{filteredWriteups.length}</strong>/{writeups.length}{" "}
          bài
        </p>
        {hasFilters ? (
          <button className="text-button" onClick={resetFilters} type="button">
            Xóa bộ lọc
          </button>
        ) : null}
      </div>

      {filteredWriteups.length > 0 ? (
        <div className="writeup-grid">
          {filteredWriteups.map((writeup) => (
            <WriteupCard key={writeup.slug} writeup={writeup} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>
            {writeups.length === 0
              ? "Chưa có write-up"
              : "Không tìm thấy write-up phù hợp"}
          </h3>
          <p>
            {writeups.length === 0
              ? "Bài mới sẽ được đăng tại đây."
              : "Thử đổi từ khóa hoặc xóa bộ lọc."}
          </p>
        </div>
      )}
    </>
  );
}
