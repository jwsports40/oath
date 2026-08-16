import { useState } from 'react';
import '../../ai/queue'; // side effect: registers the SCRIBE drain with the store
import { useOath } from '../../app/store';
import { Icon, PageFrame, Panel, QuantityBar, SectionLabel, SegmentedBar } from '../atoms';
import type { FoodEntry, Meal } from '../../core/types';

const OZ_TO_ML = 29.5735;

const labelStyle = {
  fontFamily: 'var(--font-label)',
  fontSize: 6,
  letterSpacing: '0.15em',
} as const;

const buttonReset = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
} as const;

/** A number that flips into a numeric input on tap — every macro is correctable. */
function EditableNumber({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = (): void => {
    setEditing(false);
    const n = Number(draft);
    if (!Number.isNaN(n) && n >= 0 && n !== value) onCommit(n);
  };
  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        style={{
          ...buttonReset, fontSize: 18, color: 'var(--text-hi)',
          borderBottom: '1px dotted var(--text-faint)',
        }}
      >
        {Math.round(value).toLocaleString()}
      </button>
    );
  }
  return (
    <input
      type="number"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      style={{
        width: 60, background: 'var(--bg-deep)', border: '1px solid var(--border)',
        color: 'var(--neon)', fontFamily: 'var(--font-body)', fontSize: 18, padding: '0 4px',
      }}
    />
  );
}

function MacroBar({ label, value, max, unit = '' }: {
  label: string; value: number; max: number; unit?: string;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <SectionLabel>{label}</SectionLabel>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)' }}>
          {Math.round(value).toLocaleString()} / {max.toLocaleString()}{unit}
        </span>
      </div>
      <SegmentedBar value={value} max={max} />
    </div>
  );
}

function StatusBadge({ status }: { status: Meal['status'] }) {
  if (status === 'done') return null;
  const map = {
    estimating: { text: 'SCRIBING…', color: 'var(--text-mid)' },
    pending: { text: 'QUEUED', color: 'var(--text-low)' },
    needs_review: { text: 'NEEDS REVIEW', color: 'var(--ember)' },
  } as const;
  const badge = map[status];
  return <span style={{ ...labelStyle, color: badge.color }}>{badge.text}</span>;
}

