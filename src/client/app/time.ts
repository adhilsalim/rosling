/* Time formatting shared by the footer timer and the phone remote. */

/** 5s, 1m 5s, 1h 0m 5s: no leading zero units. */
export function dur(ms: number): string {
  let s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  s %= 60;
  return (h ? h + 'h ' : '') + (h || m ? m + 'm ' : '') + s + 's';
}

/** A limit of 0 means "no planned time". */
export const over = (ms: number, limitMs: number) => limitMs > 0 && ms > limitMs;

/** Past its planned time, a timer shows only the extra time: "+2m 10s". */
export const elapsed = (ms: number, limitMs: number) => (over(ms, limitMs) ? '+' + dur(ms - limitMs) : dur(ms));

/** 09:41 AM */
export function clock(d = new Date()): string {
  const h = d.getHours() % 12 || 12, m = d.getMinutes();
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + (d.getHours() < 12 ? ' AM' : ' PM');
}

/** Every 10 s the timer slides up to the time of day for 3 s. */
export const CLOCK_EVERY = 10, CLOCK_FOR = 3;
export const showsClock = (talkMs: number) => {
  const s = Math.floor(talkMs / 1000);
  return s >= CLOCK_EVERY && s % CLOCK_EVERY < CLOCK_FOR;
};
