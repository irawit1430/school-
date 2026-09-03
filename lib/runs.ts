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

// ─── Schedule preview ──────────────────────────────────────
// The preview and the materialiser share one resolver on the server, so these verdicts
// are what will actually happen rather than a second opinion about it. Every non-running
// date carries a `reason` string from the server — render it, never re-derive it, or the
// screen and reality drift the moment the rules change.
export type PreviewStatus =
  | 'RUNNING' | 'SHIFTED' | 'ADDED_EXCEPTION' | 'CANCELLED_EXCEPTION'
  | 'CLOSED_SCHOOL' | 'CLOSED_PLATFORM' | 'OFF_PATTERN' | 'OUT_OF_WINDOW' | 'INACTIVE';

export interface PreviewDate {
  date: string;
  status: PreviewStatus;
  reason?: string | null;
  departure?: string | null;
}

/** Does a bus actually leave on this date? Everything else is a reason it doesn't. */
export const isOperating = (status: PreviewStatus): boolean =>
  status === 'RUNNING' || status === 'SHIFTED' || status === 'ADDED_EXCEPTION';

export const STATUS_LABELS: Record<PreviewStatus, string> = {
  RUNNING: 'Runs',
  SHIFTED: 'Time changed',
  ADDED_EXCEPTION: 'Added',
  CANCELLED_EXCEPTION: 'Cancelled',
  CLOSED_SCHOOL: 'School closed',
  CLOSED_PLATFORM: 'Holiday',
  OFF_PATTERN: 'Not scheduled',
  OUT_OF_WINDOW: 'Outside dates',
  INACTIVE: 'Schedule stopped',
};

/** Tailwind classes per verdict. Operating days read as present; the rest recede. */
export const STATUS_TONES: Record<PreviewStatus, string> = {
  RUNNING: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  SHIFTED: 'bg-amber-50 border-amber-300 text-amber-900',
  ADDED_EXCEPTION: 'bg-sky-50 border-sky-300 text-sky-900',
  CANCELLED_EXCEPTION: 'bg-rose-50 border-rose-200 text-rose-800',
  CLOSED_SCHOOL: 'bg-purple-50 border-purple-200 text-purple-800',
  CLOSED_PLATFORM: 'bg-purple-50 border-purple-200 text-purple-800',
  OFF_PATTERN: 'bg-slate-50 border-slate-200 text-slate-500',
  OUT_OF_WINDOW: 'bg-slate-50 border-slate-200 text-slate-400',
  INACTIVE: 'bg-slate-50 border-slate-200 text-slate-400',
};

/**
 * Why a date can't take an override.
 *
 * Shifting a departure only means something on a day the run operates. Offering it on a
 * platform holiday or a weekday the pattern skips is how an admin sets 09:00 on a date
 * nothing happens and never finds out.
 */
export const overrideBlockedReason = (d: PreviewDate): string | null => {
  if (d.status === 'CLOSED_PLATFORM') return 'Platform holiday — set centrally, not per school';
  if (d.status === 'OUT_OF_WINDOW') return 'Outside this schedule’s start and end dates';
  if (d.status === 'INACTIVE') return 'This schedule has been stopped';
  return null;
};

/**
 * Every date from `from` to `to` inclusive, as YYYY-MM-DD.
 *
 * The calendar API takes one date per request, so a holiday week is a loop rather than a
 * range. Stepping a UTC timestamp by whole days keeps DST out of it — a local-midnight
 * Date advanced by 24h lands on 23:00 the same day twice a year and repeats a date.
 */
export const datesBetween = (from: string, to: string, cap = 62): string[] => {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) return [];
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
    if (out.length >= cap) break;
  }
  return out;
};

/** A closure with no school attached belongs to the platform; a school cannot edit it. */
export const isPlatformClosure = (row: { schoolId?: string | null }): boolean =>
  row.schoolId === null || row.schoolId === undefined;

/**
 * What closing the school on these dates actually does.
 *
 * `tripCount` is only the trips that already exist. For a holiday three weeks out it is
 * legitimately 0 because nothing has materialised yet — reading that as "no impact" is how
 * someone cancels an exam week believing it changed nothing. `runCount` is the number of
 * services that would otherwise have operated, and that is the number worth saying first.
 */
export const describeClosureImpact = (
  impact: { runCount?: number; tripCount?: number } | null | undefined,
): string => {
  const runs = impact?.runCount ?? 0;
  const trips = impact?.tripCount ?? 0;

  if (runs === 0) return 'No schedules operate on these dates, so nothing changes.';

  const head = `${runs} ${runs === 1 ? 'schedule' : 'schedules'} will not operate.`;
  return trips > 0
    ? `${head} ${trips} ${trips === 1 ? 'trip has' : 'trips have'} already been created and will be cancelled now.`
    : `${head} No trips exist for these dates yet, so there is nothing to cancel — they simply will not be created.`;
};

/**
 * The preview rows belonging to one run.
 *
 * `/routes/:id/schedule-preview` covers every run on the route, and the payload has been
 * seen both flat (rows carrying `runId`) and grouped (`{ runId, dates: [...] }`). Reading
 * only one shape means a route with two runs silently shows the wrong run's dates, which
 * is exactly the class of bug that survives a demo with a single run.
 */
export const previewDatesFor = (payload: unknown, runId: string): PreviewDate[] => {
  if (!Array.isArray(payload)) return [];

  const grouped = payload.find(
    (p: any) => p && p.runId === runId && Array.isArray(p.dates),
  ) as any;
  if (grouped) return grouped.dates as PreviewDate[];

  return payload.filter((p: any) => p && p.date && (p.runId === undefined || p.runId === runId));
};
