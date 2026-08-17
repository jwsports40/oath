// ui/quests/QuestEditor.tsx — full-screen overlay for forging/editing a quest
// template (plan Task 14; spec §4 QUESTS editor fields).
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useOath } from '../../app/store';
import { newId } from '../../core/ids';
import { dayKey, parseDay } from '../../core/dates';
import { DIFFICULTY } from '../../core/types';
import type { Difficulty, QuestTemplate, Recurrence } from '../../core/types';
import { Panel, SectionLabel, DifficultyPips } from '../atoms';

const DIFFICULTIES: Difficulty[] = ['trivial', 'easy', 'medium', 'hard', 'elite'];
const REC_TYPES: { type: Recurrence['type']; label: string }[] = [
  { type: 'everyDay', label: 'EVERY DAY' },
  { type: 'weekdays', label: 'WEEKDAYS' },
  { type: 'weekends', label: 'WEEKENDS' },
  { type: 'daysOfWeek', label: 'SPECIFIC DAYS' },
  { type: 'everyN', label: 'EVERY N DAYS' },
  { type: 'perWeek', label: '×/WEEK' },
  { type: 'monthly', label: 'MONTHLY' },
  { type: 'oneTime', label: 'ONE-TIME' },
];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // ISO 1..7

const label7: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 7,
  letterSpacing: '0.15em',
};

function chipStyle(active: boolean, color = 'var(--neon)'): CSSProperties {
  return {
    ...label7,
    padding: '7px 9px',
    border: `1px solid ${active ? color : 'var(--border)'}`,
    color: active ? color : 'var(--text-low)',
    background: 'var(--panel)',
    whiteSpace: 'nowrap',
  };
}

const fieldStyle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 20,
  color: 'var(--text-hi)',
  background: 'var(--bg-deep)',
  border: '1px solid var(--border)',
  padding: '6px 8px',
  width: '100%',
  outline: 'none',
};

function defaultRecurrence(type: Recurrence['type'], today: string): Recurrence {
  switch (type) {
    case 'everyDay': return { type: 'everyDay' };
    case 'weekdays': return { type: 'weekdays' };
    case 'weekends': return { type: 'weekends' };
    case 'daysOfWeek': return { type: 'daysOfWeek', days: [1, 3, 5] };
    case 'everyN': return { type: 'everyN', n: 2, anchor: today };
    case 'perWeek': return { type: 'perWeek', times: 3 };
    case 'monthly': return { type: 'monthly', dayOfMonth: parseDay(today).getDate() };
    case 'oneTime': return { type: 'oneTime', date: today };
  }
}

function Stepper({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  const btn: CSSProperties = {
    width: 34, height: 34, border: '1px solid var(--border)', color: 'var(--neon)',
    fontFamily: 'var(--font-body)', fontSize: 22, background: 'var(--panel)',
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button type="button" style={btn} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 22, minWidth: 26, textAlign: 'center' }}>
        {value}
      </span>
      <button type="button" style={btn} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  );
}

/**
 * Quest editor overlay. `template === null` forges a blank draft; otherwise
 * edits (SEAL) or archives (ABANDON) the given template. Saving calls
 * `saveTemplate`, which re-runs `ensureDay` inside the store so a
 * newly-scheduled quest materializes today immediately.
 */
