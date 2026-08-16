import type { Rank } from '../../core/types';
import { weekdayOf } from '../../core/dates';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // ISO 1..7

/** 7-cell Mon..Sun week strip: weekday letter over earned rank letter (or '·'). */
export default function WeekStrip({
  days,
  onSelect,
}: {
  days: { date: string; rank: Rank | null; isToday: boolean }[];
  onSelect?: (d: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {days.map((d) => (
        <button
          key={d.date}
          type="button"
          onClick={() => onSelect?.(d.date)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '6px 0',
            border: d.isToday ? '1px solid var(--neon)' : '1px solid var(--hairline)',
            boxShadow: d.isToday ? '0 0 6px rgba(70,255,125,0.35)' : 'none',
            background: 'var(--panel)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 6,
              color: d.isToday ? 'var(--neon)' : 'var(--text-faint)',
            }}
          >
            {WEEKDAY_LETTERS[weekdayOf(d.date) - 1]}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-rank)',
              fontWeight: 700,
              fontSize: 14,
              color: 'var(--text-mid)',
              lineHeight: 1,
            }}
          >
            {d.rank ?? '·'}
          </span>
        </button>
      ))}
    </div>
  );
}
