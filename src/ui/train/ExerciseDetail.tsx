// ui/train/ExerciseDetail.tsx — per-exercise progress: stepped e1RM chart with
// amber PR marks, WEIGHT / REPS / VOLUME secondary charts, and the 12-week
// delta line (`12 WK AGO 245 → NOW 272 (+12%)`).
import { useState } from 'react';
import { useOath, e1rm } from '../../app/store';
import { addDays } from '../../core/dates';
import { Panel, SectionLabel, RetroChart } from '../atoms';
import type { RetroChartPoint } from '../atoms';
import { dimButton, neonButton, overlayStyle } from './TrainScreen';

type Metric = 'weight' | 'reps' | 'volume';
const METRICS: [Metric, string][] = [['weight', 'WEIGHT'], ['reps', 'REPS'], ['volume', 'VOLUME']];

interface SessionPoint {
  date: string;
  bestE1rm: number;
  maxWeight: number;
  maxReps: number;
  volume: number;
}

export default function ExerciseDetail({
  exerciseId, onClose,
}: {
  exerciseId: string;
  onClose: () => void;
}) {
  const exercises = useOath((s) => s.exercises);
  const sessions = useOath((s) => s.sessions);
  const prs = useOath((s) => s.prs);
  const today = useOath((s) => s.today);

  const [metric, setMetric] = useState<Metric>('weight');

  const name = exercises.find((e) => e.id === exerciseId)?.name ?? '?';

  // One point per session containing sets of this exercise, oldest first.
  const points: SessionPoint[] = sessions
    .filter((s) => s.sets.some((x) => x.exerciseId === exerciseId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((s) => {
      const sets = s.sets.filter((x) => x.exerciseId === exerciseId);
      return {
        date: s.date,
        bestE1rm: sets.reduce((m, x) => Math.max(m, e1rm(x.weight, x.reps)), 0),
        maxWeight: sets.reduce((m, x) => Math.max(m, x.weight), 0),
        maxReps: sets.reduce((m, x) => Math.max(m, x.reps), 0),
        volume: sets.reduce((sum, x) => sum + x.weight * x.reps, 0),
      };
    });

  const prDates = new Set(prs.filter((p) => p.exerciseId === exerciseId).map((p) => p.date));
  const e1rmPoints: RetroChartPoint[] = points.map((p) => {
    const pt: RetroChartPoint = { x: p.date, y: p.bestE1rm };
    if (prDates.has(p.date)) pt.pr = true;
    return pt;
  });

  const metricPoints: RetroChartPoint[] = points.map((p) => ({
    x: p.date,
    y: metric === 'weight' ? p.maxWeight : metric === 'reps' ? p.maxReps : p.volume,
  }));

  // 12-week delta: best e1RM up to 12 weeks ago vs best e1RM now.
  const cutoff = addDays(today, -84);
  const bestUpTo = (limit: string): number =>
    points.filter((p) => p.date <= limit).reduce((m, p) => Math.max(m, p.bestE1rm), 0);
  const then = bestUpTo(cutoff);
  const nowBest = bestUpTo(today);
  const pct = then > 0 ? Math.round(((nowBest - then) / then) * 100) : 0;

  return (
    <div style={overlayStyle}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 24, color: 'var(--text-hi)' }}>{name.toUpperCase()}</span>
          <button style={dimButton} onClick={onClose}>CLOSE</button>
        </div>

        {then > 0 && nowBest > 0 && (
          <div style={{ fontSize: 20, color: 'var(--text-mid)', margin: '8px 0' }}>
            12 WK AGO {then} → NOW {nowBest}{' '}
            <span style={{ color: pct >= 0 ? 'var(--neon)' : 'var(--ember)' }}>
              ({pct >= 0 ? '+' : ''}{pct}%)
            </span>
          </div>
        )}

        <SectionLabel>E1RM</SectionLabel>
        <RetroChart points={e1rmPoints} yLabel="E1RM" />

        <div style={{ display: 'flex', gap: 6, margin: '14px 0 8px' }}>
          {METRICS.map(([m, label]) => (
            <button
              key={m}
              style={{
                ...neonButton,
                width: 'auto',
                flex: 1,
                fontSize: 18,
                padding: '4px 8px',
                color: metric === m ? 'var(--on-neon)' : 'var(--text-mid)',
                background: metric === m ? 'var(--neon)' : 'transparent',
                borderColor: metric === m ? 'var(--neon)' : 'var(--border)',
              }}
              onClick={() => setMetric(m)}
            >
              {label}
            </button>
          ))}
        </div>
        <RetroChart points={metricPoints} yLabel={METRICS.find(([m]) => m === metric)?.[1]} />
      </Panel>
    </div>
  );
}
