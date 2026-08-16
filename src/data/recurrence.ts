// data/recurrence.ts — quest recurrence engine. Pure functions over day keys.
import type { Recurrence } from '../core/types';
import { daysBetween, eachDay, parseDay, weekdayOf } from '../core/dates';

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']; // index = weekday - 1
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Last day-of-month number (28..31) for the month containing `day`. */
function lastDayOfMonth(day: string): number {
  const d = parseDay(day);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function isScheduled(rec: Recurrence, day: string): boolean {
  switch (rec.type) {
    case 'everyDay':
      return true;
    case 'weekdays':
      return weekdayOf(day) <= 5;
    case 'weekends':
      return weekdayOf(day) >= 6;
    case 'daysOfWeek':
      return rec.days.includes(weekdayOf(day));
    case 'everyN': {
      const diff = daysBetween(rec.anchor, day);
      return diff >= 0 && diff % rec.n === 0;
    }
    case 'perWeek':
      // Weekly goal: materializes EVERY day as optional; weekly accounting is separate.
      return true;
    case 'monthly': {
      const dom = parseDay(day).getDate();
      // Clamp to last day of short months (31st schedules on Feb 28/29, Sep 30, …).
      return dom === rec.dayOfMonth || (dom === lastDayOfMonth(day) && rec.dayOfMonth > dom);
    }
    case 'oneTime':
      return rec.date === day;
  }
}

export function scheduledDatesInRange(rec: Recurrence, from: string, to: string): string[] {
  return eachDay(from, to).filter((day) => isScheduled(rec, day));
}

export function scheduleLabel(rec: Recurrence): string {
  switch (rec.type) {
    case 'everyDay':
      return 'EVERY DAY';
    case 'weekdays':
      return 'WEEKDAYS';
    case 'weekends':
      return 'WEEKENDS';
    case 'daysOfWeek':
      return [...rec.days].sort((a, b) => a - b).map((d) => DAY_NAMES[d - 1]).join('·');
    case 'everyN':
      return `EVERY ${rec.n} DAYS`;
    case 'perWeek':
      return `${rec.times}× PER WEEK`;
    case 'monthly':
      return `MONTHLY · DAY ${rec.dayOfMonth}`;
    case 'oneTime': {
      const d = parseDay(rec.date);
      return `ONCE · ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    }
  }
}
