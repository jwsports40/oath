import type { Difficulty } from '../../core/types';

const FILLED: Record<Difficulty, number> = {
  trivial: 1,
  easy: 2,
  medium: 3,
  hard: 4,
  elite: 5,
};

/** 5 small 6px squares; filled count = trivial 1 .. elite 5. */
export default function DifficultyPips({ difficulty }: { difficulty: Difficulty }) {
  const filled = FILLED[difficulty];
  return (
    <span
      aria-label={`difficulty ${difficulty}`}
      style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle' }}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            background: i < filled ? 'var(--neon)' : 'transparent',
            border: `1px solid ${i < filled ? 'var(--neon)' : 'var(--text-faint)'}`,
          }}
        />
      ))}
    </span>
  );
}
