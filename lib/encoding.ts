export type EncodingFormat = "url" | "base64" | "base64url" | "hex";

export class EncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncodingError";
  }
}

const textEncoder = new TextEncoder();

function assertValidUnicode(value: string) {
  try {
    encodeURIComponent(value);
  } catch {
    throw new EncodingError("Dữ liệu chứa chuỗi Unicode không hoàn chỉnh.");
  }
}

function bytesToBinary(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return binary;
}

function binaryToBytes(binary: string) {
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new EncodingError("Dữ liệu không phải chuỗi UTF-8 hợp lệ.");
  }
}

function normalizeBase64(value: string, urlSafe: boolean) {
  const compact = value.replace(/\s/g, "");
  const alphabet = urlSafe
    ? /^[A-Za-z0-9_-]*={0,2}$/
    : /^[A-Za-z0-9+/]*={0,2}$/;

  if (!alphabet.test(compact)) {
    throw new EncodingError(
      urlSafe
        ? "Base64URL chứa ký tự không hợp lệ."
        : "Base64 chứa ký tự không hợp lệ.",
    );
  }

  const firstPadding = compact.indexOf("=");
  const unpadded = firstPadding === -1 ? compact : compact.slice(0, firstPadding);
  const suppliedPadding = compact.length - unpadded.length;

  if (unpadded.length % 4 === 1) {
    throw new EncodingError("Độ dài Base64 không hợp lệ.");
  }

  const requiredPadding = (4 - (unpadded.length % 4)) % 4;

  if (suppliedPadding > 0 && suppliedPadding !== requiredPadding) {
    throw new EncodingError("Padding Base64 không hợp lệ.");
  }

  const standard = urlSafe
    ? unpadded.replace(/-/g, "+").replace(/_/g, "/")
    : unpadded;

  return standard + "=".repeat(requiredPadding);
}

export function encodeBase64(value: string) {
  assertValidUnicode(value);
  return btoa(bytesToBinary(textEncoder.encode(value)));
}

export function decodeBase64(value: string) {
  const normalized = normalizeBase64(value, false);

  try {
    return decodeUtf8(binaryToBytes(atob(normalized)));
  } catch (error) {
    if (error instanceof EncodingError) {
      throw error;
    }

    throw new EncodingError("Base64 không hợp lệ.");
  }
}

export function encodeBase64Url(value: string) {
  return encodeBase64(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeBase64Url(value: string) {
  const normalized = normalizeBase64(value, true);

  try {
    return decodeUtf8(binaryToBytes(atob(normalized)));
  } catch (error) {
    if (error instanceof EncodingError) {
      throw error;
    }

    throw new EncodingError("Base64URL không hợp lệ.");
  }
}

export function encodeHex(value: string) {
  assertValidUnicode(value);
  return Array.from(textEncoder.encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function decodeHex(value: string) {
  const compact = value.replace(/\s/g, "");

  if (compact.length % 2 !== 0) {
    throw new EncodingError("Hex phải có số ký tự chẵn.");
  }

  if (!/^[0-9a-fA-F]*$/.test(compact)) {
    throw new EncodingError("Hex chỉ chứa ký tự 0-9 và a-f.");
  }

  const bytes = new Uint8Array(compact.length / 2);

  for (let index = 0; index < compact.length; index += 2) {
    bytes[index / 2] = Number.parseInt(compact.slice(index, index + 2), 16);
  }

  return decodeUtf8(bytes);
}

export function encodeText(value: string, format: EncodingFormat) {
  switch (format) {
    case "url":
      try {
        return encodeURIComponent(value);
      } catch {
        throw new EncodingError("Dữ liệu chứa chuỗi Unicode không hoàn chỉnh.");
      }
    case "base64":
      return encodeBase64(value);
    case "base64url":
      return encodeBase64Url(value);
    case "hex":
      return encodeHex(value);
  }
}

export function decodeText(value: string, format: EncodingFormat) {
  switch (format) {
    case "url":
      try {
        return decodeURIComponent(value);
      } catch {
        throw new EncodingError("URL encoding không hợp lệ.");
      }
    case "base64":
      return decodeBase64(value);
    case "base64url":
      return decodeBase64Url(value);
    case "hex":
      return decodeHex(value);
  }
}
