// Tests for the pure notification planner (Task 20). The impure timer/permission
// wiring is browser-only and exercised manually; every planning rule lives here.
import { describe, it, expect } from 'vitest';
import { planNotifications, MAX_PER_DAY, type NotifyState, type Planned } from '../notify';
import { parseDay } from '../../core/dates';
import type {
  QuestInstance, QuestTemplate, Rank, StreakState, UserSettings, WorkoutProgram,
} from '../../core/types';

const TODAY = '2026-08-17'; // Monday

function at(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = parseDay(TODAY);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function noon(): Date { return new Date(at('12:00')); }

function inst(partial: Partial<QuestInstance> & { id: string; name: string }): QuestInstance {
  return {
    templateId: `tpl-${partial.id}`, date: TODAY, categoryId: 'body',
    difficulty: 'easy', kind: 'binary', main: false, optional: false,
    status: 'todo', progress: 0,
    ...partial,
  };
}

function tpl(partial: Partial<QuestTemplate> & { id: string; name: string }): QuestTemplate {
  return {
    categoryId: 'body', difficulty: 'easy', kind: 'binary',
    main: false, optional: false, recurrence: { type: 'everyDay' },
    reminders: [], createdAt: '2026-08-01T00:00:00.000Z',
    ...partial,
  };
}

const STREAKS: StreakState = {
  overall: 12, overallBest: 12, perfect: 0, perfectBest: 0,
  sRank: 0, sRankBest: 0, embers: 1, cPlusRun: 0,
};

const SETTINGS: UserSettings = {
  units: 'oz', sound: true, haptics: true, crt: true, fxIntensity: 'full',
  resetHour: 0, quietHours: [22, 8],
  notifications: {
    questReminders: true, eveningSweep: true, threshold: true,
    streakGuard: true, workout: true, sweepTime: '20:00',
  },
};

const PPL: WorkoutProgram = {
  id: 'ppl', name: 'PPL', active: true,
  days: [{ id: 'push', name: 'PUSH', weekday: [1], exercises: [] }],
};

/** Sample day: GYM (workout, todo, reminder 17:00), WATER (quantity 64/128),
 *  MORNING ROUTINE (done, reminder would be 13:00), WALK (optional todo). */
function sampleState(): NotifyState {
  return {
    today: TODAY,
    instances: [
      inst({ id: 'gym', name: 'GYM', kind: 'workout', main: true, difficulty: 'hard' }),
      inst({ id: 'water', name: 'WATER', kind: 'quantity', difficulty: 'medium', progress: 64, target: 128, unit: 'oz' }),
      inst({ id: 'routine', name: 'MORNING ROUTINE', status: 'done', progress: 1 }),
      inst({ id: 'walk', name: 'WALK', optional: true }),
    ],
    templates: [
      tpl({ id: 'tpl-gym', name: 'GYM', kind: 'workout', main: true, difficulty: 'hard', reminders: ['17:00'] }),
      tpl({ id: 'tpl-water', name: 'WATER', kind: 'quantity', difficulty: 'medium', target: 128, unit: 'oz' }),
      tpl({ id: 'tpl-routine', name: 'MORNING ROUTINE', reminders: ['13:00'] }),
      tpl({ id: 'tpl-walk', name: 'WALK', optional: true }),
    ],
    streaks: { ...STREAKS },
    live: { score: 34, rank: 'F' as Rank },
    settings: { ...SETTINGS, notifications: { ...SETTINGS.notifications } },
    programs: [PPL],
  };
}

function bodies(planned: Planned[]): string[] { return planned.map((p) => p.body); }

describe('planNotifications — sample day', () => {
  it('plans the day capped at 4, sorted by time, with exact in-world copy', () => {
    const planned = planNotifications(sampleState(), noon());
    expect(MAX_PER_DAY).toBe(4);
    // 5 candidates (workout 16:00, quest 17:00, threshold 18:00, sweep 20:00,
    // streak guard 22:00) → capped to the first 4 by time.
    expect(planned).toHaveLength(4);
    expect(planned.map((p) => p.type)).toEqual(['workout', 'quest', 'threshold', 'sweep']);
    expect(planned.map((p) => p.at)).toEqual([at('16:00'), at('17:00'), at('18:00'), at('20:00')]);
    expect(bodies(planned)).toEqual([
      'PUSH quest is available.',
      'Your GYM quest remains unfinished.',
      '64 oz remain on WATER.',
      '2 quests stand between you and Rank D.',
    ]);
  });

  it('never reminds about a quest that is already done', () => {
    // MORNING ROUTINE has a 13:00 reminder in the future but status done.
    const planned = planNotifications(sampleState(), noon());
    expect(bodies(planned).some((b) => b.includes('MORNING ROUTINE'))).toBe(false);
  });

  it('drops notifications whose time has already passed', () => {
    const planned = planNotifications(sampleState(), new Date(at('19:00')));
    expect(planned.map((p) => p.type)).toEqual(['sweep', 'streakGuard']);
  });
});

describe('planNotifications — streak guard', () => {
  it('fires at the 22:00 quiet-hours boundary when the cap allows', () => {
    const state = sampleState();
    state.settings.notifications.workout = false; // frees a cap slot
    const planned = planNotifications(state, noon());
    const guard = planned.find((p) => p.type === 'streakGuard');
    expect(guard).toBeDefined();
    expect(guard?.at).toBe(at('22:00'));
    expect(guard?.body).toBe('The 12-day streak ends at midnight.');
  });

  it('is silent when the streak is short or the day already projects ≥ C', () => {
    const short = sampleState();
    short.settings.notifications.workout = false;
    short.streaks.overall = 6;
    expect(planNotifications(short, noon()).some((p) => p.type === 'streakGuard')).toBe(false);
    const safe = sampleState();
    safe.settings.notifications.workout = false;
    safe.live = { score: 72, rank: 'B' };
    expect(planNotifications(safe, noon()).some((p) => p.type === 'streakGuard')).toBe(false);
  });
});

describe('planNotifications — quiet hours', () => {
  it('suppresses reminders strictly inside quiet hours (late night and early morning)', () => {
    const state = sampleState();
    state.templates[0]!.reminders = ['23:00']; // GYM, inside 22–8 quiet window
    let planned = planNotifications(state, noon());
    expect(planned.some((p) => p.type === 'quest')).toBe(false);

    state.templates[0]!.reminders = ['07:30']; // before 8:00, still quiet
    planned = planNotifications(state, new Date(at('06:00')));
    expect(planned.some((p) => p.type === 'quest')).toBe(false);
  });
});

describe('planNotifications — per-type toggles', () => {
  it('each toggle gates its type', () => {
    const state = sampleState();
    state.settings.notifications = {
      questReminders: false, eveningSweep: false, threshold: false,
      streakGuard: false, workout: false, sweepTime: '20:00',
    };
    expect(planNotifications(state, noon())).toHaveLength(0);
  });
});

describe('planNotifications — sweep and threshold conditions', () => {
  it('skips the sweep when no required quests remain', () => {
    const state = sampleState();
    state.instances = state.instances.map((i) => (
      i.optional ? i : { ...i, status: 'done' as const, progress: i.target ?? 1 }
    ));
    const planned = planNotifications(state, noon());
    expect(planned.some((p) => p.type === 'sweep')).toBe(false);
    expect(planned.some((p) => p.type === 'threshold')).toBe(false);
  });

  it('names the next rank above the live projection in the sweep', () => {
    const state = sampleState();
    state.live = { score: 82, rank: 'A' };
    const sweep = planNotifications(state, noon()).find((p) => p.type === 'sweep');
    expect(sweep?.body).toBe('2 quests stand between you and Rank S.');
  });
});
