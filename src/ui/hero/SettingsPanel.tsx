import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useOath } from '../../app/store';
import { notificationPermission, requestNotificationPermission } from '../../app/notify';
import { db } from '../../data/db';
import { DIFFICULTY } from '../../core/types';
import type { UserSettings } from '../../core/types';
import { Panel, SectionLabel } from '../atoms';

const bodyText: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 18 };

const inputStyle: CSSProperties = {
  ...bodyText,
  background: 'var(--bg-deep)',
  border: '1px solid var(--border)',
  color: 'var(--text-hi)',
  padding: '4px 6px',
  width: 90,
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ ...bodyText, color: 'var(--text-mid)' }}>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        fontFamily: 'var(--font-label)',
        fontSize: 7,
        letterSpacing: '0.15em',
        padding: '5px 10px',
        cursor: 'pointer',
        background: 'none',
        border: `1px solid ${value ? 'var(--neon)' : 'var(--hairline)'}`,
        color: value ? 'var(--neon)' : 'var(--text-faint)',
        boxShadow: value ? '0 0 6px rgba(70,255,125,0.35)' : 'none',
      }}
    >
      {value ? 'ON' : 'OFF'}
    </button>
  );
}

function Chips<T extends string>({ options, value, onChange }: {
  options: readonly T[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 6,
            letterSpacing: '0.12em',
            padding: '5px 8px',
            cursor: 'pointer',
            background: 'none',
            border: `1px solid ${o === value ? 'var(--neon)' : 'var(--hairline)'}`,
            color: o === value ? 'var(--neon)' : 'var(--text-faint)',
          }}
        >
          {o.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * System notification permission button (Task 20). Web notifications are
 * best-effort while the app is open — without permission they fall back to
 * in-app toasts, so this is an upgrade, never a gate.
 */
function PermissionButton() {
  const [perm, setPerm] = useState(notificationPermission());
  const refresh = useOath((s) => s.refresh);
  if (perm === 'unsupported') {
    return <span style={{ ...bodyText, color: 'var(--text-faint)' }}>UNSUPPORTED — IN-APP ONLY</span>;
  }
  if (perm === 'granted') {
    return <span style={{ ...bodyText, color: 'var(--neon)' }}>GRANTED</span>;
  }
  if (perm === 'denied') {
    return <span style={{ ...bodyText, color: 'var(--ember)' }}>DENIED — IN-APP ONLY</span>;
  }
  return (
    <button
      onClick={() => {
        void requestNotificationPermission().then((p) => {
          setPerm(p);
          void refresh(); // re-arms timers so they deliver via the system
        });
      }}
      style={{
        fontFamily: 'var(--font-label)',
        fontSize: 7,
        letterSpacing: '0.15em',
        padding: '5px 10px',
        cursor: 'pointer',
        background: 'none',
        border: '1px solid var(--neon)',
        color: 'var(--neon)',
        boxShadow: '0 0 6px rgba(70,255,125,0.35)',
      }}
    >
      REQUEST
    </button>
  );
}

function NumberField({ value, min, max, onCommit }: {
  value: number; min?: number; max?: number; onCommit: (n: number) => void;
}) {
  return (
    <input
      type="number"
      style={inputStyle}
      defaultValue={value}
      min={min}
      max={max}
      onBlur={(e) => {
        const n = Number(e.currentTarget.value);
        if (Number.isFinite(n)) onCommit(min !== undefined && n < min ? min : max !== undefined && n > max ? max : n);
      }}
    />
  );
}

/** Serialize every Dexie table to a downloadable JSON backup. */
async function exportBackup(today: string): Promise<void> {
  const dump: Record<string, unknown[]> = {};
  for (const table of db.tables) dump[table.name] = await table.toArray();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oath-backup-${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a backup produced by exportBackup — replaces ALL current data. */
async function importBackup(file: File): Promise<void> {
  const text = await file.text();
  // Dexie/JSON boundary: the backup file is untyped at rest.
  const dump = JSON.parse(text) as Record<string, unknown[]>;
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = dump[table.name];
      if (Array.isArray(rows) && rows.length > 0) await table.bulkPut(rows);
    }
  });
  window.location.reload();
}

/**
 * Settings overlay (spec §10): per-type notifications, sound, haptics, units,
 * nutrition targets, water goal, daily reset time, difficulty weighting view,
 * storage line, animation intensity, CRT, Anthropic API key, backup export/import.
 */
export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useOath((s) => s.settings);
  const goals = useOath((s) => s.goals);
  const today = useOath((s) => s.today);
  const updateSettings = useOath((s) => s.updateSettings);
  const updateGoals = useOath((s) => s.updateGoals);

  const fileRef = useRef<HTMLInputElement>(null);
  const [storageLine, setStorageLine] = useState('MEASURING…');

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage !== undefined
      && typeof navigator.storage.estimate === 'function') {
      void navigator.storage.estimate().then((e) => {
        const mb = (n: number | undefined): string => ((n ?? 0) / 1048576).toFixed(1);
        setStorageLine(`${mb(e.usage)} MB USED OF ${mb(e.quota)} MB`);
      });
    } else {
      setStorageLine('UNKNOWN');
    }
  }, []);

  const setNotif = (patch: Partial<UserSettings['notifications']>): void => {
    void updateSettings({ notifications: { ...settings.notifications, ...patch } });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(5,7,5,0.94)',
        display: 'flex', justifyContent: 'center',
        padding: 16, overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 398, margin: 'auto 0' }}>
        <Panel>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-title)', fontSize: 30, color: 'var(--text-hi)' }}>
              Settings
            </span>
            <button
              onClick={onClose}
              style={{ ...bodyText, background: 'none', border: '1px solid var(--border)', color: 'var(--text-mid)', padding: '3px 10px', cursor: 'pointer' }}
            >
              CLOSE
            </button>
          </div>

          <SectionLabel>NOTIFICATIONS</SectionLabel>
          <Row label="SYSTEM PERMISSION">
            <PermissionButton />
          </Row>
          <Row label="QUEST REMINDERS">
            <Toggle value={settings.notifications.questReminders} onChange={(v) => setNotif({ questReminders: v })} />
          </Row>
          <Row label="EVENING SWEEP">
            <Toggle value={settings.notifications.eveningSweep} onChange={(v) => setNotif({ eveningSweep: v })} />
          </Row>
          <Row label="SWEEP TIME">
            <input
              type="time"
              style={inputStyle}
              defaultValue={settings.notifications.sweepTime}
              onBlur={(e) => { if (e.currentTarget.value !== '') setNotif({ sweepTime: e.currentTarget.value }); }}
            />
          </Row>
          <Row label="THRESHOLD">
            <Toggle value={settings.notifications.threshold} onChange={(v) => setNotif({ threshold: v })} />
          </Row>
          <Row label="STREAK GUARD">
            <Toggle value={settings.notifications.streakGuard} onChange={(v) => setNotif({ streakGuard: v })} />
          </Row>
          <Row label="WORKOUT">
            <Toggle value={settings.notifications.workout} onChange={(v) => setNotif({ workout: v })} />
          </Row>

          <SectionLabel>FEEL</SectionLabel>
          <Row label="SOUND">
            <Toggle value={settings.sound} onChange={(v) => { void updateSettings({ sound: v }); }} />
          </Row>
          <Row label="HAPTICS">
            <Toggle value={settings.haptics} onChange={(v) => { void updateSettings({ haptics: v }); }} />
          </Row>
          <Row label="RPG ANIMATION">
            <Chips
              options={['full', 'reduced', 'off'] as const satisfies readonly UserSettings['fxIntensity'][]}
              value={settings.fxIntensity}
              onChange={(v) => { void updateSettings({ fxIntensity: v }); }}
            />
          </Row>
          <Row label="CRT SCANLINES">
            <Toggle value={settings.crt} onChange={(v) => { void updateSettings({ crt: v }); }} />
          </Row>

          <SectionLabel>UNITS</SectionLabel>
          <Row label="LIQUID UNITS">
            <Chips
              options={['oz', 'ml'] as const satisfies readonly UserSettings['units'][]}
              value={settings.units}
              onChange={(v) => { void updateSettings({ units: v }); }}
            />
          </Row>

          <SectionLabel>NUTRITION TARGETS</SectionLabel>
          <Row label="CALORIES">
            <NumberField value={goals.calories} min={0} onCommit={(n) => { void updateGoals({ calories: n }); }} />
          </Row>
          <Row label="PROTEIN G">
            <NumberField value={goals.protein} min={0} onCommit={(n) => { void updateGoals({ protein: n }); }} />
          </Row>
          <Row label="CARBS G">
            <NumberField value={goals.carbs} min={0} onCommit={(n) => { void updateGoals({ carbs: n }); }} />
          </Row>
          <Row label="FAT G">
            <NumberField value={goals.fat} min={0} onCommit={(n) => { void updateGoals({ fat: n }); }} />
          </Row>
          <Row label="WATER GOAL OZ">
            <NumberField value={goals.waterOz} min={0} onCommit={(n) => { void updateGoals({ waterOz: n }); }} />
          </Row>

          <SectionLabel>DAY</SectionLabel>
          <Row label="DAILY RESET HOUR">
            <NumberField value={settings.resetHour} min={0} max={23} onCommit={(n) => { void updateSettings({ resetHour: n }); }} />
          </Row>

          <SectionLabel>DIFFICULTY WEIGHTING</SectionLabel>
          <div style={{ ...bodyText, color: 'var(--text-mid)' }}>
            {(Object.keys(DIFFICULTY) as (keyof typeof DIFFICULTY)[]).map((k) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span>{DIFFICULTY[k].label}</span>
                <span style={{ color: 'var(--text-low)' }}>
                  {DIFFICULTY[k].xp} XP · W{DIFFICULTY[k].weight}
                </span>
              </div>
            ))}
          </div>

          <SectionLabel>STORAGE</SectionLabel>
          <div style={{ ...bodyText, color: 'var(--text-mid)' }}>{storageLine}</div>
          <div style={{ ...bodyText, color: 'var(--text-faint)' }}>OFFLINE-FIRST · NO CLOUD</div>

          <SectionLabel>SCRIBE</SectionLabel>
          <Row label="ANTHROPIC API KEY">
            <input
              type="password"
              style={{ ...inputStyle, width: 160 }}
              defaultValue={settings.anthropicKey ?? ''}
              placeholder="sk-ant-…"
              onBlur={(e) => { void updateSettings({ anthropicKey: e.currentTarget.value }); }}
            />
          </Row>
          <Row label="BRIDGE URL">
            <input
              type="text"
              style={{ ...inputStyle, width: 160 }}
              defaultValue={settings.bridgeUrl ?? ''}
              placeholder="https://…"
              onBlur={(e) => { void updateSettings({ bridgeUrl: e.currentTarget.value }); }}
            />
          </Row>
          <div style={{ ...bodyText, color: 'var(--text-faint)' }}>
            BRIDGE: SCRIBE VIA YOUR PC&apos;S CLAUDE — LEAVE BLANK AT HOME, SET A TUNNEL URL WHEN AWAY
          </div>

          <SectionLabel>DANGER</SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { void exportBackup(today); }}
              style={{ ...bodyText, flex: 1, padding: '8px 0', background: 'none', border: '1px solid var(--border)', color: 'var(--text-mid)', cursor: 'pointer' }}
            >
              EXPORT JSON
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ ...bodyText, flex: 1, padding: '8px 0', background: 'none', border: '1px solid var(--ember)', color: 'var(--ember)', cursor: 'pointer' }}
            >
              IMPORT JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file !== undefined && window.confirm('REPLACE ALL DATA? THIS CANNOT BE UNDONE.')) {
                  void importBackup(file);
                }
                e.currentTarget.value = '';
              }}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
