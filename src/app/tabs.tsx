export type Tab = 'today' | 'quests' | 'train' | 'fuel' | 'hero';

export type IconName =
  | 'diamond'
  | 'list'
  | 'dumbbell'
  | 'flask'
  | 'helm'
  | 'plus'
  | 'gear'
  | 'flame'
  | 'skull'
  | 'drop'
  | 'check';

export const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'TODAY', icon: 'diamond' },
  { id: 'quests', label: 'QUESTS', icon: 'list' },
  { id: 'train', label: 'TRAIN', icon: 'dumbbell' },
  { id: 'fuel', label: 'FUEL', icon: 'flask' },
  { id: 'hero', label: 'HERO', icon: 'helm' },
];
