import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import type { Recurrence } from '../../core/types';
import { isScheduled, scheduledDatesInRange, scheduleLabel } from '../recurrence';

const MWF: Recurrence = { type: 'daysOfWeek', days: [1, 3, 5] };

describe('isScheduled', () => {
  it('everyDay is always scheduled', () => {
    expect(isScheduled({ type: 'everyDay' }, '2026-08-17')).toBe(true);
    expect(isScheduled({ type: 'everyDay' }, '2026-08-16')).toBe(true);
  });

  it('weekdays: Mon–Fri only', () => {
    expect(isScheduled({ type: 'weekdays' }, '2026-08-17')).toBe(true); // Mon
    expect(isScheduled({ type: 'weekdays' }, '2026-08-21')).toBe(true); // Fri
    expect(isScheduled({ type: 'weekdays' }, '2026-08-16')).toBe(false); // Sun
    expect(isScheduled({ type: 'weekdays' }, '2026-08-15')).toBe(false); // Sat
  });

  it('weekends: Sat/Sun only', () => {
    expect(isScheduled({ type: 'weekends' }, '2026-08-15')).toBe(true); // Sat
    expect(isScheduled({ type: 'weekends' }, '2026-08-16')).toBe(true); // Sun
    expect(isScheduled({ type: 'weekends' }, '2026-08-17')).toBe(false); // Mon
  });

  it('daysOfWeek MWF: Mon true, Tue false', () => {
    expect(isScheduled(MWF, '2026-08-17')).toBe(true); // Mon
    expect(isScheduled(MWF, '2026-08-18')).toBe(false); // Tue
    expect(isScheduled(MWF, '2026-08-19')).toBe(true); // Wed
    expect(isScheduled(MWF, '2026-08-21')).toBe(true); // Fri
  });

  it('everyN n=3 anchor 2026-08-10: 10/13/16 true, before anchor false', () => {
    const rec: Recurrence = { type: 'everyN', n: 3, anchor: '2026-08-10' };
    expect(isScheduled(rec, '2026-08-10')).toBe(true);
    expect(isScheduled(rec, '2026-08-13')).toBe(true);
    expect(isScheduled(rec, '2026-08-16')).toBe(true);
    expect(isScheduled(rec, '2026-08-11')).toBe(false);
    expect(isScheduled(rec, '2026-08-12')).toBe(false);
    expect(isScheduled(rec, '2026-08-09')).toBe(false); // before anchor
  });

  it('perWeek is scheduled every day (materializes daily as optional)', () => {
    const rec: Recurrence = { type: 'perWeek', times: 3 };
    expect(isScheduled(rec, '2026-08-16')).toBe(true);
    expect(isScheduled(rec, '2026-08-17')).toBe(true);
  });

  it('monthly matches day-of-month', () => {
    const rec: Recurrence = { type: 'monthly', dayOfMonth: 15 };
    expect(isScheduled(rec, '2026-08-15')).toBe(true);
    expect(isScheduled(rec, '2026-08-14')).toBe(false);
  });

  it('monthly 31 clamps to last day of short months', () => {
    const rec: Recurrence = { type: 'monthly', dayOfMonth: 31 };
    expect(isScheduled(rec, '2026-09-30')).toBe(true); // Sep has 30 days
    expect(isScheduled(rec, '2026-09-29')).toBe(false);
    expect(isScheduled(rec, '2026-08-31')).toBe(true); // Aug has 31
    expect(isScheduled(rec, '2026-08-30')).toBe(false);
    expect(isScheduled(rec, '2027-02-28')).toBe(true); // Feb 2027 has 28 days
    expect(isScheduled(rec, '2028-02-29')).toBe(true); // Feb 2028 leap
    expect(isScheduled(rec, '2028-02-28')).toBe(false);
  });

  it('oneTime matches only the exact date', () => {
    const rec: Recurrence = { type: 'oneTime', date: '2026-08-20' };
    expect(isScheduled(rec, '2026-08-20')).toBe(true);
    expect(isScheduled(rec, '2026-08-21')).toBe(false);
  });
});

describe('scheduledDatesInRange', () => {
  it('MWF over 2026-08-10..16 → 3 dates', () => {
    const dates = scheduledDatesInRange(MWF, '2026-08-10', '2026-08-16');
    expect(dates).toEqual(['2026-08-10', '2026-08-12', '2026-08-14']);
    expect(dates.length).toBe(3);
  });

  it('everyN in range respects anchor', () => {
    const rec: Recurrence = { type: 'everyN', n: 3, anchor: '2026-08-10' };
    expect(scheduledDatesInRange(rec, '2026-08-08', '2026-08-16')).toEqual([
      '2026-08-10', '2026-08-13', '2026-08-16',
    ]);
  });
});

describe('scheduleLabel', () => {
  it('renders the exact spec strings', () => {
    expect(scheduleLabel({ type: 'everyDay' })).toBe('EVERY DAY');
    expect(scheduleLabel({ type: 'weekdays' })).toBe('WEEKDAYS');
    expect(scheduleLabel({ type: 'weekends' })).toBe('WEEKENDS');
    expect(scheduleLabel(MWF)).toBe('MON·WED·FRI');
    expect(scheduleLabel({ type: 'everyN', n: 3, anchor: '2026-08-10' })).toBe('EVERY 3 DAYS');
    expect(scheduleLabel({ type: 'perWeek', times: 3 })).toBe('3× PER WEEK');
    expect(scheduleLabel({ type: 'monthly', dayOfMonth: 15 })).toBe('MONTHLY · DAY 15');
    expect(scheduleLabel({ type: 'oneTime', date: '2026-08-20' })).toBe('ONCE · AUG 20');
  });

  it('daysOfWeek label sorts and names all days', () => {
    expect(scheduleLabel({ type: 'daysOfWeek', days: [7, 6] })).toBe('SAT·SUN');
    expect(scheduleLabel({ type: 'daysOfWeek', days: [2, 4] })).toBe('TUE·THU');
  });
});

describe('unscheduled instances are pruned, not graded', () => {
  it('editing a quest off a day removes its untouched instance on re-materialize', async () => {
    const { db } = await import('../db');
    const { seedIfEmpty } = await import('../seed');
    const { ensureDay } = await import('../lifecycle');
    const { dayKey } = await import('../../core/dates');
    await db.delete();
    await db.open();
    await seedIfEmpty();
    const today = dayKey(new Date());
    await ensureDay(today);
    const routine = (await db.templates.toArray()).find((t) => t.name === 'MORNING ROUTINE')!;
    const inst = await db.instances.where('[templateId+date]').equals([routine.id, today]).first();
    expect(inst).toBeDefined();
    // Template edited to never occur on today's weekday.
    const wd = ((new Date(`${today}T12:00:00`).getDay() + 6) % 7) + 1; // ISO 1..7
    await db.templates.put({ ...routine, recurrence: { type: 'daysOfWeek', days: [wd === 1 ? 2 : 1] } });
    await ensureDay(today);
    const after = await db.instances.where('[templateId+date]').equals([routine.id, today]).first();
    expect(after).toBeUndefined();
  });
});
