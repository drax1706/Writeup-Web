export function importWriteup(options: {
  file: string;
  slug?: string;
  title?: string;
  access?: "public" | "locked";
  root?: string;
}): Promise<{
  access: "public" | "locked";
  slug: string;
  filePath: string;
  flagHashEnv?: string;
  imagesCopied: number;
}>;
