import type { ReactNode } from 'react';
import type { IconName } from '../../app/tabs';

export type { IconName };

const STROKES: Record<IconName, ReactNode> = {
  diamond: <path d="M12 3l9 9-9 9-9-9z" />,
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 5h2v2H3zM3 11h2v2H3zM3 17h2v2H3z" fill="currentColor" strokeWidth={0} />
    </>
  ),
  dumbbell: (
    <>
      <path d="M8 12h8" />
      <rect x={5} y={7} width={3} height={10} />
      <rect x={16} y={7} width={3} height={10} />
      <path d="M2 10v4M22 10v4" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9v3h14v-3l-5-9V3" />
      <path d="M7 17h10" />
    </>
  ),
  helm: (
    <>
      <path d="M5 20v-9a7 7 0 0 1 14 0v9" />
      <path d="M9 14h6" />
      <path d="M12 14v6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  gear: (
    <>
      <rect x={8} y={8} width={8} height={8} />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" />
    </>
  ),
  flame: (
    <path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 1.5-5 3-7 .5 1.5 1.5 2.5 3 3z" />
  ),
  skull: (
    <>
      <path d="M5 11a7 7 0 0 1 14 0v4h-2v3h-2v3H9v-3H7v-3H5z" />
      <path d="M8.5 10h2v2h-2zM13.5 10h2v2h-2z" fill="currentColor" strokeWidth={0} />
      <path d="M11 17v2M13 17v2" />
    </>
  ),
  drop: <path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" />,
  check: <path d="M4 12l5 5L20 6" />,
};

/** 20px geometric stroke icon set (currentColor). */
export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {STROKES[name]}
    </svg>
  );
}
