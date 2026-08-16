import type { Rank } from '../../core/types';

/** Rank letter inside a rotated-square diamond outline. Neon always — amber and red are reserved. */
export default function RankDiamond({ rank, size = 40 }: { rank: Rank; size?: number }) {
  const box = size * 0.7;
  const isPlus = rank === 'S+';
  return (
    <div
      aria-label={`rank ${rank}`}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: box,
          height: box,
          transform: 'rotate(45deg)',
          border: '1.5px solid var(--neon)',
          boxShadow: '0 0 8px rgba(70,255,125,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            transform: 'rotate(-45deg)',
            fontFamily: 'var(--font-rank)',
            fontWeight: 700,
            fontSize: isPlus ? size * 0.34 : size * 0.46,
            color: 'var(--neon)',
            textShadow: '0 0 6px rgba(70,255,125,0.5)',
            lineHeight: 1,
          }}
        >
          {rank}
        </span>
      </div>
    </div>
  );
}
