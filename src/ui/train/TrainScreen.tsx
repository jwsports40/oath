// ui/train/TrainScreen.tsx — TRAIN tab: today's assigned workout, program week
// strip, best-lift tiles, and the program manager (spec §4 TRAIN, plan Task 15).
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useOath } from '../../app/store';
import { DIFFICULTY } from '../../core/types';
import type { Exercise, PlannedExercise, WorkoutDay, WorkoutProgram } from '../../core/types';
import { addDays, weekdayOf, weekStartOf } from '../../core/dates';
import { newId } from '../../core/ids';
import { db } from '../../data/db';
import { xpAward } from '../../game/xp';
import { PageFrame, Panel, SectionLabel, DifficultyPips, Icon } from '../atoms';
import SessionLogger from './SessionLogger';
import ExerciseDetail from './ExerciseDetail';

const WD_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const neonButton: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 20,
  color: 'var(--neon)',
  background: 'transparent',
  border: '1px solid var(--neon)',
  padding: '8px 12px',
  cursor: 'pointer',
  width: '100%',
};

export const dimButton: CSSProperties = {
  ...neonButton,
  width: 'auto',
  fontSize: 18,
  padding: '2px 8px',
  color: 'var(--text-mid)',
  border: '1px solid var(--border)',
};

export const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  background: 'linear-gradient(180deg, var(--bg0), var(--bg1))',
  overflowY: 'auto',
  maxWidth: 430,
  margin: '0 auto',
  padding: 12,
};

function planLine(p: PlannedExercise, exercises: Exercise[]): string {
  const name = exercises.find((e) => e.id === p.exerciseId)?.name ?? '?';
  const w = p.weight !== undefined ? `·${p.weight}` : '';
  return `${name.toUpperCase()} ${p.sets}×${p.reps}${w}`;
}

/** One-tap PPL program from the seeded exercises: Push/Pull/Legs Mon/Wed/Fri. */
export function buildPpl(exercises: Exercise[]): WorkoutProgram {
  const ex = (name: string): string => exercises.find((e) => e.name === name)?.id ?? exercises[0]?.id ?? '';
  return {
    id: newId(),
    name: 'PPL',
    active: true,
    days: [
      {
        id: newId(), name: 'PUSH', weekday: [1],
        exercises: [
          { exerciseId: ex('Bench Press'), sets: 3, reps: 8 },
          { exerciseId: ex('Overhead Press'), sets: 3, reps: 8 },
        ],
      },
      {
        id: newId(), name: 'PULL', weekday: [3],
        exercises: [
          { exerciseId: ex('Deadlift'), sets: 3, reps: 5 },
          { exerciseId: ex('Barbell Row'), sets: 3, reps: 8 },
          { exerciseId: ex('Pull-Up'), sets: 3, reps: 8 },
        ],
      },
      {
        id: newId(), name: 'LEGS', weekday: [5],
        exercises: [{ exerciseId: ex('Squat'), sets: 3, reps: 8 }],
      },
    ],
  };
}

const BEST_LIFTS: [string, string][] = [['Bench Press', 'BENCH'], ['Squat', 'SQUAT'], ['Deadlift', 'DEAD']];

