// ui/train/SessionLogger.tsx — set-by-set logging for today's workout session:
// weight/reps steppers prefilled from the plan, optional RPE, rest timer,
// notes, END SESSION → finishSession (completes today's GYM quest).
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useOath } from '../../app/store';
import type { ExerciseSet, WorkoutDay } from '../../core/types';
import { Panel, SectionLabel } from '../atoms';
import { neonButton, dimButton, overlayStyle } from './TrainScreen';

const REST_SECONDS = 120;

const numInput: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 20,
  color: 'var(--text-hi)',
  background: 'var(--bg-deep)',
  border: '1px solid var(--border)',
  padding: '2px 4px',
  width: 56,
  textAlign: 'center',
};

const stepBtn: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 18,
  color: 'var(--text-mid)',
  background: 'transparent',
  border: '1px solid var(--border)',
  width: 26,
  height: 30,
  cursor: 'pointer',
  padding: 0,
};

interface RowState { weight: number; reps: number; rpe: number | null; }

function Stepper({
  value, step, onChange, label,
}: {
  value: number; step: number; onChange: (v: number) => void; label: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <button style={stepBtn} onClick={() => onChange(Math.max(0, value - step))}>−</button>
      <input
        style={numInput}
        type="number"
        inputMode="decimal"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
      <button style={stepBtn} onClick={() => onChange(value + step)}>+</button>
    </span>
  );
}

