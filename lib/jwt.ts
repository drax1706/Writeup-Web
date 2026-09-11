import { decodeBase64Url, EncodingError } from "@/lib/encoding";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JwtObject = { [key: string]: JsonValue };

export type JwtAnalysis = {
  header: JwtObject;
  payload: JwtObject;
  signature: string;
  algorithm: string | null;
  expired: boolean;
  notYetValid: boolean;
  expiresAt: number | null;
  notBefore: number | null;
  warnings: string[];
};

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtError";
  }
}

function decodeJsonPart(value: string, label: "header" | "payload") {
  let decoded: string;

  try {
    decoded = decodeBase64Url(value);
  } catch (error) {
    const detail =
      error instanceof EncodingError ? ` ${error.message}` : "";
    throw new JwtError(`Không thể decode JWT ${label}.${detail}`);
  }

  let parsed: JsonValue;

  try {
    parsed = JSON.parse(decoded) as JsonValue;
  } catch {
    throw new JwtError(`JWT ${label} không phải JSON hợp lệ.`);
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new JwtError(`JWT ${label} phải là JSON object.`);
  }

  return parsed as JwtObject;
}

function readNumericDate(
  payload: JwtObject,
  claim: "exp" | "nbf",
  warnings: string[],
) {
  const value = payload[claim];

  if (value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    warnings.push(`Claim ${claim} không phải NumericDate hợp lệ.`);
    return null;
  }

  return value;
}

export function analyzeJwt(
  token: string,
  nowInSeconds = Math.floor(Date.now() / 1_000),
): JwtAnalysis {
  const compactToken = token.trim();
  const parts = compactToken.split(".");

  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new JwtError("JWT phải có đúng 3 phần: header.payload.signature.");
  }

  if (
    parts.some(
      (part) => !/^[A-Za-z0-9_-]*$/.test(part) || part.length % 4 === 1,
    )
  ) {
    throw new JwtError("Mỗi phần của JWT phải dùng Base64URL, không có padding hoặc khoảng trắng.");
  }

  const header = decodeJsonPart(parts[0], "header");
  const payload = decodeJsonPart(parts[1], "payload");
  const warnings = [
    "JWT đã được decode, chưa được xác minh chữ ký.",
  ];
  const expiresAt = readNumericDate(payload, "exp", warnings);
  const notBefore = readNumericDate(payload, "nbf", warnings);
  const algorithm = typeof header.alg === "string" ? header.alg : null;
  const expired = expiresAt !== null && nowInSeconds >= expiresAt;
  const notYetValid = notBefore !== null && nowInSeconds < notBefore;

  if (expired) {
    warnings.push("Token đã hết hạn theo claim exp.");
  }

  if (notYetValid) {
    warnings.push("Token chưa có hiệu lực theo claim nbf.");
  }

  if (!algorithm) {
    warnings.push("Header không có thuật toán alg hợp lệ.");
  } else if (algorithm.toLowerCase() === "none") {
    warnings.push("Token khai báo alg=none; không được dùng để xác thực.");
  }

  if (!parts[2]) {
    warnings.push("JWT không có dữ liệu chữ ký.");
  }

  return {
    header,
    payload,
    signature: parts[2],
    algorithm,
    expired,
    notYetValid,
    expiresAt,
    notBefore,
    warnings,
  };
}
