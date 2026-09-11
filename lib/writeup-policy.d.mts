export const SLUG_MAX_LENGTH: 100;
export const DIFFICULTIES: readonly ["Easy", "Medium", "Hard", "Insane"];
export function isSafeWriteupSlug(value: unknown): value is string;
export function isSafeFlagHashEnv(value: unknown): value is string;
export function flagHashEnvForSlug(slug: string): string;