export default function SessionLogger({
  sessionId, day, onClose, onOpenExercise,
}: {
  sessionId: string;
  day: WorkoutDay;
  onClose: () => void;
  onOpenExercise?: (exerciseId: string) => void;
}) {
  const exercises = useOath((s) => s.exercises);
  const sessions = useOath((s) => s.sessions);
  const effects = useOath((s) => s.effects);
  const logSet = useOath((s) => s.logSet);
  const finishSession = useOath((s) => s.finishSession);

  const session = sessions.find((s) => s.id === sessionId);

  // Per-set editable state, prefilled from the plan.
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const p of day.exercises) {
      for (let i = 0; i < p.sets; i++) {
        init[`${p.exerciseId}:${i}`] = { weight: p.weight ?? 0, reps: p.reps, rpe: null };
      }
    }
    return init;
  });
  const [notes, setNotes] = useState('');
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [prBanner, setPrBanner] = useState<string | null>(null);

  // Rest timer tick.
  useEffect(() => {
    if (restUntil === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [restUntil]);
  const restLeft = restUntil !== null ? Math.max(0, Math.ceil((restUntil - now) / 1000)) : 0;
  useEffect(() => {
    if (restUntil !== null && restLeft === 0) setRestUntil(null);
  }, [restUntil, restLeft]);

  // PR banner: read the store effects queue non-destructively — remember how
  // many pr effects we have already seen and surface each new one for 4s.
  const seenPr = useRef<number>(effects.filter((e) => e.kind === 'pr').length);
  useEffect(() => {
    const prEffects = effects.filter((e) => e.kind === 'pr');
    if (prEffects.length > seenPr.current) {
      const latest = prEffects[prEffects.length - 1];
      if (latest.kind === 'pr') setPrBanner(`NEW PR — ${latest.label} · +${latest.xp} XP`);
      seenPr.current = prEffects.length;
      const t = window.setTimeout(() => setPrBanner(null), 4000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [effects]);

  const loggedKeys = new Set((session?.sets ?? []).map((s) => `${s.exerciseId}:${s.setIndex}`));

  const log = async (exerciseId: string, setIndex: number): Promise<void> => {
    const row = rows[`${exerciseId}:${setIndex}`];
    if (row === undefined) return;
    const set: ExerciseSet = { exerciseId, setIndex, weight: row.weight, reps: row.reps };
    if (row.rpe !== null) set.rpe = row.rpe;
    await logSet(sessionId, set);
    setRestUntil(Date.now() + REST_SECONDS * 1000);
    setNow(Date.now());
  };

  const end = async (): Promise<void> => {
    await finishSession(sessionId, notes.trim() !== '' ? notes.trim() : undefined);
    onClose();
  };

  const mmss = (s: number): string =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={overlayStyle}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SectionLabel>Session · {day.name}</SectionLabel>
          <button style={dimButton} onClick={onClose}>CLOSE</button>
        </div>

        {prBanner !== null && (
          <div
            style={{
              border: '1px solid var(--amber)', color: 'var(--amber)', padding: '6px 10px',
              fontSize: 20, margin: '8px 0', textAlign: 'center',
            }}
          >
            {prBanner}
          </div>
        )}

        {restUntil !== null && restLeft > 0 && (
          <div
            onClick={() => setRestUntil(null)}
            style={{
              border: '1px solid var(--neon)', color: 'var(--neon)', padding: '6px 10px',
              fontSize: 22, margin: '8px 0', textAlign: 'center', cursor: 'pointer',
            }}
          >
            REST {mmss(restLeft)} — TAP TO DISMISS
          </div>
        )}

        {day.exercises.map((p) => {
          const name = exercises.find((e) => e.id === p.exerciseId)?.name ?? '?';
          return (
            <div key={p.exerciseId} style={{ marginTop: 12 }}>
              <div
                onClick={() => onOpenExercise?.(p.exerciseId)}
                style={{ fontSize: 22, color: 'var(--text-hi)', cursor: 'pointer' }}
              >
                {name.toUpperCase()}
                <span style={{ color: 'var(--text-faint)', marginLeft: 8, fontSize: 18 }}>
                  {p.sets}×{p.reps}{p.weight !== undefined ? `·${p.weight}` : ''}
                </span>
              </div>
              {Array.from({ length: p.sets }, (_, i) => {
                const key = `${p.exerciseId}:${i}`;
                const row = rows[key] ?? { weight: p.weight ?? 0, reps: p.reps, rpe: null };
                const logged = loggedKeys.has(key);
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
                      opacity: logged ? 0.55 : 1, flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 18, color: 'var(--text-faint)', width: 22 }}>{i + 1}</span>
                    <Stepper
                      value={row.weight} step={5} label={`${name} set ${i + 1} weight`}
                      onChange={(v) => setRows((r) => ({ ...r, [key]: { ...row, weight: v } }))}
                    />
                    <span style={{ color: 'var(--text-faint)' }}>×</span>
                    <Stepper
                      value={row.reps} step={1} label={`${name} set ${i + 1} reps`}
                      onChange={(v) => setRows((r) => ({ ...r, [key]: { ...row, reps: v } }))}
                    />
                    <select
                      style={{ ...numInput, width: 64 }}
                      value={row.rpe ?? ''}
                      aria-label={`${name} set ${i + 1} rpe`}
                      onChange={(e) => setRows((r) => ({
                        ...r,
                        [key]: { ...row, rpe: e.target.value === '' ? null : Number(e.target.value) },
                      }))}
                    >
                      <option value="">RPE</option>
                      {Array.from({ length: 10 }, (_, n) => (
                        <option key={n + 1} value={n + 1}>{n + 1}</option>
                      ))}
                    </select>
                    <button
                      style={{
                        ...dimButton,
                        color: logged ? 'var(--neon)' : 'var(--text-mid)',
                        borderColor: logged ? 'var(--neon)' : 'var(--border)',
                      }}
                      disabled={logged}
                      onClick={() => { void log(p.exerciseId, i); }}
                    >
                      {logged ? '✓' : 'LOG'}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}

        <SectionLabel>Notes</SectionLabel>
        <textarea
          style={{
            fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--text-hi)',
            background: 'var(--bg-deep)', border: '1px solid var(--border)', padding: 8,
            width: '100%', minHeight: 60, resize: 'vertical',
          }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <button style={{ ...neonButton, marginTop: 12 }} onClick={() => { void end(); }}>
          END SESSION
        </button>
      </Panel>
    </div>
  );
}
