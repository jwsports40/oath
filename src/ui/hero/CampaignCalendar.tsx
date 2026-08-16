import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useOath } from '../../app/store';
import { db } from '../../data/db';
import { weekdayOf } from '../../core/dates';
import { DiamondCheckbox, Panel, RankDiamond, SectionLabel } from '../atoms';
import type { DailyScore, QuestInstance } from '../../core/types';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** Heat color for a sealed day (plan Task 17): S-days neon, then score bands. */
function heatFor(d: DailyScore): { bg: string; fg: string } {
  if (d.rank === 'S' || d.rank === 'S+') return { bg: 'var(--neon)', fg: 'var(--on-neon)' };
  if (d.score >= 70) return { bg: 'var(--heat-good)', fg: 'var(--text-hi)' };
  if (d.score >= 40) return { bg: 'var(--heat-mid)', fg: 'var(--text-hi)' };
  return { bg: 'var(--heat-poor)', fg: 'var(--text-hi)' };
}

interface Recap {
  date: string;
  instances: QuestInstance[];
  xp: number;
  finishedSessions: number;
  setsLogged: number;
  macros: { cal: number; p: number; c: number; f: number };
  waterOz: number;
}

async function loadRecap(date: string): Promise<Recap> {
  const orderOf = (i: QuestInstance): number => (i.main ? 0 : i.optional ? 2 : 1);
  const instances = (await db.instances.where('date').equals(date).toArray())
    .sort((a, b) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name));
  const xp = (await db.xpEvents.where('date').equals(date).toArray())
    .reduce((sum, e) => sum + e.amount, 0);
  const sessions = await db.sessions.where('date').equals(date).toArray();
  const finishedSessions = sessions.filter((s) => s.finishedAt !== undefined).length;
  const setsLogged = sessions.reduce((sum, s) => sum + s.sets.length, 0);
  const macros = { cal: 0, p: 0, c: 0, f: 0 };
  for (const m of await db.meals.where('date').equals(date).toArray()) {
    for (const e of m.entries) {
      macros.cal += e.calories; macros.p += e.protein_g; macros.c += e.carbs_g; macros.f += e.fat_g;
    }
  }
  const waterOz = (await db.hydration.where('date').equals(date).toArray())
    .reduce((sum, h) => sum + h.oz, 0);
  return { date, instances, xp, finishedSessions, setsLogged, macros, waterOz };
}

const bodyText: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 18 };

/**
 * CAMPAIGN calendar — month grid heat-colored by sealed day score, today
 * outlined, month nav arrows. Tapping a day opens the full recap overlay;
 * past quests toggle through `editPastDay` behind a 'REWRITE HISTORY?' confirm.
 */
