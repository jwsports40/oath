// ui/today/TodayScreen.tsx — the home page of the ledger (plan Task 13, spec §4 TODAY).
// Every piece of data comes from useOath; every interaction fires store actions.
// Completion effects (xp float, level-up, day seal) are handled globally in Task 19.
import { Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useOath } from '../../app/store';
import { db } from '../../data/db';
import { addDays, daysBetween, romanNumeral, weekStartOf } from '../../core/dates';
import { DIFFICULTY, type QuestInstance } from '../../core/types';
import {
  DiamondCheckbox, DifficultyPips, Icon, PageFrame, Panel, QuantityBar, RankDiamond,
  SectionLabel, SegmentedBar, type DiamondState,
} from '../atoms';
import Knight from '../knight/Knight';

// --- Siege overlay -----------------------------------------------------------
// SiegeScreen is created by Task 18. Import it lazily with a runtime fallback so
// this file works even while ../siege/SiegeScreen does not exist yet.
interface SiegeOverlayProps { onClose: () => void; }

function SiegePlaceholder({ onClose }: SiegeOverlayProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg-deep)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12,
      }}
    >
      <span style={{ fontFamily: 'var(--font-title)', fontSize: 32, color: 'var(--ember)' }}>
        THE SIEGE
      </span>
      <span style={{ fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.2em', color: 'var(--text-low)' }}>
        TAP TO RETURN
      </span>
    </div>
  );
}

const LazySiegeScreen = lazy(() =>
  import('../siege/SiegeScreen').then(
    (m) => ({ default: (m as { default: unknown }).default as ComponentType<SiegeOverlayProps> }),
    () => ({ default: SiegePlaceholder as ComponentType<SiegeOverlayProps> }),
  ),
);

// --- Small shared bits -------------------------------------------------------

function xpTag(i: QuestInstance, amber = false): ReactNode {
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)', fontSize: 18, whiteSpace: 'nowrap',
        color: amber ? 'var(--amber)' : 'var(--text-low)',
      }}
    >
      +{DIFFICULTY[i.difficulty].xp} XP
    </span>
  );
}

function diamondState(i: QuestInstance): DiamondState {
  if (i.status === 'done') return 'done';
  if (i.status === 'failed') return 'failed';
  if (i.main) return 'main';
  if (i.optional) return 'optional';
  return 'todo';
}

/** Inline stepper for quantity quests. Water (oz) feeds hydration; others addQuantity. */
function QuantityStepper({ instance, onClose }: { instance: QuestInstance; onClose: () => void }) {
  const addQuantity = useOath((s) => s.addQuantity);
  const addHydration = useOath((s) => s.addHydration);
  const [custom, setCustom] = useState('');
  const isWater = instance.kind === 'quantity' && instance.unit === 'oz';
  const steps = isWater ? [8, 12, 16] : [1, 5];
  const add = (n: number): void => {
    if (n <= 0) return;
    if (isWater) void addHydration(n);
    else void addQuantity(instance.id, n);
  };
  const btn = {
    fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--neon)',
    border: '1px solid var(--border)', background: 'var(--panel)', padding: '4px 10px',
  } as const;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
      {steps.map((n) => (
        <button key={n} type="button" style={btn} onClick={() => add(n)}>
          +{n}{isWater ? ' OZ' : ''}
        </button>
      ))}
      <input
        inputMode="numeric"
        value={custom}
        onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="CUSTOM"
        style={{
          width: 72, fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-hi)',
          background: 'var(--bg-deep)', border: '1px solid var(--border)', padding: '4px 6px',
        }}
      />
      <button
        type="button"
        style={btn}
        onClick={() => { add(Number(custom)); setCustom(''); }}
      >
        ADD
      </button>
      <button
        type="button"
        style={{ ...btn, color: 'var(--text-low)' }}
        onClick={onClose}
      >
        CLOSE
      </button>
    </div>
  );
}

