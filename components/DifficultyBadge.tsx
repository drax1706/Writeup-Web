import type { Difficulty } from "@/types/writeup";

type DifficultyBadgeProps = {
  difficulty: Difficulty;
};

export function DifficultyBadge({ difficulty }: DifficultyBadgeProps) {
  return (
    <span className={`difficulty difficulty-${difficulty.toLowerCase()}`}>
      {difficulty}
    </span>
  );
}
