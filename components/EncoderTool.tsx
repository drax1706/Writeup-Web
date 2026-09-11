"use client";

import { type FormEvent, useRef, useState } from "react";

import { CopyCodeButton } from "@/components/CopyCodeButton";
import { decodeText, encodeText, type EncodingFormat } from "@/lib/encoding";

const formats: Array<{
  value: EncodingFormat;
  label: string;
  description: string;
}> = [
  {
    value: "url",
    label: "URL",
    description: "Percent encoding cho một thành phần URL.",
  },
  {
    value: "base64",
    label: "Base64",
    description: "Chuyển văn bản UTF-8 sang Base64 có padding.",
  },
  {
    value: "base64url",
    label: "Base64URL",
    description: "Base64 dùng ký tự phù hợp với URL, không có padding.",
  },
  {
    value: "hex",
    label: "Hex",
    description: "Biểu diễn từng byte UTF-8 bằng hệ thập lục phân.",
  },
];

const sampleText = "Xin chào, WebSec! 🔐 /?q=Unicode&lang=vi";
const numberFormatter = new Intl.NumberFormat("vi-VN");

export function EncoderTool() {
  const [format, setFormat] = useState<EncodingFormat>("url");
  const [operation, setOperation] = useState<"encode" | "decode">("encode");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function clearResult() {
    setOutput(null);
    setError("");
  }

  function transform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setOutput(
        operation === "encode"
          ? encodeText(input, format)
          : decodeText(input, format),
      );
      setError("");
    } catch (caughtError) {
      setOutput(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Không thể chuyển đổi. Kiểm tra lại chuỗi đầu vào.",
      );
      inputRef.current?.focus();
    }
  }

  function loadExample() {
    setInput(
      operation === "encode" ? sampleText : encodeText(sampleText, format),
    );
    clearResult();
    inputRef.current?.focus();
  }

  function reverseResult() {
    if (output === null) return;
    setInput(output);
    setOperation(operation === "encode" ? "decode" : "encode");
    clearResult();
    inputRef.current?.focus();
  }

  return (
    <form className="tool-panel" onSubmit={transform}>
      <div className="tool-toolbar">
        <fieldset className="format-picker">
          <legend>Định dạng</legend>
          <div className="format-grid">
            {formats.map((item) => (
              <label
                className={
                  format === item.value
                    ? "format-option active"
                    : "format-option"
                }
                key={item.value}
              >
                <input
                  checked={format === item.value}
                  name="encoding-format"
                  onChange={() => {
                    setFormat(item.value);
                    clearResult();
                  }}
                  type="radio"
                  value={item.value}
                />
                <strong translate="no">{item.label}</strong>
              </label>
            ))}
          </div>
        </fieldset>

        <div
          aria-label="Chế độ chuyển đổi"
          className="operation-switch"
          role="group"
        >
          <button
            aria-pressed={operation === "encode"}
            className={operation === "encode" ? "active" : ""}
            onClick={() => {
              setOperation("encode");
              clearResult();
            }}
            type="button"
          >
            Encode
          </button>
          <button
            aria-pressed={operation === "decode"}
            className={operation === "decode" ? "active" : ""}
            onClick={() => {
              setOperation("decode");
              clearResult();
            }}
            type="button"
          >
            Decode
          </button>
        </div>
      </div>

      <p className="format-caption" id="encoder-format-help">
        {formats.find((item) => item.value === format)?.description}
      </p>

      <div className="encoder-grid">
        <div className="tool-field">
          <div className="tool-input-heading">
            <label htmlFor="encoder-input">Đầu vào</label>
            <span>{numberFormatter.format(input.length)} ký tự UTF-16</span>
          </div>
          <textarea
            aria-describedby={
              error
                ? "encoder-format-help encoder-error"
                : "encoder-format-help"
            }
            aria-invalid={Boolean(error)}
            autoCapitalize="off"
            autoComplete="off"
            id="encoder-input"
            name="encoder-input"
            onChange={(event) => {
              setInput(event.target.value);
              clearResult();
            }}
            placeholder={
              operation === "encode"
                ? "Nhập văn bản cần encode…"
                : `Dán chuỗi ${formats.find((item) => item.value === format)?.label} cần decode…`
            }
            ref={inputRef}
            rows={12}
            spellCheck={false}
            value={input}
          />
          <div className="tool-inline-actions">
            <button
              className="button button-secondary"
              onClick={loadExample}
              type="button"
            >
              Dùng ví dụ Unicode
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setInput("");
                clearResult();
                inputRef.current?.focus();
              }}
              type="button"
            >
              Xóa đầu vào
            </button>
          </div>
        </div>

        <section aria-labelledby="encoder-output-label" className="tool-result">
          <div className="tool-result-heading">
            <span id="encoder-output-label">Đầu ra</span>
            <span>
              {output === null
                ? "Chưa chuyển đổi"
                : `${numberFormatter.format(output.length)} ký tự UTF-16`}
            </span>
          </div>
          <div className="code-frame tool-output encoder-output">
            {output === null ? (
              <div className="tool-output-placeholder">
                <span aria-hidden="true">↳</span>
                <p>Chưa có kết quả</p>
                <small>
                  Nhập dữ liệu, chọn định dạng và bấm{" "}
                  {operation === "encode" ? "Encode" : "Decode"}.
                </small>
              </div>
            ) : (
              <>
                <CopyCodeButton value={output} />
                <pre
                  aria-label="Kết quả chuyển đổi"
                  tabIndex={0}
                  translate="no"
                >
                  {output || "(Chuỗi rỗng)"}
                </pre>
              </>
            )}
          </div>
          <div className="tool-inline-actions">
            <button
              className="button button-secondary"
              disabled={output === null}
              onClick={reverseResult}
              type="button"
            >
              Đảo chiều kết quả <span aria-hidden="true">↔</span>
            </button>
          </div>
        </section>
      </div>

      {error ? (
        <p
          className="tool-message tool-message-error"
          id="encoder-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="tool-actions">
        <button className="button button-primary" type="submit">
          {operation === "encode" ? "Encode dữ liệu" : "Decode dữ liệu"}{" "}
          <span aria-hidden="true">→</span>
        </button>
        <span aria-live="polite" className="tool-status-line" role="status">
          {output !== null
            ? "Đã chuyển đổi. Có thể sao chép hoặc đảo chiều kết quả."
            : "Sẵn sàng chuyển đổi"}
        </span>
      </div>
      <p className="tool-footnote">
        Dữ liệu được xử lý trong trình duyệt, không gửi lên máy chủ và không
        lưu lịch sử.
      </p>
    </form>
  );
}
