// DaySeal — full-screen `DAY COMPLETE · {score}% · {rank} RANK · +{xp} XP ·
// {streak} DAY STREAK`, shown when a daySeal effect arrives (midnight rollover
// or first open of a new day). Tap anywhere to dismiss.
import { RankDiamond } from '../atoms';
import type { Rank } from '../../core/types';

export default function DaySeal({
  date,
  score,
  rank,
  xp,
  streak,
  onDismiss,
}: {
  date: string;
  score: number;
  rank: Rank;
  xp: number;
  streak: number;
  onDismiss: () => void;
}) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(5,7,5,.94)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        cursor: 'pointer',
        animation: 'oath-fx-in 220ms ease-out',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-label)',
          fontSize: 7,
          letterSpacing: '0.3em',
          color: 'var(--text-faint)',
        }}
      >
        {date}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-title)',
          fontSize: 44,
          color: 'var(--neon)',
          textShadow: '0 0 12px rgba(70,255,125,.5)',
        }}
      >
        DAY COMPLETE
      </div>
      <RankDiamond rank={rank} size={56} />
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 24, color: 'var(--text-hi)' }}>
        {score}% · {rank} RANK
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 22, color: 'var(--text-mid)' }}>
        +{xp} XP · {streak} DAY STREAK
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: 'var(--font-label)',
          fontSize: 6,
          letterSpacing: '0.3em',
          color: 'var(--text-low)',
        }}
      >
        TAP TO CONTINUE
      </div>
      <style>{`@keyframes oath-fx-in{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}
