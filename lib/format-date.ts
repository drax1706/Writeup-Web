const formatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "long",
  timeZone: "UTC",
});

export function formatPublishedDate(date: string): string {
  return formatter.format(new Date(`${date}T00:00:00Z`));
}
