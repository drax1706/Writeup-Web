import type { z } from "zod";
import type { WriteupMetadata } from "../types/writeup";

type MetadataShape = {
  [Field in keyof WriteupMetadata]: z.ZodType<WriteupMetadata[Field]>;
};
type PublicSourceShape = MetadataShape & {
  draft: z.ZodDefault<z.ZodBoolean>;
};

export const writeupMetadataSchema: z.ZodObject<MetadataShape>;
export const publicWriteupSourceSchema: z.ZodObject<PublicSourceShape>;
export const lockedWriteupSourceSchema: z.ZodObject<
  PublicSourceShape & { flagHashEnv: z.ZodString }
>;
export function isSafeSlug(value: unknown): value is string;
