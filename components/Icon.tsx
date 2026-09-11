import type { SVGProps } from "react";

const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  book: "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2",
  code: "m8 7-5 5 5 5 m8-10 5 5-5 5 m-3-13-2 16",
  key: "M15 3a6 6 0 0 0-5.5 8.4L3 18v3h3v-3h3v-3l3.6-3.6A6 6 0 1 0 15 3Z M16 7h.01",
  lock: "M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2",
  arrow: "M5 12h14 m-6-6 6 6-6 6",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16 M17 17l4 4",
  terminal: "m5 6 6 6-6 6 M13 18h6",
  shield: "m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6z m-4 9 3 3 5-6",
  external: "M14 3h7v7 m0-7L10 14 M10 3H3v18h18v-7",
  chevron: "m9 5 7 7-7 7",
  check: "m5 12 4 4L19 6",
} as const;

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
