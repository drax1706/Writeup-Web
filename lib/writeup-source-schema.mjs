import { z } from "zod";

import {
  DIFFICULTIES,
  isSafeFlagHashEnv,
  isSafeWriteupSlug,
} from "./writeup-policy.mjs";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

// This module is shared by the server and Node authoring tools. Keep source
// validation here so imports and runtime discovery accept exactly the same data.
export const writeupMetadataSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z.string().refine(isSafeWriteupSlug, {
    message:
      "Slug must use lowercase letters, numbers and hyphens, with at most 100 characters",
  }),
  platform: z.string().trim().min(1).max(80),
  difficulty: z.enum(DIFFICULTIES),
  vulnerabilities: z.array(z.string().trim().min(1).max(80)).min(1),
  publishedAt: z
    .string()
    .regex(isoDatePattern, { message: "publishedAt must use YYYY-MM-DD" })
    .refine(
      (value) => {
        const timestamp = Date.parse(`${value}T00:00:00Z`);

        return (
          Number.isFinite(timestamp) &&
          new Date(timestamp).toISOString().slice(0, 10) === value
        );
      },
      { message: "publishedAt must be a real date" },
    ),
  summary: z.string().trim().min(20).max(240),
});

export function isSafeSlug(value) {
  return isSafeWriteupSlug(value);
}

export const publicWriteupSourceSchema = writeupMetadataSchema
  .extend({
    draft: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();

export const lockedWriteupSourceSchema = publicWriteupSourceSchema
  .extend({
    flagHashEnv: z.string().refine(isSafeFlagHashEnv, {
      message:
        "flagHashEnv must be a server-only uppercase environment name containing the FLAG_HASH token",
    }),
  })
  .strict();
