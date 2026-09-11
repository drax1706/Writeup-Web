"use client";

import { useEffect, useRef, useState } from "react";

type CopyCodeButtonProps = { value: string };
type CopyStatus = "idle" | "copying" | "copied" | "error";

export function CopyCodeButton({ value }: CopyCodeButtonProps) {
  return <ClipboardControl key={value} value={value} />;
}

function ClipboardControl({ value }: CopyCodeButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    return () => {
      attemptRef.current += 1;
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copyCode() {
    const attempt = ++attemptRef.current;
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    setStatus("copying");

    try {
      await navigator.clipboard.writeText(value);
      if (attempt !== attemptRef.current) return;
      setStatus("copied");
    } catch {
      if (attempt !== attemptRef.current) return;
      setStatus("error");
    }

    timeoutRef.current = setTimeout(() => {
      setStatus("idle");
      timeoutRef.current = null;
    }, 5_000);
  }

  return (
    <div className="copy-control">
      <button
        aria-label="Sao chép nội dung"
        className="copy-button"
        disabled={status === "copying"}
        onClick={copyCode}
        type="button"
      >
        {status === "copied"
          ? "Đã sao chép ✓"
          : status === "copying"
            ? "Đang sao chép…"
            : "Sao chép"}
      </button>
      <span
        aria-live="polite"
        className={status === "error" ? "copy-feedback" : "sr-only"}
        role="status"
      >
        {status === "error"
          ? "Không sao chép được. Chọn nội dung rồi sao chép thủ công."
          : status === "copied"
            ? "Đã sao chép vào clipboard."
            : ""}
      </span>
    </div>
  );
}
