// core/dates.ts — local-date "day key" utilities. Day keys are LOCAL ISO strings
// 'YYYY-MM-DD'. Week starts Monday. Never use UTC date parts for day keys.

/** Local y-m-d of a Date as 'YYYY-MM-DD'. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a day key to a Date at LOCAL midnight. */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add n days (may be negative) to a day key. */
export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** ISO weekday of a day key: 1=Mon .. 7=Sun. */
export function weekdayOf(key: string): number {
  const js = parseDay(key).getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

/** Day key of the Monday of the week containing `key`. */
export function weekStartOf(key: string): string {
  return addDays(key, 1 - weekdayOf(key));
}

/** Whole days from a to b (b - a); positive when b is after a. */
export function daysBetween(a: string, b: string): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86_400_000); // round guards DST-shifted day lengths
}

/** Roman numeral for a positive integer. */
export function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rest = Math.max(0, Math.floor(n));
  for (const [value, sym] of table) {
    while (rest >= value) { out += sym; rest -= value; }
  }
  return out;
}

/** Inclusive list of day keys from `from` to `to`. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}
