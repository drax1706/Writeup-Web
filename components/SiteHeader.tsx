"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import { Icon } from "@/components/Icon";

type Theme = "dark" | "light";
const themeStorageKey = "websec-editorial-theme:v1";
const themeChangeEvent = "websec-editorial-theme-change";

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerTheme(): Theme {
  return "dark";
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener(themeChangeEvent, onChange);
  return () => window.removeEventListener(themeChangeEvent, onChange);
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f5f7f4" : "#0b1418");
  window.dispatchEvent(new Event(themeChangeEvent));
}

function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);

  useEffect(() => {
    let initial: Theme = "dark";
    try {
      if (window.localStorage.getItem(themeStorageKey) === "light") initial = "light";
    } catch {
      // The preview also works when browser storage is unavailable.
    }
    applyTheme(initial);

    function syncStorage(event: StorageEvent) {
      if (event.key === themeStorageKey || event.key === null) {
        applyTheme(event.newValue === "light" ? "light" : "dark");
      }
    }
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);

  function toggleTheme() {
    const next = getTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      window.localStorage.setItem(themeStorageKey, next);
    } catch {
      // Applying a theme does not depend on persisting the preference.
    }
  }

  return { theme, toggleTheme };
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      className="editorial-theme-toggle"
      onClick={onToggle}
      title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
      type="button"
    >
      <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
      <span>{theme === "dark" ? "Sáng" : "Tối"}</span>
    </button>
  );
}

function ToolsDropdown({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <details className="editorial-tools-menu" name="editorial-header-menu">
      <summary className={pathname.startsWith("/tools/") ? "editorial-nav-link active" : "editorial-nav-link"}>
        Công cụ <Icon className="editorial-icon-chevron" name="chevron" width="14" height="14" />
      </summary>
      <div className="editorial-dropdown">
        <Link href="/tools/encoder" aria-current={pathname === "/tools/encoder" ? "page" : undefined} onClick={onNavigate}>
          <Icon name="code" width="18" height="18" /> Encoder / Decoder
        </Link>
        <Link href="/tools/jwt" aria-current={pathname === "/tools/jwt" ? "page" : undefined} onClick={onNavigate}>
          <Icon name="key" width="18" height="18" /> JWT Analyzer
        </Link>
      </div>
    </details>
  );
}

type EditorialHeaderProps = { pathname: string; access: string; query: string };

function EditorialHeader({ pathname, access, query }: EditorialHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const { theme, toggleTheme } = useTheme();
  const lockedOnly = pathname === "/writeups" && access === "locked";
  const writeupsActive = pathname.startsWith("/writeups") && !lockedOnly;

  function closeMenus() {
    headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
      details.open = false;
    });
  }

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        headerRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
          details.open = false;
        });
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  function handleEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    const details = headerRef.current?.querySelector<HTMLDetailsElement>("details[open]");
    if (!details) return;
    event.preventDefault();
    details.open = false;
    details.querySelector<HTMLElement>("summary")?.focus();
  }

  function openSearch(trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger.closest("details")?.querySelector<HTMLElement>("summary") ?? trigger;
    closeMenus();
    dialogRef.current?.showModal();
    searchRef.current?.focus();
  }

  return (
    <>
      <header className="editorial-header" onKeyDown={handleEscape} ref={headerRef}>
        <div className="editorial-header-inner">
          <Link aria-label="WebSec — Trang chủ" className="editorial-brand" href="/" onClick={closeMenus} translate="no">
            <Icon name="terminal" width="23" height="23" /> WebSec<span aria-hidden="true">.</span>
          </Link>

          <nav aria-label="Điều hướng chính" className="editorial-desktop-nav">
            <Link aria-current={pathname === "/" ? "page" : undefined} className="editorial-nav-link" href="/" onClick={closeMenus}>Tổng quan</Link>
            <Link aria-current={writeupsActive ? "page" : undefined} className="editorial-nav-link" href="/writeups" onClick={closeMenus}>Write-ups</Link>
            <ToolsDropdown pathname={pathname} onNavigate={closeMenus} />
            <Link aria-current={lockedOnly ? "page" : undefined} className="editorial-nav-link" href="/writeups?access=locked" onClick={closeMenus}>Proof of Solve</Link>
            <button className="editorial-search-trigger" onClick={(event) => openSearch(event.currentTarget)} type="button">
              <Icon name="search" width="17" height="17" /> Tìm kiếm
            </button>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </nav>

          <details className="editorial-mobile-menu" name="editorial-header-menu">
            <summary className="editorial-menu-trigger">Menu <Icon className="editorial-icon-chevron" name="chevron" width="16" height="16" /></summary>
            <nav aria-label="Điều hướng chính" className="editorial-mobile-panel">
              <Link aria-current={pathname === "/" ? "page" : undefined} className="editorial-nav-link" href="/" onClick={closeMenus}>Tổng quan</Link>
              <Link aria-current={writeupsActive ? "page" : undefined} className="editorial-nav-link" href="/writeups" onClick={closeMenus}>Write-ups</Link>
              <span className="editorial-tools-label">Công cụ</span>
              <Link aria-current={pathname === "/tools/encoder" ? "page" : undefined} className="editorial-nav-link" href="/tools/encoder" onClick={closeMenus}>Encoder / Decoder</Link>
              <Link aria-current={pathname === "/tools/jwt" ? "page" : undefined} className="editorial-nav-link" href="/tools/jwt" onClick={closeMenus}>JWT Analyzer</Link>
              <Link aria-current={lockedOnly ? "page" : undefined} className="editorial-nav-link" href="/writeups?access=locked" onClick={closeMenus}>Proof of Solve</Link>
              <button className="editorial-search-trigger" onClick={(event) => openSearch(event.currentTarget)} type="button"><Icon name="search" width="17" height="17" /> Tìm kiếm</button>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </nav>
          </details>
        </div>
      </header>

      <dialog
        aria-labelledby="editorial-search-title"
        className="editorial-search-dialog"
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        onClose={() => returnFocusRef.current?.focus()}
        ref={dialogRef}
      >
        <div className="editorial-search-dialog-header">
          <h2 id="editorial-search-title">Tìm write-up</h2>
          <button aria-label="Đóng tìm kiếm" className="editorial-close-button" onClick={() => dialogRef.current?.close()} type="button">Đóng <span aria-hidden="true">×</span></button>
        </div>
        <form action="/writeups" className="editorial-search-form" method="get" role="search">
          <label htmlFor="editorial-search-query">Tiêu đề, chủ đề hoặc nền tảng</label>
          <input autoComplete="off" className="editorial-search-field" defaultValue={query} id="editorial-search-query" key={query} name="q" placeholder="Tìm write-up…" ref={searchRef} type="search" />
          <button className="editorial-search-submit" type="submit">Tìm bài viết <Icon name="arrow" width="17" height="17" /></button>
        </form>
      </dialog>
    </>
  );
}

function HeaderWithSearchParams({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  return <EditorialHeader pathname={pathname} access={searchParams.get("access") ?? ""} query={searchParams.get("q") ?? ""} />;
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <Suspense fallback={<EditorialHeader pathname={pathname} access="" query="" />}>
      <HeaderWithSearchParams pathname={pathname} />
    </Suspense>
  );
}
