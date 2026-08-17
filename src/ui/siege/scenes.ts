// Villain battle scenes, generation order = ladder order (VILLAINS index).
import { VILLAINS } from '../../game/villains';

const SCENES = import.meta.glob('./scenes/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export function sceneFor(villainKey: string | undefined): string | undefined {
  if (villainKey === undefined) return undefined;
  const idx = VILLAINS.findIndex((v) => v.key === villainKey);
  if (idx < 0) return undefined;
  return SCENES[`./scenes/scene-${String(idx + 1).padStart(2, '0')}.webp`];
}