export default function QuestEditor({ template, onClose }: {
  template: QuestTemplate | null;
  onClose: () => void;
}) {
  const categories = useOath((s) => s.categories);
  const templates = useOath((s) => s.templates);
  const saveTemplate = useOath((s) => s.saveTemplate);
  const archiveTemplate = useOath((s) => s.archiveTemplate);

  const today = dayKey(new Date());
  const [draft, setDraft] = useState<QuestTemplate>(() =>
    template !== null ? { ...template, reminders: [...template.reminders] } : {
      id: newId(),
      name: '',
      categoryId: categories[0]?.id ?? '',
      difficulty: 'easy',
      kind: 'binary',
      main: false,
      optional: false,
      recurrence: { type: 'everyDay' },
      reminders: [],
      createdAt: new Date().toISOString(),
    });
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<QuestTemplate>): void => setDraft((d) => ({ ...d, ...p }));
  const rec = draft.recurrence;

  // Max 1 active main quest template — disable the toggle when another holds it.
  const otherMain = templates.find((t) => t.main && t.id !== draft.id);
  const mainLocked = otherMain !== undefined && !draft.main;

  const seal = async (): Promise<void> => {
    const name = draft.name.trim().toUpperCase();
    if (name === '') { setError('A QUEST NEEDS A NAME'); return; }
    if (draft.kind === 'quantity' &&
        (draft.target === undefined || draft.target <= 0 || (draft.unit ?? '').trim() === '')) {
      setError('QUANTITY QUESTS NEED TARGET AND UNIT'); return;
    }
    const final: QuestTemplate = { ...draft, name };
    if (final.kind !== 'quantity') { delete final.target; delete final.unit; }
    await saveTemplate(final);
    onClose();
  };

  const abandon = async (): Promise<void> => {
    if (!window.confirm('ABANDON THIS QUEST? Its history remains in the ledger.')) return;
    await archiveTemplate(draft.id);
    onClose();
  };

  const toggleDay = (day: number): void => {
    if (rec.type !== 'daysOfWeek') return;
    const days = rec.days.includes(day)
      ? rec.days.filter((d) => d !== day)
      : [...rec.days, day].sort((a, b) => a - b);
    if (days.length > 0) patch({ recurrence: { type: 'daysOfWeek', days } });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 40, overflowY: 'auto',
        background: 'rgba(5,7,5,0.92)', padding: 8,
      }}
    >
      <div style={{ maxWidth: 430, margin: '0 auto' }}>
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{
              fontFamily: 'var(--font-title)', fontWeight: 400, fontSize: 28,
              margin: '0 0 6px', color: 'var(--text-hi)',
            }}
            >
              {template !== null ? 'Amend Quest' : 'Forge Quest'}
            </h2>
            <button type="button" onClick={onClose} style={{ ...label7, color: 'var(--text-low)' }}>
              CLOSE
            </button>
          </div>

          <SectionLabel>Name</SectionLabel>
          <input
            style={fieldStyle}
            value={draft.name}
            placeholder="NAME THE QUEST"
            onChange={(e) => patch({ name: e.target.value })}
          />

          <SectionLabel>Rune (category)</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                style={chipStyle(c.id === draft.categoryId)}
                onClick={() => patch({ categoryId: c.id })}
              >
                {c.name}
              </button>
            ))}
          </div>

          <SectionLabel>Difficulty</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                style={{
                  ...chipStyle(d === draft.difficulty),
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                }}
                onClick={() => patch({ difficulty: d })}
              >
                <DifficultyPips difficulty={d} />
                <span>{DIFFICULTY[d].label} · {DIFFICULTY[d].xp}XP</span>
              </button>
            ))}
          </div>

          {/* Every forged quest is a plain rune — kinds live on only for
              seeded templates (WATER keeps its quantity target below). */}
          {draft.kind === 'quantity' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                style={{ ...fieldStyle, flex: 1 }}
                type="number"
                min={1}
                placeholder="TARGET"
                value={draft.target ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDraft((d) => {
                    const next = { ...d };
                    if (e.target.value === '' || Number.isNaN(n)) delete next.target;
                    else next.target = n;
                    return next;
                  });
                }}
              />
              <input
                style={{ ...fieldStyle, flex: 1 }}
                placeholder="UNIT (OZ, PAGES…)"
                value={draft.unit ?? ''}
                onChange={(e) => patch({ unit: e.target.value })}
              />
            </div>
          )}

          <SectionLabel>Oaths</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              disabled={mainLocked}
              style={{
                ...chipStyle(draft.main, 'var(--amber)'),
                opacity: mainLocked ? 0.45 : 1,
              }}
              onClick={() => patch({ main: !draft.main })}
            >
              MAIN QUEST
            </button>
            <button
              type="button"
              style={chipStyle(draft.optional)}
              onClick={() => patch({ optional: !draft.optional })}
            >
              OPTIONAL — NO PENALTY
            </button>
          </div>
          {mainLocked && otherMain !== undefined && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-low)', marginTop: 4 }}>
              THE MAIN QUEST IS HELD BY {otherMain.name}
            </div>
          )}

          <SectionLabel>Recurrence</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REC_TYPES.map((r) => (
              <button
                key={r.type}
                type="button"
                style={chipStyle(r.type === rec.type)}
                onClick={() => patch({ recurrence: defaultRecurrence(r.type, today) })}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            {rec.type === 'daysOfWeek' && (
              <div style={{ display: 'flex', gap: 4 }}>
                {DAY_LETTERS.map((letter, i) => (
                  <button
                    key={i}
                    type="button"
                    style={{ ...chipStyle(rec.days.includes(i + 1)), flex: 1, textAlign: 'center' }}
                    onClick={() => toggleDay(i + 1)}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            )}
            {rec.type === 'everyN' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)' }}>EVERY</span>
                <Stepper
                  value={rec.n}
                  min={2}
                  max={30}
                  onChange={(n) => patch({ recurrence: { type: 'everyN', n, anchor: rec.anchor } })}
                />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)' }}>DAYS</span>
              </div>
            )}
            {rec.type === 'perWeek' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Stepper
                  value={rec.times}
                  min={1}
                  max={7}
                  onChange={(times) => patch({ recurrence: { type: 'perWeek', times } })}
                />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)' }}>× PER WEEK</span>
              </div>
            )}
            {rec.type === 'monthly' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)' }}>DAY</span>
                <Stepper
                  value={rec.dayOfMonth}
                  min={1}
                  max={31}
                  onChange={(dayOfMonth) => patch({ recurrence: { type: 'monthly', dayOfMonth } })}
                />
              </div>
            )}
            {rec.type === 'oneTime' && (
              <input
                style={fieldStyle}
                type="date"
                value={rec.date}
                onChange={(e) => {
                  if (e.target.value !== '') patch({ recurrence: { type: 'oneTime', date: e.target.value } });
                }}
              />
            )}
          </div>

          <SectionLabel>Reminders</SectionLabel>
          {draft.reminders.map((time, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input
                style={{ ...fieldStyle, flex: 1 }}
                type="time"
                value={time}
                onChange={(e) => {
                  const reminders = [...draft.reminders];
                  reminders[i] = e.target.value;
                  patch({ reminders });
                }}
              />
              <button
                type="button"
                style={{ ...label7, color: 'var(--ember)', border: '1px solid var(--border)', padding: '0 10px' }}
                onClick={() => patch({ reminders: draft.reminders.filter((_, j) => j !== i) })}
              >
                REMOVE
              </button>
            </div>
          ))}
          <button
            type="button"
            style={{ ...chipStyle(false), color: 'var(--neon)' }}
            onClick={() => patch({ reminders: [...draft.reminders, '08:00'] })}
          >
            + ADD REMINDER
          </button>

          {error !== null && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--ember)', marginTop: 10 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              style={{
                ...label7, flex: 1, padding: '12px 0', textAlign: 'center',
                border: '1px solid var(--neon)', color: 'var(--neon)',
                boxShadow: '0 0 8px rgba(70,255,125,0.25)',
              }}
              onClick={() => { void seal(); }}
            >
              SEAL
            </button>
            {template !== null && (
              <button
                type="button"
                style={{
                  ...label7, flex: 1, padding: '12px 0', textAlign: 'center',
                  border: '1px solid var(--ember)', color: 'var(--ember)',
                }}
                onClick={() => { void abandon(); }}
              >
                ABANDON
              </button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
