import { describe, expect, it } from "vitest";

import {
  decodeText,
  encodeText,
  type EncodingFormat,
} from "@/lib/encoding";

describe("encoding utilities", () => {
  it.each<EncodingFormat>(["url", "base64", "base64url", "hex"])(
    "round-trips Unicode with %s",
    (format) => {
      const source = "Xin chào 👋 — Web CTF";

      expect(decodeText(encodeText(source, format), format)).toBe(source);
    },
  );

  it("creates unpadded URL-safe Base64", () => {
    const encoded = encodeText("subjects? 🦊", "base64url");

    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeText(encoded, "base64url")).toBe("subjects? 🦊");
  });

  it.each<EncodingFormat>(["url", "base64", "base64url", "hex"])(
    "preserves a leading Unicode byte-order mark with %s",
    (format) => {
      const source = "\uFEFFXin chào";

      expect(decodeText(encodeText(source, format), format)).toBe(source);
    },
  );

  it.each([
    ["%E0%A4%A", "url"],
    ["%%%", "base64"],
    ["abcde", "base64url"],
    ["123", "hex"],
    ["zz", "hex"],
    ["ff", "hex"],
  ] as const)("rejects malformed %s input", (value, format) => {
    expect(() => decodeText(value, format)).toThrow();
  });

  it.each<EncodingFormat>(["url", "base64", "base64url", "hex"])(
    "rejects incomplete Unicode when encoding as %s",
    (format) => {
      expect(() => encodeText("\uD800", format)).toThrow(
        "Unicode không hoàn chỉnh",
      );
    },
  );
});
