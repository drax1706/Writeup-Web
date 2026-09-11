import type { WriteupAccess, WriteupMetadata } from "@/types/writeup";

export type WriteupFilters = {
  query: string;
  platform: string;
  difficulty: string;
  vulnerability: string;
  access?: WriteupAccess | "";
};

export function filterWriteups<
  T extends WriteupMetadata & { access?: WriteupAccess },
>(writeups: T[], filters: WriteupFilters): T[] {
  const query = filters.query.trim().toLocaleLowerCase("vi");

  return writeups.filter((writeup) => {
    const searchableText = [
      writeup.title,
      writeup.summary,
      writeup.platform,
      ...writeup.vulnerabilities,
    ]
      .join(" ")
      .toLocaleLowerCase("vi");

    return (
      (!filters.access || (writeup.access ?? "public") === filters.access) &&
      (!query || searchableText.includes(query)) &&
      (!filters.platform || writeup.platform === filters.platform) &&
      (!filters.difficulty || writeup.difficulty === filters.difficulty) &&
      (!filters.vulnerability ||
        writeup.vulnerabilities.includes(filters.vulnerability))
    );
  });
}
