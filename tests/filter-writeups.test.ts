import { describe, expect, it } from "vitest";

import { filterWriteups } from "@/lib/filter-writeups";
import type { WriteupMetadata } from "@/types/writeup";

const writeups: WriteupMetadata[] = [
  {
    title: "SQL Injection Authentication Bypass",
    slug: "sqli-auth-bypass",
    platform: "Hack The Box",
    difficulty: "Easy",
    vulnerabilities: ["SQL Injection"],
    publishedAt: "2026-09-03",
    summary: "A complete description that is long enough for the schema.",
  },
  {
    title: "Reflected XSS",
    slug: "reflected-xss",
    platform: "PortSwigger",
    difficulty: "Medium",
    vulnerabilities: ["Cross-Site Scripting"],
    publishedAt: "2026-09-02",
    summary: "Another complete description that is long enough for the schema.",
  },
];

describe("filterWriteups", () => {
  it("combines access and search without searching a locked body", () => {
    const collection = writeups.map((writeup, index) => ({
      ...writeup,
      access: index ? ("locked" as const) : ("public" as const),
    }));
    const filters = {
      query: "",
      platform: "",
      difficulty: "",
      vulnerability: "",
      access: "locked" as const,
    };
    expect(filterWriteups(collection, filters).map(({ slug }) => slug)).toEqual(
      ["reflected-xss"],
    );
    expect(filterWriteups(collection, { ...filters, query: "sql" })).toEqual(
      [],
    );
  });
  it("searches title and vulnerability without case sensitivity", () => {
    const result = filterWriteups(writeups, {
      query: "sql injection",
      platform: "",
      difficulty: "",
      vulnerability: "",
    });

    expect(result.map((writeup) => writeup.slug)).toEqual(["sqli-auth-bypass"]);
  });

  it("combines exact metadata filters", () => {
    const result = filterWriteups(writeups, {
      query: "",
      platform: "PortSwigger",
      difficulty: "Medium",
      vulnerability: "Cross-Site Scripting",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("reflected-xss");
  });
});
