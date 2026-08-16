/** CRT overlay: 2px scanlines + radial vignette. Fixed, click-through. */
export default function CrtOverlay() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 200,
        background: [
          'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 2px)',
          'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.35) 100%)',
        ].join(', '),
      }}
    />
  );
}
