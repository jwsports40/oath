import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useOath } from '../../app/store';
import { ARMOR_AGES, TITLES } from '../../core/types';
import { Icon, PageFrame, Panel, SectionLabel, SegmentedBar } from '../atoms';
import Knight from '../knight/Knight';
import Armory from './Armory';
import CampaignCalendar from './CampaignCalendar';
import SettingsPanel from './SettingsPanel';

const bodyText: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 18 };

/**
 * NEXT line under the XP bar: the next armor age or title within 10 levels,
 * else the raw XP remaining to the next level.
 */
function nextLine(level: number, into: number, next: number): string {
  const candidates: { lv: number; name: string }[] = [];
  const age = ARMOR_AGES.find(([lv]) => lv > level);
  if (age !== undefined) candidates.push({ lv: age[0], name: `${age[1]} ARMOR` });
  const title = TITLES.filter(([lv]) => lv > level).sort((a, b) => a[0] - b[0])[0];
  if (title !== undefined) candidates.push({ lv: title[0], name: title[1].toUpperCase() });
  candidates.sort((a, b) => a.lv - b.lv);
  const soon = candidates[0];
  if (soon !== undefined && soon.lv - level <= 10) {
    return `NEXT: LV ${soon.lv} — ${soon.name}`;
  }
  return `NEXT: LV ${level + 1} — +${(next - into).toLocaleString()} XP`;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: 1,
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        padding: '8px 0',
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.2em', color: 'var(--text-faint)' }}>
        {label}
      </div>
      <div style={{ ...bodyText, fontSize: 26, color: 'var(--neon)', textShadow: '0 0 6px rgba(70,255,125,0.45)' }}>
        {value}
      </div>
    </div>
  );
}

function StreakRow({ label, current, best }: { label: string; current: number; best: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ ...bodyText, color: 'var(--text-mid)' }}>{label}</span>
      <span style={{ ...bodyText, color: 'var(--text-hi)' }}>
        {current} <span style={{ color: 'var(--text-faint)' }}>/ BEST {best}</span>
      </span>
    </div>
  );
}

/** HERO tab (spec §4): knight stage, stats, armory, campaign calendar, deeds, streaks. */
export default function HeroScreen() {
  const character = useOath((s) => s.character);
  const vigor = useOath((s) => s.vigor);
  const vigorBand = useOath((s) => s.vigorBand);
  const streaks = useOath((s) => s.streaks);
  const perQuestStreaks = useOath((s) => s.perQuestStreaks);
  const templates = useOath((s) => s.templates);
  const achievements = useOath((s) => s.achievements);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const questStreaks = templates
    .map((t) => ({ id: t.id, name: t.name, streak: perQuestStreaks[t.id] ?? 0 }))
    .filter((q) => q.streak > 0)
    .sort((a, b) => b.streak - a.streak);

  return (
    <PageFrame title="Hero">
      <button
        aria-label="settings"
        onClick={() => setSettingsOpen(true)}
        style={{
          position: 'absolute', top: 10, right: 12, zIndex: 5,
          background: 'none', border: 'none', color: 'var(--text-mid)',
          cursor: 'pointer', padding: 4,
        }}
      >
        <Icon name="gear" size={20} />
      </button>

      <Panel>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Knight pose="full" level={character.level} vigorBand={vigorBand} size={200} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.2em',
            color: 'var(--text-mid)', textAlign: 'center', marginTop: 8,
          }}
        >
          WORLD: {vigorBand} · VIGOR {vigor}
        </div>
      </Panel>

      <div style={{ ...bodyText, fontSize: 24, color: 'var(--text-hi)', margin: '12px 0 8px', textAlign: 'center' }}>
        LV {character.level} — {character.title.toUpperCase()}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <StatTile label="STR" value={character.str} />
        <StatTile label="VIT" value={character.vit} />
        <StatTile label="WIL" value={character.wil} />
      </div>

      <div style={{ marginTop: 12 }}>
        <SegmentedBar value={character.into} max={character.next} segments={12} />
        <div style={{ ...bodyText, color: 'var(--text-mid)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>{character.into.toLocaleString()} / {character.next.toLocaleString()} XP</span>
          <span style={{ color: 'var(--text-low)' }}>
            {nextLine(character.level, character.into, character.next)}
          </span>
        </div>
      </div>

      <Armory />

      <CampaignCalendar />

      <section>
        <SectionLabel>DEEDS</SectionLabel>
        <Panel>
          {achievements.map((a) => (
            <div key={a.id} style={{ padding: '5px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ ...bodyText, color: a.unlockedAt !== undefined ? 'var(--neon)' : 'var(--text-hi)' }}>
                  {a.name}
                </span>
                <span style={{ ...bodyText, color: 'var(--text-faint)' }}>
                  {a.unlockedAt !== undefined
                    ? `SEALED ${a.unlockedAt.slice(0, 10)}`
                    : `${Math.min(a.progress, a.target)}/${a.target}`}
                </span>
              </div>
              <div style={{ ...bodyText, color: 'var(--text-low)', marginBottom: 3 }}>{a.desc.toUpperCase()}</div>
              <SegmentedBar value={Math.min(a.progress, a.target)} max={a.target} segments={10} />
            </div>
          ))}
        </Panel>
      </section>

      <section>
        <SectionLabel>STREAKS</SectionLabel>
        <Panel>
          <StreakRow label="OVERALL" current={streaks.overall} best={streaks.overallBest} />
          <StreakRow label="PERFECT" current={streaks.perfect} best={streaks.perfectBest} />
          <StreakRow label="S-RANK" current={streaks.sRank} best={streaks.sRankBest} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ ...bodyText, color: 'var(--text-mid)' }}>EMBERS</span>
            <span style={{ ...bodyText, color: streaks.embers > 0 ? 'var(--neon)' : 'var(--text-faint)' }}>
              {streaks.embers > 0 ? '◆'.repeat(streaks.embers) : '—'}
            </span>
          </div>
          {questStreaks.length > 0 && (
            <>
              <SectionLabel>PER-QUEST</SectionLabel>
              {questStreaks.map((q) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <span style={{ color: 'var(--neon)', display: 'inline-flex' }}>
                    <Icon name="flame" size={16} />
                  </span>
                  <span style={{ ...bodyText, flex: 1, color: 'var(--text-mid)' }}>{q.name}</span>
                  <span style={{ ...bodyText, color: 'var(--text-hi)' }}>{q.streak}</span>
                </div>
              ))}
            </>
          )}
        </Panel>
      </section>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </PageFrame>
  );
}