function EntryRow({ entry, onPatch }: {
  entry: FoodEntry; onPatch: (patch: Partial<FoodEntry>) => void;
}) {
  const unitLabel = { fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-faint)' } as const;
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', columnGap: 8, alignItems: 'baseline',
        padding: '5px 0', borderBottom: '1px solid var(--hairline)',
      }}
    >
      <span style={{ flexBasis: '100%', fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--text-hi)', display: 'flex', justifyContent: 'space-between' }}>
        {entry.food.toUpperCase()}
        {entry.corrected
          ? <span style={{ ...labelStyle, color: 'var(--neon)' }}>CORRECTED</span>
          : <span style={{ ...labelStyle, color: 'var(--text-faint)' }}>EST {entry.confidence.toFixed(2)}</span>}
      </span>
      <EditableNumber value={entry.quantity} onCommit={(n) => onPatch({ quantity: n })} />
      <span style={unitLabel}>{entry.unit.toUpperCase()}</span>
      <EditableNumber value={entry.calories} onCommit={(n) => onPatch({ calories: n })} />
      <span style={unitLabel}>CAL</span>
      <EditableNumber value={entry.protein_g} onCommit={(n) => onPatch({ protein_g: n })} />
      <span style={unitLabel}>P</span>
      <EditableNumber value={entry.carbs_g} onCommit={(n) => onPatch({ carbs_g: n })} />
      <span style={unitLabel}>C</span>
      <EditableNumber value={entry.fat_g} onCommit={(n) => onPatch({ fat_g: n })} />
      <span style={unitLabel}>F</span>
    </div>
  );
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function FuelScreen() {
  const goals = useOath((s) => s.goals);
  const macros = useOath((s) => s.macros);
  const meals = useOath((s) => s.meals);
  const hydrationOz = useOath((s) => s.hydrationOz);
  const settings = useOath((s) => s.settings);
  const instances = useOath((s) => s.instances);
  const aiQueueSize = useOath((s) => s.aiQueueSize);
  const logMealUtterance = useOath((s) => s.logMealUtterance);
  const correctFoodEntry = useOath((s) => s.correctFoodEntry);
  const addHydration = useOath((s) => s.addHydration);

  const [draft, setDraft] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  const hasKey = settings.anthropicKey !== undefined && settings.anthropicKey !== '';
  const ml = settings.units === 'ml';
  const disp = (oz: number): number => (ml ? Math.round(oz * OZ_TO_ML) : Math.round(oz));
  const unitName = ml ? 'ML' : 'OZ';

  const scribe = (): void => {
    const text = draft.trim();
    if (text === '') return;
    setDraft('');
    void logMealUtterance(text);
  };

  const commitCustom = (): void => {
    setCustomOpen(false);
    const n = Number(customAmount);
    setCustomAmount('');
    if (Number.isNaN(n) || n <= 0) return;
    void addHydration(ml ? n / OZ_TO_ML : n);
  };

  // Meal-plan quest status (auto-evaluated by the store; this line just reports).
  const nutritionInstance = instances.find((i) => i.kind === 'nutrition');
  const rules = goals.mealPlanRules;
  const mealsLogged = meals.filter((m) => m.entries.length > 0).length;
  const rulesMet = [
    !rules.proteinGoal || macros.p >= goals.protein,
    Math.abs(macros.cal - goals.calories) <= goals.calories * (rules.calorieBandPct / 100),
    mealsLogged >= rules.minMeals,
  ].filter(Boolean).length;

  const quickAddStyle = {
    ...buttonReset,
    fontSize: 18,
    color: 'var(--neon)',
    border: '1px solid var(--border)',
    padding: '4px 10px',
  } as const;

  return (
    <PageFrame title="Fuel">
      <MacroBar label="Calories" value={macros.cal} max={goals.calories} />
      <MacroBar label="Protein" value={macros.p} max={goals.protein} unit="G" />
      <MacroBar label="Carbs" value={macros.c} max={goals.carbs} unit="G" />
      <MacroBar label="Fat" value={macros.f} max={goals.fat} unit="G" />

      <div style={{ height: 10 }} />
      <Panel>
        <SectionLabel>Tell the Ledger</SectionLabel>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={'"10 oz chicken breast, 1 cup rice…"'}
          rows={2}
          style={{
            width: '100%', resize: 'none', background: 'var(--bg-deep)',
            border: '1px solid var(--border)', color: 'var(--text-hi)',
            fontFamily: 'var(--font-body)', fontSize: 20, padding: 6,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <button
            onClick={scribe}
            disabled={draft.trim() === ''}
            style={{
              ...buttonReset, fontSize: 20, letterSpacing: '0.1em',
              color: draft.trim() === '' ? 'var(--text-low)' : 'var(--on-neon)',
              background: draft.trim() === '' ? 'var(--panel)' : 'var(--neon)',
              border: '1px solid var(--border)', padding: '4px 14px',
            }}
          >
            SCRIBE
          </button>
          {aiQueueSize > 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-low)' }}>
              {aiQueueSize} AWAITING THE SCRIBE
            </span>
          )}
        </div>
        {!hasKey && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-low)', marginTop: 6 }}>
            NO SCRIBE KEY — ADD YOUR ANTHROPIC KEY IN HERO → SETTINGS
          </div>
        )}
      </Panel>

      {nutritionInstance !== undefined && (
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginTop: 12, padding: '4px 0', borderBottom: '1px solid var(--hairline)',
            fontFamily: 'var(--font-body)', fontSize: 18,
            color: nutritionInstance.status === 'done' ? 'var(--neon)' : 'var(--text-mid)',
          }}
        >
          <span>MEAL PLAN — {rulesMet}/3 RULES</span>
          {nutritionInstance.status === 'done' && <span>SEALED</span>}
        </div>
      )}

      <SectionLabel>Meals</SectionLabel>
      {meals.length === 0 && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-faint)' }}>
          NOTHING LOGGED. TELL THE LEDGER WHAT YOU ATE.
        </div>
      )}
      {meals.map((meal) => (
        <div key={meal.id} style={{ marginBottom: 8 }}>
          <Panel>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-low)' }}>
                MEAL · {timeOf(meal.at)}
              </span>
              <StatusBadge status={meal.status} />
            </div>
            {meal.entries.length === 0 && meal.utterance !== undefined && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-faint)', marginTop: 4 }}>
                &ldquo;{meal.utterance}&rdquo;
              </div>
            )}
            {meal.entries.map((entry, idx) => (
              <EntryRow
                key={idx}
                entry={entry}
                onPatch={(patch) => { void correctFoodEntry(meal.id, idx, patch); }}
              />
            ))}
            {meal.entries.length > 0 && (
              <div
                style={{
                  display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4,
                  fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-mid)',
                }}
              >
                <span>{Math.round(meal.entries.reduce((s, e) => s + e.calories, 0)).toLocaleString()} CAL</span>
                <span>{Math.round(meal.entries.reduce((s, e) => s + e.protein_g, 0))} P</span>
              </div>
            )}
          </Panel>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-mid)' }}>
        <Icon name="drop" />
        <SectionLabel>Hydration</SectionLabel>
      </div>
      <QuantityBar value={disp(hydrationOz)} max={disp(goals.waterOz)} label={unitName} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {[8, 12, 16].map((oz) => (
          <button key={oz} onClick={() => { void addHydration(oz); }} style={quickAddStyle}>
            +{disp(oz)} {unitName}
          </button>
        ))}
        {!customOpen && (
          <button onClick={() => setCustomOpen(true)} style={quickAddStyle}>
            + CUSTOM
          </button>
        )}
        {customOpen && (
          <input
            type="number"
            autoFocus
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => { if (e.key === 'Enter') commitCustom(); }}
            placeholder={unitName}
            style={{
              width: 80, background: 'var(--bg-deep)', border: '1px solid var(--border)',
              color: 'var(--neon)', fontFamily: 'var(--font-body)', fontSize: 18, padding: '4px 6px',
            }}
          />
        )}
      </div>
    </PageFrame>
  );
}