function QuestRow({
  instance, tag, stepperOpen, onOpenStepper, onCloseStepper,
}: {
  instance: QuestInstance;
  tag?: ReactNode;
  stepperOpen: boolean;
  onOpenStepper: () => void;
  onCloseStepper: () => void;
}) {
  const complete = useOath((s) => s.complete);
  const uncomplete = useOath((s) => s.uncomplete);
  const done = instance.status === 'done';
  const failed = instance.status === 'failed';
  const quantity = instance.kind === 'quantity' && instance.target !== undefined;

  const toggle = (): void => {
    if (failed) return;
    if (done) { void uncomplete(instance.id); return; }
    if (quantity) { onOpenStepper(); return; }
    void complete(instance.id);
  };

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <DiamondCheckbox state={diamondState(instance)} onToggle={toggle} />
        <div
          style={{ flex: 1, minWidth: 0 }}
          onClick={quantity && !done && !failed ? onOpenStepper : undefined}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)', fontSize: 20,
              color: done ? 'var(--text-faint)' : 'var(--text-hi)',
              textDecoration: done ? 'line-through' : 'none',
            }}
          >
            {instance.name}
          </span>
          {failed && (
            <span
              style={{
                marginLeft: 8, fontFamily: 'var(--font-label)', fontSize: 6,
                letterSpacing: '0.15em', color: 'var(--ember)',
              }}
            >
              FAILED
            </span>
          )}
          {tag}
        </div>
        {xpTag(instance)}
      </div>
      {quantity && (
        <div
          style={{ margin: '4px 0 0 32px' }}
          onClick={!done && !failed ? onOpenStepper : undefined}
        >
          <QuantityBar
            value={instance.progress}
            max={instance.target ?? 0}
            label={instance.unit ?? ''}
          />
          {stepperOpen && <QuantityStepper instance={instance} onClose={onCloseStepper} />}
        </div>
      )}
    </div>
  );
}

// --- The screen --------------------------------------------------------------