export default function TrainScreen() {
  const programs = useOath((s) => s.programs);
  const exercises = useOath((s) => s.exercises);
  const sessions = useOath((s) => s.sessions);
  const prs = useOath((s) => s.prs);
  const instances = useOath((s) => s.instances);
  const perQuestStreaks = useOath((s) => s.perQuestStreaks);
  const today = useOath((s) => s.today);
  const startSession = useOath((s) => s.startSession);
  const saveProgram = useOath((s) => s.saveProgram);

  const [logger, setLogger] = useState<{ sessionId: string; day: WorkoutDay } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkoutProgram | null>(null);

  const active = programs.find((p) => p.active) ?? null;
  const todayWd = weekdayOf(today);
  const todayDay = active?.days.find((d) => d.weekday.includes(todayWd)) ?? null;

  const workoutInst = instances.find((i) => i.kind === 'workout');
  const gymXp = workoutInst !== undefined
    ? xpAward(DIFFICULTY[workoutInst.difficulty].xp, perQuestStreaks[workoutInst.templateId] ?? 0)
    : null;

  const openSession = sessions.find((s) => s.date === today && s.finishedAt === undefined);

  const ws = weekStartOf(today);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const weekPlan = active === null ? [] : weekDates.flatMap((date, i) => {
    const wd = i + 1;
    const day = active.days.find((d) => d.weekday.includes(wd));
    if (day === undefined) return [];
    const done = sessions.some((s) => s.workoutDayId === day.id && s.date === date && s.finishedAt !== undefined);
    return [{ wd, name: day.name, done }];
  });

  const bestOf = (exerciseName: string): number | null => {
    const ex = exercises.find((e) => e.name === exerciseName);
    if (ex === undefined) return null;
    const best = prs.filter((p) => p.exerciseId === ex.id).reduce((m, p) => Math.max(m, p.e1rm), 0);
    return best > 0 ? best : null;
  };

  const begin = async (): Promise<void> => {
    if (todayDay === null) return;
    if (openSession !== undefined && openSession.workoutDayId === todayDay.id) {
      setLogger({ sessionId: openSession.id, day: todayDay });
      return;
    }
    const sid = await startSession(todayDay.id);
    setLogger({ sessionId: sid, day: todayDay });
  };

  return (
    <PageFrame title="Train">
      {/* Today's assigned workout */}
      <SectionLabel>Today's Workout</SectionLabel>
      {todayDay !== null ? (
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 24, color: 'var(--text-hi)' }}>{todayDay.name.toUpperCase()}</span>
            {workoutInst !== undefined && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <DifficultyPips difficulty={workoutInst.difficulty} />
                {workoutInst.status === 'done' && <span style={{ fontSize: 18, color: 'var(--neon)' }}>DONE</span>}
              </span>
            )}
          </div>
          <div style={{ margin: '8px 0' }}>
            {todayDay.exercises.map((p, i) => (
              <div
                key={i}
                onClick={() => setDetailId(p.exerciseId)}
                style={{ fontSize: 20, color: 'var(--text-mid)', padding: '2px 0', cursor: 'pointer' }}
              >
                {planLine(p, exercises)}
              </div>
            ))}
          </div>
          <button style={neonButton} onClick={() => { void begin(); }}>
            {openSession !== undefined && openSession.workoutDayId === todayDay.id
              ? 'RESUME SESSION'
              : `BEGIN SESSION${gymXp !== null ? ` +${gymXp} XP` : ''}`}
          </button>
        </Panel>
      ) : (
        <Panel>
          <div style={{ fontSize: 20, color: 'var(--text-low)' }}>
            {active === null ? 'NO ACTIVE PROGRAM — FORGE ONE BELOW.' : 'REST DAY. THE FORGE COOLS.'}
          </div>
        </Panel>
      )}

      {/* Last time you ran today's workout */}
      {todayDay !== null && (() => {
        const last = sessions
          .filter((s) => s.workoutDayId === todayDay.id && s.finishedAt !== undefined)
          .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        if (last === undefined || last.sets.length === 0) return null;
        return (
          <>
            <SectionLabel>Last Time · {last.date}</SectionLabel>
            <Panel>
              {todayDay.exercises.map((p) => {
                const name = exercises.find((e) => e.id === p.exerciseId)?.name ?? '?';
                const sets = last.sets
                  .filter((x) => x.exerciseId === p.exerciseId)
                  .sort((a, b) => a.setIndex - b.setIndex);
                if (sets.length === 0) return null;
                return (
                  <div key={p.exerciseId} style={{ fontSize: 18, color: 'var(--text-mid)', padding: '2px 0' }}>
                    {name.toUpperCase()}
                    <span style={{ color: 'var(--text-low)', marginLeft: 8 }}>
                      {sets.map((x) => `${x.weight}×${x.reps}`).join(' · ')}
                    </span>
                  </div>
                );
              })}
              {last.notes !== undefined && last.notes !== '' && (
                <div style={{ fontSize: 16, color: 'var(--text-faint)', marginTop: 4 }}>“{last.notes}”</div>
              )}
            </Panel>
          </>
        );
      })()}

      {/* Program week strip */}
      {weekPlan.length > 0 && (
        <>
          <SectionLabel>This Week</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 18, color: 'var(--text-mid)' }}>
            {weekPlan.map((d, i) => (
              <span key={d.wd} style={{ color: d.done ? 'var(--neon)' : d.wd === todayWd ? 'var(--text-hi)' : 'var(--text-mid)' }}>
                {WD_LABELS[d.wd - 1]} {d.name.toUpperCase()}{d.done ? ' ✓' : ''}
                {i < weekPlan.length - 1 ? ' ·' : ''}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Best-lift tiles */}
      <SectionLabel>Best Lifts · E1RM</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {BEST_LIFTS.map(([name, label]) => {
          const ex = exercises.find((e) => e.name === name);
          const best = bestOf(name);
          return (
            <Panel key={name}>
              <div
                onClick={() => { if (ex !== undefined) setDetailId(ex.id); }}
                style={{ textAlign: 'center', cursor: 'pointer' }}
              >
                <div style={{ fontFamily: 'var(--font-label)', fontSize: 6, letterSpacing: '0.2em', color: 'var(--text-faint)' }}>
                  {label}
                </div>
                <div style={{ fontSize: 26, color: best !== null ? 'var(--text-hi)' : 'var(--text-faint)', marginTop: 4 }}>
                  {best !== null ? best : '—'}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {/* Program manager */}
      <SectionLabel>Programs</SectionLabel>
      {programs.map((p) => (
        <div
          key={p.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <span
            onClick={() => setDraft(structuredClone(p))}
            style={{ flex: 1, fontSize: 20, color: p.active ? 'var(--neon)' : 'var(--text-hi)', cursor: 'pointer' }}
          >
            {p.name.toUpperCase()}
            <span style={{ color: 'var(--text-faint)', marginLeft: 8 }}>{p.days.length} DAYS</span>
          </span>
          {p.active ? (
            <span style={{ fontFamily: 'var(--font-label)', fontSize: 6, letterSpacing: '0.2em', color: 'var(--neon)' }}>
              ACTIVE
            </span>
          ) : (
            <button style={dimButton} onClick={() => { void saveProgram({ ...p, active: true }); }}>
              SET ACTIVE
            </button>
          )}
        </div>
      ))}
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        {programs.length === 0 && (
          <button style={neonButton} onClick={() => { void saveProgram(buildPpl(exercises)); }}>
            <Icon name="dumbbell" size={16} /> FORGE PPL PROGRAM
          </button>
        )}
        <button
          style={{ ...neonButton, color: 'var(--text-mid)', borderColor: 'var(--border)' }}
          onClick={() => setDraft({
            id: newId(), name: '', active: programs.length === 0,
            days: [{ id: newId(), name: 'DAY 1', weekday: [], exercises: [] }],
          })}
        >
          + FORGE NEW PROGRAM
        </button>
      </div>

      {logger !== null && (
        <SessionLogger
          sessionId={logger.sessionId}
          day={logger.day}
          onClose={() => setLogger(null)}
          onOpenExercise={(id) => setDetailId(id)}
        />
      )}
      {detailId !== null && <ExerciseDetail exerciseId={detailId} onClose={() => setDetailId(null)} />}
      {draft !== null && (
        <ProgramEditor
          draft={draft}
          exercises={exercises}
          onChange={setDraft}
          onSeal={() => {
            if (draft.name.trim() === '') return;
            void saveProgram(draft).then(() => setDraft(null));
          }}
          onClose={() => setDraft(null)}
        />
      )}
    </PageFrame>
  );
}

const fieldInput: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 20,
  color: 'var(--text-hi)',
  background: 'var(--bg-deep)',
  border: '1px solid var(--border)',
  padding: '4px 8px',
  width: '100%',
};

function ProgramEditor({
  draft, exercises, onChange, onSeal, onClose,
}: {
  draft: WorkoutProgram;
  exercises: Exercise[];
  onChange: (p: WorkoutProgram) => void;
  onSeal: () => void;
  onClose: () => void;
}) {
  const refresh = useOath((s) => s.refresh);
  const [newExName, setNewExName] = useState('');

  const patchDay = (dayId: string, patch: Partial<WorkoutDay>): void => {
    onChange({ ...draft, days: draft.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) });
  };
  const patchExercise = (dayId: string, idx: number, patch: Partial<PlannedExercise>): void => {
    const day = draft.days.find((d) => d.id === dayId);
    if (day === undefined) return;
    const list = day.exercises.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    patchDay(dayId, { exercises: list });
  };

  const forgeExercise = async (): Promise<void> => {
    const name = newExName.trim();
    if (name === '') return;
    await db.exercises.add({ id: newId(), name });
    setNewExName('');
    await refresh();
  };

  return (
    <div style={overlayStyle}>
      <Panel>
        <SectionLabel>Forge Program</SectionLabel>
        <input
          style={fieldInput}
          value={draft.name}
          placeholder="PROGRAM NAME"
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', fontSize: 20, color: 'var(--text-mid)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => onChange({ ...draft, active: e.target.checked })}
          />
          ACTIVE PROGRAM
        </label>

        {draft.days.map((day) => (
          <div key={day.id} style={{ border: '1px solid var(--hairline)', padding: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={{ ...fieldInput, flex: 1 }}
                value={day.name}
                placeholder="DAY NAME"
                onChange={(e) => patchDay(day.id, { name: e.target.value })}
              />
              <button
                style={dimButton}
                onClick={() => onChange({ ...draft, days: draft.days.filter((d) => d.id !== day.id) })}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, margin: '8px 0' }}>
              {WD_LABELS.map((label, i) => {
                const wd = i + 1;
                const on = day.weekday.includes(wd);
                return (
                  <button
                    key={wd}
                    style={{
                      ...dimButton,
                      padding: '2px 4px',
                      fontSize: 14,
                      color: on ? 'var(--on-neon)' : 'var(--text-low)',
                      background: on ? 'var(--neon)' : 'transparent',
                      borderColor: on ? 'var(--neon)' : 'var(--border)',
                    }}
                    onClick={() => patchDay(day.id, {
                      weekday: on ? day.weekday.filter((w) => w !== wd) : [...day.weekday, wd].sort((a, b) => a - b),
                    })}
                  >
                    {label[0]}
                  </button>
                );
              })}
            </div>
            {day.exercises.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
                <select
                  style={{ ...fieldInput, flex: 1, width: 'auto', minWidth: 0 }}
                  value={p.exerciseId}
                  onChange={(e) => patchExercise(day.id, idx, { exerciseId: e.target.value })}
                >
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name.toUpperCase()}</option>
                  ))}
                </select>
                <input
                  style={{ ...fieldInput, width: 52 }}
                  type="number" inputMode="numeric" value={p.sets} aria-label="sets"
                  onChange={(e) => patchExercise(day.id, idx, { sets: Math.max(1, Number(e.target.value) || 1) })}
                />
                <span style={{ color: 'var(--text-faint)' }}>×</span>
                <input
                  style={{ ...fieldInput, width: 52 }}
                  type="number" inputMode="numeric" value={p.reps} aria-label="reps"
                  onChange={(e) => patchExercise(day.id, idx, { reps: Math.max(1, Number(e.target.value) || 1) })}
                />
                <input
                  style={{ ...fieldInput, width: 68 }}
                  type="number" inputMode="decimal" value={p.weight ?? ''} placeholder="WT" aria-label="weight"
                  onChange={(e) => {
                    const v = e.target.value;
                    const next: PlannedExercise = { exerciseId: p.exerciseId, sets: p.sets, reps: p.reps };
                    if (v !== '') next.weight = Number(v);
                    const day2 = draft.days.find((d) => d.id === day.id);
                    if (day2 === undefined) return;
                    patchDay(day.id, { exercises: day2.exercises.map((q, i) => (i === idx ? next : q)) });
                  }}
                />
                <button
                  style={dimButton}
                  onClick={() => patchDay(day.id, { exercises: day.exercises.filter((_, i) => i !== idx) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              style={{ ...dimButton, width: '100%' }}
              onClick={() => {
                const first = exercises[0];
                if (first === undefined) return;
                patchDay(day.id, { exercises: [...day.exercises, { exerciseId: first.id, sets: 3, reps: 8 }] });
              }}
            >
              + EXERCISE
            </button>
          </div>
        ))}
        <button
          style={{ ...dimButton, width: '100%', marginBottom: 10 }}
          onClick={() => onChange({
            ...draft,
            days: [...draft.days, { id: newId(), name: `DAY ${draft.days.length + 1}`, weekday: [], exercises: [] }],
          })}
        >
          + DAY
        </button>

        <SectionLabel>New Exercise</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...fieldInput, flex: 1 }}
            value={newExName}
            placeholder="EXERCISE NAME"
            onChange={(e) => setNewExName(e.target.value)}
          />
          <button style={{ ...dimButton }} onClick={() => { void forgeExercise(); }}>FORGE</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button style={{ ...neonButton, flex: 1 }} onClick={onSeal}>SEAL</button>
          <button style={{ ...neonButton, flex: 1, color: 'var(--text-mid)', borderColor: 'var(--border)' }} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </Panel>
    </div>
  );
}
