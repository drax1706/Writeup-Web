import "server-only";

function safeProfileUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export const profileLinks = [
  { label: "GitHub", href: safeProfileUrl(process.env.PROFILE_GITHUB_URL) },
  { label: "Xem CV", href: safeProfileUrl(process.env.PROFILE_CV_URL) },
].filter((item): item is { label: string; href: string } => item.href !== null);
