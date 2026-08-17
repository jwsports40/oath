// ui/quests/QuestsScreen.tsx — QUESTS management tab (plan Task 14; spec §4 QUESTS).
// Week strip with earned ranks, category filter chips (+ RUNE to add), template
// rows opening the editor, and the FORGE NEW QUEST button.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useOath } from '../../app/store';
import { db } from '../../data/db';
import { scheduleLabel } from '../../data/recurrence';
import { addDays, eachDay, weekStartOf } from '../../core/dates';
import type { QuestTemplate } from '../../core/types';
import { PageFrame, Panel, WeekStrip, DifficultyPips, Icon, SectionLabel } from '../atoms';
import QuestEditor from './QuestEditor';

const label7: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 7,
  letterSpacing: '0.15em',
};

function chipStyle(active: boolean): CSSProperties {
  return {
    ...label7,
    padding: '7px 9px',
    border: `1px solid ${active ? 'var(--neon)' : 'var(--border)'}`,
    color: active ? 'var(--neon)' : 'var(--text-low)',
    background: 'var(--panel)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}

/** Completions this week per perWeek template — weekly-goal `{x}/{times} WK` progress. */
function useWeeklyDone(templates: QuestTemplate[], today: string): Record<string, number> {
  const instances = useOath((s) => s.instances);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    void (async () => {
      const weekly: Record<string, number> = {};
      const ids = templates.filter((t) => t.recurrence.type === 'perWeek').map((t) => t.id);
      if (ids.length > 0) {
        const ws = weekStartOf(today);
        const days = new Set(eachDay(ws, addDays(ws, 6)));
        for (const id of ids) weekly[id] = 0;
        for (const c of await db.completions.toArray()) {
          if (weekly[c.templateId] !== undefined && days.has(c.date)) weekly[c.templateId] += 1;
        }
      }
      if (live) setCounts(weekly);
    })();
    return () => { live = false; };
  }, [templates, today, instances]);
  return counts;
}

export default function QuestsScreen() {
  const week = useOath((s) => s.week);
  const today = useOath((s) => s.today);
  const templates = useOath((s) => s.templates);
  const categories = useOath((s) => s.categories);
  const perQuestStreaks = useOath((s) => s.perQuestStreaks);

  const [filter, setFilter] = useState<string>('all');
  const [editor, setEditor] = useState<{ open: boolean; template: QuestTemplate | null }>({
    open: false, template: null,
  });

  const weeklyDone = useWeeklyDone(templates, today);

  const shown = templates
    .filter((t) => filter === 'all' || t.categoryId === filter)
    .sort((a, b) => Number(b.main) - Number(a.main) || Number(a.optional) - Number(b.optional)
      || a.name.localeCompare(b.name));

  return (
    <PageFrame title="Quests">
      <WeekStrip days={week} />

      <div
        style={{
          display: 'flex', gap: 6, overflowX: 'auto', margin: '12px 0',
          paddingBottom: 2, alignItems: 'center',
        }}
      >
        <button type="button" style={chipStyle(filter === 'all')} onClick={() => setFilter('all')}>
          ALL
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            style={chipStyle(filter === c.id)}
            onClick={() => setFilter(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <SectionLabel>Sworn Quests</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((t) => {
          const streak = perQuestStreaks[t.id] ?? 0;
          const quantityNote = t.kind === 'quantity' && t.target !== undefined
            ? ` · AUTO-COMPLETES AT ${t.target} ${(t.unit ?? '').toUpperCase()}`
            : '';
          const weekly = t.recurrence.type === 'perWeek'
            ? `${weeklyDone[t.id] ?? 0}/${t.recurrence.times} WK`
            : null;
          return (
            <Panel key={t.id} amber={t.main}>
              <button
                type="button"
                style={{ display: 'block', width: '100%', textAlign: 'left' }}
                onClick={() => setEditor({ open: true, template: t })}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 22, color: 'var(--text-hi)' }}>
                    {t.name}
                  </span>
                  {t.main && <span style={{ ...label7, color: 'var(--amber)' }}>MAIN</span>}
                  {t.optional && !t.main && (
                    <span style={{ ...label7, color: 'var(--text-faint)' }}>OPT</span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-low)', margin: '2px 0 6px' }}>
                  {scheduleLabel(t.recurrence)}{quantityNote}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <DifficultyPips difficulty={t.difficulty} />
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontFamily: 'var(--font-body)', fontSize: 18,
                      color: streak > 0 ? 'var(--neon)' : 'var(--text-faint)',
                    }}
                  >
                    <Icon name="flame" size={14} /> {streak}
                  </span>
                  {weekly !== null && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)', marginLeft: 'auto' }}>
                      {weekly}
                    </span>
                  )}
                </div>
              </button>
            </Panel>
          );
        })}
        {shown.length === 0 && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-faint)' }}>
            NO QUESTS SWORN UNDER THIS RUNE.
          </div>
        )}
      </div>

      <button
        type="button"
        style={{
          ...label7,
          display: 'block', width: '100%', marginTop: 16, padding: '14px 0',
          textAlign: 'center', border: '1px solid var(--neon)', color: 'var(--neon)',
          background: 'var(--panel)', boxShadow: '0 0 8px rgba(70,255,125,0.25)',
        }}
        onClick={() => setEditor({ open: true, template: null })}
      >
        FORGE NEW QUEST
      </button>

      {editor.open && (
        <QuestEditor
          template={editor.template}
          onClose={() => setEditor({ open: false, template: null })}
        />
      )}
    </PageFrame>
  );
}