export default function TodayScreen() {
  const today = useOath((s) => s.today);
  const instances = useOath((s) => s.instances);
  const templates = useOath((s) => s.templates);
  const character = useOath((s) => s.character);
  const ageLevel = useOath((s) => s.ageLevel);
  const live = useOath((s) => s.live);
  const streaks = useOath((s) => s.streaks);
  const siege = useOath((s) => s.siege);
  const dailyScores = useOath((s) => s.dailyScores);
  const complete = useOath((s) => s.complete);
  const uncomplete = useOath((s) => s.uncomplete);

  const [stepperFor, setStepperFor] = useState<string | null>(null);
  const [siegeOpen, setSiegeOpen] = useState(false);
  // templateId → completions this week (for perWeek '{done}/{times} WK' tags).
  const [weekDone, setWeekDone] = useState<Record<string, number>>({});

  const main = instances.find((i) => i.main);
  const daily = instances.filter((i) => !i.main && !i.optional);
  const optional = instances.filter((i) => !i.main && i.optional);
  const dailyDone = daily.filter((i) => i.status === 'done').length;

  const sealDates = Object.keys(dailyScores).sort();
  const firstSeal = sealDates[0];
  const dayNumber = firstSeal !== undefined ? daysBetween(firstSeal, today) + 1 : 1;

  const perWeekTemplates = templates.filter((t) => t.recurrence.type === 'perWeek');
  const perWeekKey = perWeekTemplates.map((t) => t.id).join(',');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ws = weekStartOf(today);
      const we = addDays(ws, 6);
      const counts: Record<string, number> = {};
      for (const t of perWeekTemplates) {
        const done = (await db.completions.where('templateId').equals(t.id).toArray())
          .filter((c) => c.date >= ws && c.date <= we);
        counts[t.id] = done.length;
      }
      if (!cancelled) setWeekDone(counts);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, perWeekKey, instances]);

  const perWeekTag = (i: QuestInstance): ReactNode => {
    const t = templates.find((x) => x.id === i.templateId);
    if (t === undefined || t.recurrence.type !== 'perWeek') return null;
    return (
      <span
        style={{
          marginLeft: 8, fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-low)',
        }}
      >
        {weekDone[t.id] ?? 0}/{t.recurrence.times} WK
      </span>
    );
  };

  const siegePct = siege !== null && siege.maxHp > 0
    ? Math.floor((siege.hp / siege.maxHp) * 100 + 0.5)
    : 0;

  return (
    <div style={{ paddingBottom: 44 }}>
      {/* 1. Page frame */}
      <PageFrame title="Quest Log" day={romanNumeral(dayNumber)}>
          {/* 2. Knight bust panel */}
          <Panel>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Knight level={ageLevel} pose="bust" size={84} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 22, color: 'var(--text-hi)' }}>
                  LV {character.level} {character.title.toUpperCase()}
                </div>
                <div style={{ margin: '4px 0' }}>
                  <SegmentedBar value={character.into} max={character.next} />
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)' }}>
                  {character.xpTotal.toLocaleString()} XP · STREAK {streaks.overall}
                </div>
              </div>
              <RankDiamond rank={live.rank} />
            </div>
          </Panel>

          {/* 3. MAIN QUEST */}
          {main !== undefined && (
            <div style={{ marginTop: 12 }}>
              <Panel amber>
                <SectionLabel>MAIN QUEST</SectionLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <DiamondCheckbox
                    state={diamondState(main)}
                    onToggle={() => {
                      if (main.status === 'done') void uncomplete(main.id);
                      else if (main.status === 'todo') void complete(main.id);
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)', fontSize: 22,
                        color: main.status === 'done' ? 'var(--text-faint)' : 'var(--text-hi)',
                        textDecoration: main.status === 'done' ? 'line-through' : 'none',
                      }}
                    >
                      {main.name}
                    </div>
                    <DifficultyPips difficulty={main.difficulty} />
                  </div>
                  {xpTag(main, true)}
                </div>
              </Panel>
            </div>
          )}

          {/* 4. DAILY QUESTS */}
          <SectionLabel>DAILY QUESTS {dailyDone}/{daily.length}</SectionLabel>
          {daily.length === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-faint)' }}>
              THE LEDGER IS EMPTY.
            </div>
          )}
          {daily.map((i) => (
            <QuestRow
              key={i.id}
              instance={i}
              stepperOpen={stepperFor === i.id}
              onOpenStepper={() => setStepperFor(i.id)}
              onCloseStepper={() => setStepperFor(null)}
            />
          ))}

          {/* 5. OPTIONAL */}
          {optional.length > 0 && (
            <>
              <SectionLabel>OPTIONAL — NO PENALTY</SectionLabel>
              {optional.map((i) => (
                <QuestRow
                  key={i.id}
                  instance={i}
                  tag={perWeekTag(i)}
                  stepperOpen={stepperFor === i.id}
                  onOpenStepper={() => setStepperFor(i.id)}
                  onCloseStepper={() => setStepperFor(null)}
                />
              ))}
            </>
          )}

          {/* 6. Siege banner */}
          {siege !== null && !siege.killed && (
            <button
              type="button"
              onClick={() => setSiegeOpen(true)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', marginTop: 14,
                border: '1px solid var(--border)', background: 'var(--panel)', padding: '8px 10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ember)' }}>
                <Icon name="skull" size={18} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 18 }}>
                  SIEGE — {siegePct}% HP
                </span>
              </div>
              <div
                style={{
                  height: 4, marginTop: 6, background: 'var(--bg-deep)',
                  border: '1px solid var(--hairline)', position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute', inset: 0, width: `${siegePct}%`,
                    background: 'var(--ember)',
                  }}
                />
              </div>
            </button>
          )}
      </PageFrame>

      {/* 7. Footer band — pinned above the tab bar */}
      <div
        style={{
          position: 'fixed', bottom: 56, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430, zIndex: 90,
          background: 'var(--bg-deep)', borderTop: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px',
        }}
      >
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--neon)' }}>
          {live.pct}%
        </span>
        <div
          style={{
            flex: 1, height: 4, background: 'var(--panel)',
            border: '1px solid var(--hairline)', position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute', inset: 0, width: `${Math.min(100, live.pct)}%`,
              background: 'var(--neon)', boxShadow: '0 0 6px var(--neon)',
            }}
          />
        </div>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--text-mid)' }}>
          RANK {live.rank}
        </span>
      </div>

      {siegeOpen && (
        <Suspense fallback={<SiegePlaceholder onClose={() => setSiegeOpen(false)} />}>
          <LazySiegeScreen onClose={() => setSiegeOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
