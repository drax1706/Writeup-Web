"use client";

import { type FormEvent, useRef, useState } from "react";

import { CopyCodeButton } from "@/components/CopyCodeButton";
import { encodeBase64Url } from "@/lib/encoding";
import { analyzeJwt, type JwtAnalysis } from "@/lib/jwt";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "long",
  timeZone: "UTC",
});
const numberFormatter = new Intl.NumberFormat("vi-VN");

function formatNumericDate(value: number | null) {
  if (value === null) return "Không có";
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime())
    ? "Ngày ngoài phạm vi hỗ trợ"
    : dateFormatter.format(date);
}

function Timestamp({ value }: { value: number | null }) {
  return (
    <small className="jwt-claim-note">
      {value === null ? "Claim không có hoặc không hợp lệ" : `Unix: ${value}`}
    </small>
  );
}

export function JwtAnalyzer() {
  const [token, setToken] = useState("");
  const [analysis, setAnalysis] = useState<JwtAnalysis | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function changeToken(value: string) {
    setToken(value);
    setAnalysis(null);
    setError("");
  }

  function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setAnalysis(analyzeJwt(token));
      setError("");
    } catch (caughtError) {
      setAnalysis(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Không thể phân tích JWT. Kiểm tra lại cấu trúc token.",
      );
      inputRef.current?.focus();
    }
  }

  function loadExample() {
    const header = encodeBase64Url(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    );
    const payload = encodeBase64Url(
      JSON.stringify({
        sub: "websec-demo",
        name: "Nguyễn An",
        iat: 1700000000,
        nbf: 1700000000,
        exp: 1700003600,
      }),
    );
    changeToken(`${header}.${payload}.${encodeBase64Url("demo-signature")}`);
    inputRef.current?.focus();
  }

  const headerJson = analysis ? JSON.stringify(analysis.header, null, 2) : "";
  const payloadJson = analysis ? JSON.stringify(analysis.payload, null, 2) : "";
  const issuedAtClaim = analysis?.payload.iat;
  const issuedAt =
    typeof issuedAtClaim === "number" && Number.isFinite(issuedAtClaim)
      ? issuedAtClaim
      : null;

  return (
    <form className="tool-panel" onSubmit={analyze}>
      <div className="security-notice" role="note">
        <strong>Decoded ≠ verified</strong>
        <p>
          Công cụ chỉ decode JWT, không xác minh chữ ký. Claims và thuật toán
          là thông tin do bên tạo token khai báo.
        </p>
      </div>

      <div className="tool-field">
        <div className="tool-input-heading">
          <label htmlFor="jwt-input">JSON Web Token</label>
          <span>{numberFormatter.format(token.length)} ký tự</span>
        </div>
        <textarea
          aria-describedby={
            error ? "jwt-input-help jwt-error" : "jwt-input-help"
          }
          aria-invalid={Boolean(error)}
          autoCapitalize="off"
          autoComplete="off"
          id="jwt-input"
          name="jwt-token"
          onChange={(event) => changeToken(event.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vIn0.signature…"
          ref={inputRef}
          rows={6}
          spellCheck={false}
          value={token}
        />
        <p className="tool-footnote" id="jwt-input-help">
          Dán JWT có 3 phần, ngăn cách bằng dấu chấm. JWT mẫu đã hết hạn và
          dùng chữ ký minh họa.
        </p>
      </div>

      {error ? (
        <p
          className="tool-message tool-message-error"
          id="jwt-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="tool-actions">
        <button className="button button-primary" type="submit">
          Phân tích JWT <span aria-hidden="true">→</span>
        </button>
        <button
          className="button button-secondary"
          onClick={loadExample}
          type="button"
        >
          Dùng JWT mẫu
        </button>
        <button
          className="button button-secondary"
          onClick={() => {
            changeToken("");
            inputRef.current?.focus();
          }}
          type="button"
        >
          Xóa token
        </button>
      </div>
      <p aria-live="polite" className="tool-status-line" role="status">
        {analysis
          ? `Đã đọc JWT. Có ${analysis.warnings.length} lưu ý cần kiểm tra.`
          : "Token chỉ được xử lý trong trình duyệt, không lưu lịch sử."}
      </p>

      {analysis ? (
        <section aria-label="Kết quả phân tích JWT" className="jwt-results">
          <div className="jwt-summary">
            <article>
              <span>Thuật toán · alg</span>
              <strong translate="no">
                {analysis.algorithm ?? "Không xác định"}
              </strong>
              <small className="jwt-claim-note">
                Chữ ký chưa được xác minh
              </small>
            </article>
            <article>
              <span>Hết hạn · exp</span>
              <strong className={analysis.expired ? "status-danger" : ""}>
                {formatNumericDate(analysis.expiresAt)}
              </strong>
              <Timestamp value={analysis.expiresAt} />
              {analysis.expired ? (
                <small className="status-danger">Đã hết hạn</small>
              ) : null}
            </article>
            <article>
              <span>Có hiệu lực từ · nbf</span>
              <strong className={analysis.notYetValid ? "status-warning" : ""}>
                {formatNumericDate(analysis.notBefore)}
              </strong>
              <Timestamp value={analysis.notBefore} />
              {analysis.notYetValid ? (
                <small className="status-warning">
                  Chưa có hiệu lực
                </small>
              ) : null}
            </article>
            <article>
              <span>Phát hành · iat</span>
              <strong>{formatNumericDate(issuedAt)}</strong>
              <Timestamp value={issuedAt} />
            </article>
          </div>
          <p className="tool-footnote">
            Thời gian hiển thị theo UTC. exp và nbf được kiểm tra tại
            thời điểm bấm phân tích.
          </p>

          <div className="jwt-json-grid">
            <article>
              <div className="tool-result-heading">
                <h2>01 / Header</h2>
                <span>JSON</span>
              </div>
              <div className="code-frame tool-output">
                <CopyCodeButton value={headerJson} />
                <pre aria-label="JWT header" tabIndex={0} translate="no">
                  {headerJson}
                </pre>
              </div>
            </article>
            <article>
              <div className="tool-result-heading">
                <h2>02 / Payload</h2>
                <span>JSON</span>
              </div>
              <div className="code-frame tool-output">
                <CopyCodeButton value={payloadJson} />
                <pre aria-label="JWT payload" tabIndex={0} translate="no">
                  {payloadJson}
                </pre>
              </div>
            </article>
          </div>

          <article className="jwt-signature">
            <div className="tool-result-heading">
              <h2>03 / Signature</h2>
              <span>
                Base64URL · {numberFormatter.format(analysis.signature.length)}{" "}
                ký tự
              </span>
            </div>
            <div className="code-frame tool-output">
              {analysis.signature ? (
                <CopyCodeButton value={analysis.signature} />
              ) : null}
              <pre
                aria-label="JWT signature, chưa xác minh"
                tabIndex={0}
                translate="no"
              >
                {analysis.signature || "(Token không chứa chữ ký)"}
              </pre>
            </div>
            <p className="tool-footnote">
              Chữ ký được giữ ở dạng Base64URL và chưa được xác minh.
            </p>
          </article>

          <div className="jwt-warnings">
            <h2>Lưu ý khi đọc token</h2>
            <ul>
              {analysis.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <div role="group" aria-label="Cấu trúc JWT" className="jwt-empty">
          <article>
            <span>01 / Header</span>
            <p>Thuật toán và loại token</p>
          </article>
          <article>
            <span>02 / Payload</span>
            <p>Claims và mốc thời gian</p>
          </article>
          <article>
            <span>03 / Signature</span>
            <p>Chữ ký dạng Base64URL</p>
          </article>
        </div>
      )}
    </form>
  );
}
