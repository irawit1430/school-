/**
 * Leave dates, read as the school's calendar has them.
 *
 * The API sends two things for each end of a leave. `startDate` is an instant, midnight in
 * the school's timezone, so the 20th in IST arrives as `2026-08-19T18:30:00.000Z`, and
 * `endDate` is the last millisecond of the end day. Formatting those in the browser's
 * timezone is only right when the browser happens to be in the school's: anywhere else a
 * one-day leave on the 20th read as the 19th to the 20th. `startDay` and `endDay` are the
 * calendar dates the server derived when the request was filed, so they are the answer.
 *
 * Rows filed before the server kept those have only the instants. They are converted in
 * the school's timezone, exactly as the backend's own leaveWorkflows.existingValue() does.
 */

/** The backend's default school timezone (schoolTime.js DEFAULT_ZONE). */
const DEFAULT_SCHOOL_ZONE = 'Asia/Kolkata';

export interface LeaveDates {
  startDate: string;
  endDate: string;
  startDay?: string | null;
  endDay?: string | null;
  /** The school's timezone when the leave was filed. Null on rows that predate it. */
  timezone?: string | null;
}

/** The `YYYY-MM-DD` an instant falls on in `zone`, or null if it can't be read. */
export const calendarDay = (instant: string, zone: string): string | null => {
  const at = new Date(instant);
  if (!Number.isFinite(at.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(at);
    const get = (type: string) => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    // An unknown zone name: fall back to the default rather than dropping the date.
    return zone === DEFAULT_SCHOOL_ZONE ? null : calendarDay(instant, DEFAULT_SCHOOL_ZONE);
  }
};

/** A leave's first and last school-calendar day, as `YYYY-MM-DD`. */
export const leaveDays = (leave: LeaveDates): { start: string | null; end: string | null } => {
  const zone = leave.timezone || DEFAULT_SCHOOL_ZONE;
  return {
    start: leave.startDay || calendarDay(leave.startDate, zone),
    end: leave.endDay || calendarDay(leave.endDate, zone),
  };
};

/**
 * A `YYYY-MM-DD` in the viewer's date format.
 *
 * Built as local midnight on that day, so the browser's timezone can't move it the way
 * `new Date('2026-08-20')` (UTC midnight) would west of Greenwich.
 */
export const formatDay = (day: string | null): string => {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!m) return 'Unknown date';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString();
};
