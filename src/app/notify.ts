// app/notify.ts — in-world notification scheduler (Task 20).
//
// WEB CONSTRAINT: true scheduled local notifications are not available to web
// apps in the background (especially iOS Safari). This is a best-effort,
// in-app scheduler: while the app runs, setTimeout timers fire
// `new Notification(title, {body})` when permission is granted, otherwise an
// in-app toast banner. Max 4 per day, suppressed in quiet hours. Documented
// in the README (Task 21).
import { parseDay, weekdayOf } from '../core/dates';
import { RANK_ORDER, rankAtLeast } from '../game/streaks';
import type {
  QuestInstance, QuestTemplate, Rank, StreakState, UserSettings, WorkoutProgram,
} from '../core/types';

export const MAX_PER_DAY = 4;

export type NotificationType = 'quest' | 'sweep' | 'threshold' | 'streakGuard' | 'workout';

export interface Planned {
  key: string;                // stable id — dedupes across replans within a day
  type: NotificationType;
  at: number;                 // epoch ms, local
  title: string;
  body: string;
}

/** The slice of app state the planner reads — the store satisfies it structurally. */
export interface NotifyState {
  today: string;
  instances: QuestInstance[];
  templates: QuestTemplate[];
  streaks: StreakState;
  live: { score: number; rank: Rank };
  settings: UserSettings;
  programs: WorkoutProgram[];
}

const TITLE = 'OATH';
const STREAK_GUARD_TIME = '22:00';
const WORKOUT_TIME = '16:00';

function timeOn(day: string, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = parseDay(day);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

/**
 * Quiet iff STRICTLY inside the window — boundaries fire. With the default
 * [22, 8] the 22:00 streak guard is deliberately at the edge of the night
 * ("ends at midnight" can't wait for morning); 22:01 onward is suppressed.
 */
function inQuietHours(at: number, [start, end]: [number, number]): boolean {
  const d = new Date(at);
  const mins = d.getHours() * 60 + d.getMinutes();
  if (start <= end) return mins > start * 60 && mins < end * 60;
  return mins > start * 60 || mins < end * 60;
}

/**
 * Pure planner: everything still due today, per-type toggles applied,
 * quiet hours suppressed, capped at MAX_PER_DAY earliest-first.
 */
export function planNotifications(state: NotifyState, now: Date): Planned[] {
  const { today, instances, templates, streaks, live, settings, programs } = state;
  const prefs = settings.notifications;
  const candidates: Planned[] = [];

  // Quest reminders at each template's reminder times — only if still todo.
  if (prefs.questReminders) {
    for (const i of instances) {
      if (i.status !== 'todo') continue;
      const t = templates.find((x) => x.id === i.templateId);
      for (const hhmm of t?.reminders ?? []) {
        candidates.push({
          key: `quest:${i.id}:${hhmm}`, type: 'quest', at: timeOn(today, hhmm),
          title: TITLE, body: `Your ${i.name} quest remains unfinished.`,
        });
      }
    }
  }

  // Evening sweep: required quests still standing between you and the next rank.
  if (prefs.eveningSweep) {
    const remaining = instances.filter((i) => !i.optional && i.status === 'todo').length;
    const rankIdx = RANK_ORDER.indexOf(live.rank);
    const nextRank = RANK_ORDER[rankIdx + 1];
    if (remaining > 0 && nextRank !== undefined) {
      candidates.push({
        key: `sweep:${today}`, type: 'sweep', at: timeOn(today, prefs.sweepTime),
        title: TITLE,
        body: `${remaining} quest${remaining === 1 ? '' : 's'} stand between you and Rank ${nextRank}.`,
      });
    }
  }

  // Threshold for quantity quests at 75% of the day elapsed, if under 100%.
  if (prefs.threshold) {
    const hour = (settings.resetHour + 18) % 24; // day runs resetHour→resetHour
    for (const i of instances) {
      if (i.kind !== 'quantity' || i.status !== 'todo') continue;
      if (i.target === undefined || i.target <= 0 || i.progress >= i.target) continue;
      candidates.push({
        key: `threshold:${i.id}`, type: 'threshold',
        at: timeOn(today, `${String(hour).padStart(2, '0')}:00`),
        title: TITLE,
        body: `${i.target - i.progress} ${i.unit ?? ''} remain on ${i.name}.`.replace('  ', ' '),
      });
    }
  }

  // Streak guard at 22:00 — only if overall ≥ 7 and today projects below C.
  if (prefs.streakGuard && streaks.overall >= 7 && !rankAtLeast(live.rank, 'C')) {
    candidates.push({
      key: `guard:${today}`, type: 'streakGuard', at: timeOn(today, STREAK_GUARD_TIME),
      title: TITLE, body: `The ${streaks.overall}-day streak ends at midnight.`,
    });
  }

  // Workout on program days at 16:00 — while the workout quest is still todo.
  if (prefs.workout) {
    const weekday = weekdayOf(today);
    const day = programs.find((p) => p.active)?.days.find((d) => d.weekday.includes(weekday));
    const pending = instances.some((i) => i.kind === 'workout' && i.status === 'todo');
    if (day !== undefined && pending) {
      candidates.push({
        key: `workout:${today}`, type: 'workout', at: timeOn(today, WORKOUT_TIME),
        title: TITLE, body: `${day.name} quest is available.`,
      });
    }
  }

  return candidates
    .filter((c) => c.at > now.getTime() && !inQuietHours(c.at, settings.quietHours))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_PER_DAY);
}

// ─── Impure best-effort delivery (browser only; no-op under node tests) ──────

let timerIds: number[] = [];
let firedDay = '';
let firedCount = 0;
const firedKeys = new Set<string>();

function showToast(title: string, body: string): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:12px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:90', 'max-width:380px', 'width:calc(100% - 32px)',
    'background:var(--panel)', 'border:1px solid var(--neon)',
    'box-shadow:0 0 8px rgba(70,255,125,0.3)', 'padding:10px 14px',
    'font-family:var(--font-body)', 'font-size:18px', 'color:var(--text-hi)',
    'cursor:pointer',
  ].join(';');
  const label = document.createElement('div');
  label.style.cssText = "font-family:var(--font-label);font-size:7px;letter-spacing:0.2em;color:var(--text-faint);margin-bottom:4px";
  label.textContent = title;
  const text = document.createElement('div');
  text.textContent = body;
  el.append(label, text);
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 6000);
}

function fire(p: Planned): void {
  if (firedKeys.has(p.key) || firedCount >= MAX_PER_DAY) return;
  firedKeys.add(p.key);
  firedCount += 1;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(p.title, { body: p.body });
  } else {
    showToast(p.title, p.body);
  }
}

/**
 * (Re)arm today's timers from current state. Idempotent — call after init and
 * after any mutation; already-fired notifications are not repeated and the
 * 4/day cap counts deliveries, not plans.
 */
export function scheduleNotifications(state: NotifyState, now: Date = new Date()): void {
  if (typeof window === 'undefined') return;
  for (const id of timerIds) window.clearTimeout(id);
  timerIds = [];
  if (firedDay !== state.today) {
    firedDay = state.today;
    firedCount = 0;
    firedKeys.clear();
  }
  const budget = Math.max(0, MAX_PER_DAY - firedCount);
  const planned = planNotifications(state, now)
    .filter((p) => !firedKeys.has(p.key))
    .slice(0, budget);
  for (const p of planned) {
    timerIds.push(window.setTimeout(() => { fire(p); }, Math.max(0, p.at - now.getTime())));
  }
}

/** Current system permission, or 'unsupported' where Notification doesn't exist. */
export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Ask the browser for notification permission (Settings button). */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