export default function CampaignCalendar() {
  const today = useOath((s) => s.today);
  const dailyScores = useOath((s) => s.dailyScores);
  const editPastDay = useOath((s) => s.editPastDay);

  const [view, setView] = useState<{ y: number; m: number }>(() => ({
    y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)),
  }));
  const [recap, setRecap] = useState<Recap | null>(null);

  const openDay = useCallback((date: string) => {
    void loadRecap(date).then(setRecap);
  }, []);

  // Keep the recap in sync after a history rewrite refreshes the store.
  useEffect(() => {
    if (recap !== null) void loadRecap(recap.date).then(setRecap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyScores]);

  const nav = (delta: number): void => {
    setView((v) => {
      const m = v.m + delta;
      if (m < 1) return { y: v.y - 1, m: 12 };
      if (m > 12) return { y: v.y + 1, m: 1 };
      return { y: v.y, m };
    });
  };

  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const firstKey = `${view.y}-${pad2(view.m)}-01`;
  const leadingBlanks = weekdayOf(firstKey) - 1; // Monday-start grid

  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${view.y}-${pad2(view.m)}-${pad2(i + 1)}`),
  ];

  const toggleQuest = async (r: Recap, inst: QuestInstance): Promise<void> => {
    if (r.date >= today) return; // only sealed history can be rewritten
    if (!window.confirm('REWRITE HISTORY?')) return;
    await editPastDay(r.date, inst.id, inst.status !== 'done');
    setRecap(await loadRecap(r.date));
  };

  const navBtn: CSSProperties = {
    ...bodyText,
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-mid)',
    width: 30,
    height: 26,
    lineHeight: 1,
    cursor: 'pointer',
  };

  const recapScore = recap !== null ? dailyScores[recap.date] : undefined;

  return (
    <section>
      <SectionLabel>CAMPAIGN</SectionLabel>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button aria-label="previous month" style={navBtn} onClick={() => nav(-1)}>‹</button>
          <span style={{ ...bodyText, fontSize: 20, color: 'var(--text-hi)' }}>
            {MONTHS[view.m - 1]} {view.y}
          </span>
          <button aria-label="next month" style={navBtn} onClick={() => nav(1)}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
            <div
              key={`wd-${i}`}
              style={{
                fontFamily: 'var(--font-label)', fontSize: 6, color: 'var(--text-faint)',
                textAlign: 'center', paddingBottom: 2,
              }}
            >
              {w}
            </div>
          ))}
          {cells.map((date, i) => {
            if (date === null) return <div key={`blank-${i}`} />;
            const sealed = dailyScores[date];
            const heat = sealed !== undefined ? heatFor(sealed) : null;
            const isToday = date === today;
            const future = date > today;
            return (
              <button
                key={date}
                onClick={() => { if (!future) openDay(date); }}
                style={{
                  ...bodyText,
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: heat !== null ? heat.bg : 'transparent',
                  color: heat !== null ? heat.fg : future ? 'var(--text-faint)' : 'var(--text-low)',
                  border: isToday ? '1px solid var(--neon)' : '1px solid var(--hairline)',
                  boxShadow: isToday ? '0 0 6px rgba(70,255,125,0.45)' : 'none',
                  cursor: future ? 'default' : 'pointer',
                  padding: 0,
                }}
              >
                {Number(date.slice(8, 10))}
              </button>
            );
          })}
        </div>
      </Panel>

      {recap !== null && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(5,7,5,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setRecap(null)}
        >
          <div style={{ width: '100%', maxWidth: 398, maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <Panel>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ ...bodyText, fontSize: 22, color: 'var(--text-hi)' }}>{recap.date}</div>
                  <div style={{ ...bodyText, color: 'var(--text-mid)' }}>
                    {recapScore !== undefined ? `${recapScore.score}% COMPLETE` : 'UNSEALED'}
                    {' · '}+{recap.xp.toLocaleString()} XP
                    {recapScore?.emberSpent === true ? ' · EMBER SPENT' : ''}
                  </div>
                </div>
                {recapScore !== undefined && <RankDiamond rank={recapScore.rank} size={44} />}
              </div>

              <SectionLabel>QUESTS</SectionLabel>
              {recap.instances.length === 0 && (
                <div style={{ ...bodyText, color: 'var(--text-faint)' }}>NO QUESTS RECORDED</div>
              )}
              {recap.instances.map((inst) => (
                <div
                  key={inst.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}
                >
                  <DiamondCheckbox
                    state={
                      inst.status === 'done' ? 'done'
                        : inst.status === 'failed' ? 'failed'
                          : inst.optional ? 'optional'
                            : inst.main ? 'main' : 'todo'
                    }
                    size={18}
                    {...(recap.date < today ? { onToggle: () => { void toggleQuest(recap, inst); } } : {})}
                  />
                  <span
                    style={{
                      ...bodyText,
                      flex: 1,
                      color: inst.status === 'done' ? 'var(--text-faint)' : 'var(--text-hi)',
                      textDecoration: inst.status === 'done' ? 'line-through' : 'none',
                    }}
                  >
                    {inst.name}
                  </span>
                  {inst.status === 'failed' && (
                    <span style={{ ...bodyText, color: 'var(--ember)' }}>FAILED</span>
                  )}
                </div>
              ))}

              <SectionLabel>TRAINING</SectionLabel>
              <div style={{ ...bodyText, color: 'var(--text-mid)' }}>
                {recap.finishedSessions > 0
                  ? `${recap.finishedSessions} SESSION${recap.finishedSessions > 1 ? 'S' : ''} · ${recap.setsLogged} SETS`
                  : 'NO TRAINING'}
              </div>

              <SectionLabel>FUEL</SectionLabel>
              <div style={{ ...bodyText, color: 'var(--text-mid)' }}>
                {Math.round(recap.macros.cal).toLocaleString()} CAL · {Math.round(recap.macros.p)}P · {Math.round(recap.macros.c)}C · {Math.round(recap.macros.f)}F
              </div>
              <div style={{ ...bodyText, color: 'var(--text-mid)' }}>
                WATER {Math.round(recap.waterOz)} OZ
              </div>

              <button
                onClick={() => setRecap(null)}
                style={{
                  ...bodyText,
                  width: '100%', marginTop: 14, padding: '8px 0',
                  background: 'none', border: '1px solid var(--border)',
                  color: 'var(--text-mid)', cursor: 'pointer',
                }}
              >
                CLOSE
              </button>
            </Panel>
          </div>
        </div>
      )}
    </section>
  );
}
