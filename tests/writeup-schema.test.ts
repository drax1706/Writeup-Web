import { describe, expect, it } from "vitest";

import { writeupMetadataSchema } from "@/lib/writeup-schema";

const metadata = {
  title: "Metadata validation",
  slug: "metadata-validation",
  platform: "Demo",
  difficulty: "Easy",
  vulnerabilities: ["Access Control"],
  publishedAt: "2026-09-03",
  summary: "Một bài demo để kiểm tra dữ liệu metadata.",
};

describe("write-up publication dates", () => {
  it.each(["2026-02-30", "2026-02-29", "2026-04-31", "2026-13-01"])(
    "rejects impossible date %s instead of normalizing it",
    (publishedAt) => {
      expect(
        writeupMetadataSchema.safeParse({ ...metadata, publishedAt }).success,
      ).toBe(false);
    },
  );

  it("accepts a leap day in a leap year", () => {
    expect(
      writeupMetadataSchema.safeParse({
        ...metadata,
        publishedAt: "2024-02-29",
      }).success,
    ).toBe(true);
  });
});
