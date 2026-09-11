export function checkContent(options?: {
  root?: string;
}): Promise<{ published: number; drafts: number; locked: number }>;
