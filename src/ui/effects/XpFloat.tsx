// XpFloat — `+{n} XP` rises and fades over the knight bust (or an optional
// labelled amber variant for PR announcements). Pointer-events none; the
// EffectsLayer pops the queue when the duration elapses.
export default function XpFloat({
  amount,
  label,
  amber = false,
  duration = 700,
}: {
  amount: number;
  label?: string;
  amber?: boolean;
  duration?: number;
}) {
  const color = amber ? 'var(--amber)' : 'var(--neon)';
  const glow = amber ? 'rgba(232,181,77,.6)' : 'rgba(70,255,125,.6)';
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        top: 140,
        transform: 'translateX(-50%)',
        zIndex: 300,
        pointerEvents: 'none',
        fontFamily: 'var(--font-body)',
        fontSize: 26,
        color,
        textShadow: `0 0 8px ${glow}`,
        whiteSpace: 'nowrap',
        animation: `oath-xp-float ${duration}ms ease-out forwards`,
      }}
    >
      {label !== undefined ? `${label} · ` : ''}+{amount} XP
      <style>{`@keyframes oath-xp-float{from{opacity:1;transform:translate(-50%,0)}70%{opacity:1}to{opacity:0;transform:translate(-50%,-42px)}}`}</style>
    </div>
  );
}
