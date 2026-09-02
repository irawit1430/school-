/**
 * Recurring schedule ("Run") helpers.
 *
 * A Run is a service on a route: a direction, a wall-clock departure and a weekday
 * pattern. An overnight materialiser turns runs into Trip rows. The rules below decide
 * what an admin is allowed to save, and a run that breaks any of them either cannot
 * become a trip or produces one nobody expected.
 */

export type Direction = 'TO_SCHOOL' | 'FROM_SCHOOL';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

export const DIRECTION_LABELS: Record<Direction, string> = {
  TO_SCHOOL: 'To school',
  FROM_SCHOOL: 'From school',
};

export interface RunDraft {
  name?: string;
  direction?: Direction;
  departure?: string;
  busId?: string;
  driverId?: string;
  startDate?: string;
  endDate?: string;
  mon?: boolean; tue?: boolean; wed?: boolean; thu?: boolean;
  fri?: boolean; sat?: boolean; sun?: boolean;
}

export const selectedDays = (run: RunDraft): DayKey[] =>
  DAY_KEYS.filter(d => Boolean(run[d]));

/** "Mon–Fri", "Weekends", "Mon, Wed, Fri", "Never" — a pattern read at a glance. */
export const describeDays = (run: RunDraft): string => {
  const days = selectedDays(run);
  if (days.length === 0) return 'Never';
  if (days.length === 7) return 'Every day';

  const isWeekdays = days.length === 5 && days.every(d => d !== 'sat' && d !== 'sun');
  if (isWeekdays) return 'Mon–Fri';

  const isWeekend = days.length === 2 && days.includes('sat') && days.includes('sun');
  if (isWeekend) return 'Weekends';

  // Collapse any run of three or more consecutive days into a range.
  const out: string[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (
      j + 1 < days.length &&
      DAY_KEYS.indexOf(days[j + 1]) === DAY_KEYS.indexOf(days[j]) + 1
    ) j++;
    out.push(j - i >= 2
      ? `${DAY_LABELS[days[i]]}–${DAY_LABELS[days[j]]}`
      : days.slice(i, j + 1).map(d => DAY_LABELS[d]).join(', '));
    i = j + 1;
  }
  return out.join(', ');
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Everything wrong with a draft, in the order an admin would fix it.
 *
 * Crew is required because `Trip` requires a bus and a driver: a run without both is
 * accepted, sits in the list looking scheduled, and silently produces nothing. The
 * school finds out at 07:00 that a route has no bus.
 */
export const validateRun = (run: RunDraft): string[] => {
  const problems: string[] = [];

  if (!run.name?.trim()) problems.push('Give the run a name.');
  if (!run.direction) problems.push('Choose a direction.');

  if (!run.departure) problems.push('Set a departure time.');
  else if (!TIME_RE.test(run.departure)) problems.push('Departure must be a time like 07:15.');

  if (!run.busId) problems.push('Assign a bus — a run without one cannot become a trip.');
  if (!run.driverId) problems.push('Assign a driver — a run without one cannot become a trip.');

  if (selectedDays(run).length === 0) problems.push('Pick at least one day of the week.');

  if (!run.startDate || !DATE_RE.test(run.startDate)) problems.push('Set a start date.');
  if (!run.endDate || !DATE_RE.test(run.endDate)) problems.push('Set an end date.');

  // String compare is correct for YYYY-MM-DD and avoids dragging a timezone into a
  // question that has nothing to do with one.
  if (run.startDate && run.endDate && DATE_RE.test(run.startDate) && DATE_RE.test(run.endDate)
      && run.endDate < run.startDate) {
    problems.push('The end date is before the start date.');
  }

  return problems;
};

export type RunPayload = {
  name?: string; direction?: Direction; departure?: string;
  busId?: string; driverId?: string; startDate?: string; endDate?: string;
} & Record<DayKey, boolean>;

/** Only the fields the API accepts, so a stray `id` or `hasCrew` never gets posted back. */
export const toRunPayload = (run: RunDraft): RunPayload => ({
  name: run.name?.trim(),
  direction: run.direction,
  departure: run.departure,
  busId: run.busId || undefined,
  driverId: run.driverId || undefined,
  startDate: run.startDate,
  endDate: run.endDate,
  ...(Object.fromEntries(DAY_KEYS.map(d => [d, Boolean(run[d])])) as Record<DayKey, boolean>),
});
