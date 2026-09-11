"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

export function UnlockForm({ slug }: { slug: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const flag = input.current?.value ?? "";
    setError("");
    setSuccess(false);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/writeups/${encodeURIComponent(slug)}/unlock`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            body: JSON.stringify({ flag }),
          },
        );
        const result = await response.json();
        if (!response.ok || result.ok !== true) {
          setError(
            typeof result.error === "string"
              ? result.error
              : "Chưa thể mở bài. Thử lại sau.",
          );
          input.current?.focus();
          return;
        }
        if (input.current) input.current.value = "";
        setSuccess(true);
        router.refresh();
      } catch {
        setError("Không kết nối được với server. Kiểm tra kết nối rồi thử lại.");
        input.current?.focus();
      }
    });
  }

  return (
    <form className="unlock-form" onSubmit={unlock} aria-busy={pending}>
      <label htmlFor="writeup-flag">Flag</label>
      <input
        id="writeup-flag"
        name="flag"
        type="password"
        ref={input}
        required
        maxLength={72}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="Nhập flag…"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "unlock-error unlock-hint" : "unlock-hint"}
        onChange={() => setError("")}
      />
      <p id="unlock-hint" className="unlock-note">
        Dùng flag của challenge trong bài viết này.
      </p>
      <button
        className="button button-primary"
        type="submit"
        disabled={pending || success}
      >
        <Icon name="key" width="16" height="16" />
        {pending
          ? "Đang kiểm tra flag…"
          : success
            ? "Đang mở bài…"
            : "Mở bài"}
      </button>
      {error ? (
        <p
          className="tool-message tool-message-error"
          id="unlock-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <p className="sr-only" role="status">
        {success
          ? "Flag hợp lệ. Đang tải bài viết."
          : pending
            ? "Đang kiểm tra flag."
            : ""}
      </p>
    </form>
  );
}
