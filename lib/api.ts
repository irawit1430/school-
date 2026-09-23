import { CONFIG } from './config';
import { io, Socket } from 'socket.io-client';
import { cachedGet, clearApiCache } from './apiCache';
import { normalizeNotification } from './notifications';
import { parseStudentImportCSV } from './studentImport';
import type { Direction } from './runs';

export { clearApiCache };

export const API_BASE = `${CONFIG.API_BASE_URL}/api`;

// ─── Token / User helpers ──────────────────────────────────
export const getToken = (): string | null => {
  if (typeof window !== 'undefined') return localStorage.getItem('token');
  return null;
};

// Stateless JWT: token lives in localStorage and is sent as a Bearer header.
// (Backend does not use cookies — no server session to sync.)
export const setToken = (t: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', t);
  }
};

export const getUser = (): any => {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem(CONFIG.USER_STORAGE_KEY);
  return u ? JSON.parse(u) : null;
};

export const setUser = (u: any) =>
  localStorage.setItem(CONFIG.USER_STORAGE_KEY, JSON.stringify(u));

export const logoutUser = () => api('/auth/logout', { method: 'POST' });

export const clearAuth = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem(CONFIG.USER_STORAGE_KEY);
  }
  clearSchoolIdCache();
  clearApiCache();
};

// ─── Error class with status + validation issues ───────────
export class ApiError extends Error {
  status: number;
  issues?: Array<{ path: string; message: string }>;
  /**
   * The parsed error body. Some endpoints distinguish two failures that share a status
   * by a machine-readable field the message alone doesn't carry — a 409 from the mapping
   * endpoints is either a stop conflict or `code: "MAPPING_EXISTS"`.
   */
  data?: Record<string, any>;

  constructor(message: string, status: number, issues?: Array<{ path: string; message: string }>, data?: Record<string, any>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
    this.data = data;
  }
}

/**
 * The reason an action failed, in words an admin can act on.
 *
 * ApiError carries the server's message and its field-level validation issues; call
 * sites used to discard both for a fixed string. That turned a conflict — which names
 * the stop a child already occupies — into "please try again", advice guaranteed not
 * to work, and turned unrelated failures into confidently wrong diagnoses.
 */
export const apiErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof ApiError) {
    if (err.issues?.length) return err.issues.map(i => i.message).join('; ');
    if (err.message) return err.message;
  }
  const message = (err as { message?: unknown })?.message;
  return typeof message === 'string' && message ? message : fallback;
};

// ─── Core HTTP wrapper with global error handling ──────────
const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

async function request<T = any>(
  path: string,
  { method = 'GET', body, auth = true }: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err: any) {
    console.warn(`[API Network Error] ${method} ${path}:`, err?.message || err);
    throw new ApiError(err?.message || 'Network request failed', 0);
  }

  // ── Global auth handling: 401 → clear & redirect ──
  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError('Session expired', 401);
  }

  // ── Rate limiting: 429 ──
  if (res.status === 429) {
    throw new ApiError('Too many attempts, please wait a minute.', 429);
  }

  // ── Cross-tenant: 403 ──
  if (res.status === 403) {
    throw new ApiError('Access denied. You do not have permission for this resource.', 403);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // 400 with validation issues
    const err = new ApiError(
      data.error || `HTTP ${res.status}`,
      res.status,
      data.issues,
      data
    );
    throw err;
  }

  return data as T;
}

/**
 * GETs are served from the short cache and deduplicated while in flight; anything else
 * goes straight out and then invalidates everything, because a write can change what any
 * other request would have returned.
 */
async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  if ((opts.method ?? 'GET') !== 'GET') {
    const data = await request<T>(path, opts);
    clearApiCache();
    return data;
  }
  return cachedGet<T>(path, () => request<T>(path, opts));
}

// ─── SchoolId helper ───────────────────────────────────────
// Every fetch resolves the school first, and for a SUPER_ADMIN that meant an extra
// /schools round trip *per call* — a page doing five parallel fetches paid for five
// identical lookups before any of its real requests left. Cached for the session, and
// the in-flight promise is shared so a burst of parallel callers makes one request,
// not five. Cleared on logout, since the next user may belong elsewhere.
let schoolIdCache: string | null = null;
let schoolIdInFlight: Promise<string | null> | null = null;

export const clearSchoolIdCache = () => {
  schoolIdCache = null;
  schoolIdInFlight = null;
};

export const getSchoolId = async (): Promise<string | null> => {
  const user = getUser();
  if (!user) return null;

  if (user.schoolId) return user.schoolId;
  if (schoolIdCache) return schoolIdCache;

  // SUPER_ADMIN fallback — fetch first school
  if (user.role === 'SUPER_ADMIN') {
    if (!schoolIdInFlight) {
      schoolIdInFlight = (async () => {
        try {
          const responseData = await api<any>('/schools');
          const schools = Array.isArray(responseData) ? responseData : responseData.data;
          if (schools && schools.length > 0) {
            schoolIdCache = schools[0].id;
            return schoolIdCache;
          }
          return null;
        } catch {
          return null;
        } finally {
          schoolIdInFlight = null;
        }
      })();
    }
    return schoolIdInFlight;
  }

  return null;
};

// ─── Route & Stop Management (OSM) ─────────────────────────

export const createRoute = (schoolId: string, body: any) =>
  api(`/schools/${schoolId}/routes`, { method: 'POST', body });

export const updateRoute = (routeId: string, body: any) =>
  api(`/routes/${routeId}`, { method: 'PUT', body });

export const deleteRoute = (routeId: string) =>
  api(`/routes/${routeId}`, { method: 'DELETE' });

export const createStop = (routeId: string, body: any) =>
  api(`/routes/${routeId}/stops`, { method: 'POST', body });

export const updateStop = (routeId: string, stopId: string, body: any) =>
  api(`/routes/${routeId}/stops/${stopId}`, { method: 'PUT', body });

export const deleteStop = (routeId: string, stopId: string) =>
  api(`/routes/${routeId}/stops/${stopId}`, { method: 'DELETE' });

export const reorderStops = (routeId: string, items: {id: string; orderIdx: number}[]) =>
  api(`/routes/${routeId}/stops/reorder`, { method: 'PUT', body: items });

// ─── Auth ──────────────────────────────────────────────────
export async function login(email: string, password: string) {
  const data = await api<{
    token: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      schoolId: string;
      mustResetPassword: boolean;
      preferences: any;
    };
  }>('/auth/login', { method: 'POST', auth: false, body: { email, password } });

  await setToken(data.token);
  setUser(data.user);
  return data.user;
}

/**
 * Change the signed-in admin's own password.
 *
 * Goes through change-password, which checks the current password and hands back a
 * replacement token. A password change revokes every token issued before it, this
 * one included, so keeping the old token signed the admin out on their very next
 * request ("Session expired") straight after choosing a password.
 */
export async function updatePassword(currentPassword: string, newPassword: string) {
  const user = getUser();
  if (!user) throw new ApiError('Not authenticated', 401);
  const data = await api<{ token?: string }>(`/auth/change-password`, {
    method: 'POST',
    body: { oldPassword: currentPassword, newPassword },
  });
  if (data?.token) setToken(data.token);
  return data;
}

// ─── Authenticated Socket.IO ───────────────────────────────
export function connectSocket(): Socket {
  const socket = io(CONFIG.SOCKET_URL, {
    auth: { token: getToken() }, // REQUIRED — server rejects without it
    transports: ['websocket'],
  });

  socket.on('connect_error', (err) => {
    if (err.message?.startsWith('Unauthorized') || err.message?.includes('invalid token')) {
      clearAuth();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  });

  return socket;
}

// ─── Stats ─────────────────────────────────────────────────
export const fetchStats = async (options: { strict?: boolean } = {}) => {
  try {
    const schoolId = await getSchoolId();
    if (!schoolId) {
      if (options.strict) throw new ApiError('No school ID found', 0);
      return {};
    }
    return await api(`/schools/${schoolId}/stats`);
  } catch (err) {
    if (options.strict) throw err;
    console.error('Failed to fetch stats:', err);
    return {};
  }
};

// ─── Buses ─────────────────────────────────────────────────
export const fetchBuses = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/buses`);
};

export const createBus = async (data: { registrationNumber: string; capacity: number }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/buses`, { method: 'POST', body: data });
};

export const deleteBus = async (busId: string) => {
  return api(`/buses/${busId}`, { method: 'DELETE' });
};

// ─── Leaves ────────────────────────────────────────────────
export const fetchLeaves = async (status?: string) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  const url = status && status !== 'all'
    ? `/schools/${schoolId}/leaves?status=${status}`
    : `/schools/${schoolId}/leaves`;
  return api(url);
};

export const approveLeave = (id: string) =>
  api(`/leaves/${id}/approve`, { method: 'PUT' });

export const rejectLeave = (id: string) =>
  api(`/leaves/${id}/reject`, { method: 'PUT' });

// ─── Routes ────────────────────────────────────────────────
/**
 * Routes for the current school.
 *
 * The full payload carries each route's encoded OSRM polyline and every one of its
 * stops — for a twelve-route school that is a dozen polylines and hundreds of stop
 * rows. Pass `summary` when you only need names and counts, which is most callers.
 *
 * Summary returns { id, name, distanceKm, estimatedDuration, stopCount } — note it has
 * neither `trips` nor `stops`, so anything reading those needs the full shape.
 */
export const fetchRoutes = async (opts: { summary?: boolean } = {}) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/routes${opts.summary ? '?summary=1' : ''}`);
};


// ─── Students ──────────────────────────────────────────────
export const fetchStudents = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/students`);
};

export const createStudent = async (data: {
  name: string;
  rfidTag?: string;
  grade?: string;
  parentEmail?: string;
    parentName?: string;
    guardianPhone?: string;
}) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/students`, { method: 'POST', body: data });
};

// ─── Student → Route mapping ──────────────────────────────
export const assignStudentToStop = (data: { studentId: string; routeStopId: string }) =>
  api('/student-route-mappings', { method: 'POST', body: data });

/**
 * Move an existing assignment to another stop — across routes as well as within one.
 *
 * One call on purpose. Delete-then-create could leave a child assigned to nothing if the
 * create failed, and a plain POST doesn't replace: same route 409s, different route
 * silently adds a second mapping and puts the child on two driver rosters. A failed PUT
 * changes nothing at all.
 *
 * Omitting `direction` keeps the leg the mapping already serves; pass `null` explicitly
 * to widen a one-leg mapping back to both.
 */
export const updateStudentMapping = (mappingId: string, data: { routeStopId: string; direction?: Direction | null }) =>
  api(`/student-route-mappings/${mappingId}`, { method: 'PUT', body: data });

// ─── Trips ─────────────────────────────────────────────────
/**
 * `direction` is optional server-side for backwards compatibility only. Omitting it
 * stores `direction: null`, which costs the driver app its stop order and the parent
 * app its notification wording — so it is required here, and the type is what stops a
 * new caller from quietly dropping it.
 */
export const createTrip = async (data: { routeId: string; busId: string; driverId: string; direction: Direction; scheduledStart?: string }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/trips`, { method: 'POST', body: data });
};

export const updateTripStatus = async (tripId: string, status: string) =>
  api(`/trips/${tripId}/status`, { method: 'PATCH', body: { status } });

export const updateTrip = async (tripId: string, data: {
  routeId?: string | null;
  busId?: string | null;
  driverId?: string | null;
  direction?: Direction;
  scheduledStart?: string | null;
}) => api(`/trips/${tripId}`, { method: 'PUT', body: data });

// ─── Attendance ────────────────────────────────────────────
export const fetchTodayAttendance = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/attendance/today`);
};

// ─── Drivers ───────────────────────────────────────────────
export const fetchDrivers = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/drivers`);
};

export const createDriver = async (data: { name: string; email: string; phone?: string }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/drivers`, { method: 'POST', body: data });
};

export const updateDriver = async (id: string, data: any) => {
  return api(`/drivers/${id}`, { method: 'PUT', body: data });
};

export const deleteDriver = async (id: string) => {
  return api(`/drivers/${id}`, { method: 'DELETE' });
};

// ─── Notifications ─────────────────────────────────────────
export const fetchNotifications = async (limit = 20) => {
  const res = await api(`/notifications?limit=${limit}`);
  const list = Array.isArray(res) ? res : (res?.data || res?.notifications || []);
  return list.map(normalizeNotification);
};

export const markAllNotificationsRead = async () => {
  return api(`/notifications/mark-read`, { method: 'POST', body: {} });
};

export const markNotificationRead = async (id: string) => {
  return api(`/notifications/${id}/read`, { method: 'POST', body: {} });
};

export const resolveAlert = async (id: string) => {
  return api(`/notifications/${id}/resolve`, { method: 'POST', body: {} });
};

// ─── Password help ─────────────────────────────────────────
// A person who pressed "Forgot password" in their app. School admins only see parents
// and drivers of their own school; administrators' requests go to super admins.
export interface PasswordResetRequest {
  id: string;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string; phone?: string | null };
}

/** The server makes the password and returns it once; the person must replace it at next sign-in. */
export interface IssuedPassword {
  user: { id: string; name: string; email: string };
  tempPassword: string;
}

export const fetchPasswordResetRequests = async (): Promise<PasswordResetRequest[]> =>
  api<PasswordResetRequest[]>(`/password-reset-requests`);

export const approvePasswordReset = async (requestId: string): Promise<IssuedPassword> =>
  api<IssuedPassword>(`/password-reset-requests/${requestId}/approve`, { method: 'POST', body: {} });

export const rejectPasswordReset = async (requestId: string) =>
  api(`/password-reset-requests/${requestId}/reject`, { method: 'POST', body: {} });

/** Reset a parent's password without waiting for them to ask (e.g. they phoned the office). */
export const resetParentPassword = async (parentId: string): Promise<IssuedPassword> =>
  api<IssuedPassword>(`/parents/${parentId}/reset-password`, { method: 'POST', body: {} });

export const sendMessageToParent = async (parentId: string, subject: string, message: string) => {
  return api(`/parents/${parentId}/messages`, { method: 'POST', body: { subject, message } });
};

// ─── QR cards ──────────────────────────────────────────────
// The only response in the system that emits qrToken. POST with explicit ids rather
// than a GET over the whole school: a GET would sit in browser history and any proxy
// log — and school networks are filtered and logged as a matter of course.
export const fetchQrCards = async (studentIds: string[]) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api<Array<{
    studentId: string;
    name: string;
    grade?: string;
    routeStopName?: string;
    qrToken: string;
  }>>(`/schools/${schoolId}/qr-cards`, { method: 'POST', body: { studentIds } });
};

// ─── Runs (recurring schedules) ────────────────────────────
// A Run is a recurring service on a route: a direction, a wall-clock departure and a
// weekday pattern. An overnight materialiser turns runs into the Trip rows that already
// exist, so Trip keeps its exact meaning and gains a nullable runId.
//
// `departure` is wall clock ('07:15'), and startDate/endDate are plain YYYY-MM-DD.
// Never send ISO timestamps here — the server resolves them against the school's day.
export const fetchRuns = (routeId: string) =>
  api<any[]>(`/routes/${routeId}/runs`);

export const createRun = (routeId: string, body: any) =>
  api(`/routes/${routeId}/runs`, { method: 'POST', body });

export const updateRun = (runId: string, body: any) =>
  api(`/runs/${runId}`, { method: 'PUT', body });

// Soft delete — the row stays with active:false and is still returned by fetchRuns.
export const deleteRun = (runId: string) =>
  api(`/runs/${runId}`, { method: 'DELETE' });

// ─── Exceptions (per-run, per-date overrides) ──────────────
// Dates plural, applied in one transaction: an exam week is one call, not five, and a
// partial failure can't leave some days shifted and some not.
// The response carries appliedToExistingTrips — the dates close enough to have already
// materialised, which the server edited immediately rather than at the next pass.
export const fetchExceptions = (runId: string) =>
  api<any[]>(`/runs/${runId}/exceptions`);

export const createExceptions = (
  runId: string,
  body: { dates: string[]; type: 'ADDED' | 'REMOVED'; departure?: string; reason?: string },
) => api<{ appliedToExistingTrips?: string[] }>(`/runs/${runId}/exceptions`, { method: 'POST', body });

export const deleteException = (id: string) =>
  api(`/exceptions/${id}`, { method: 'DELETE' });

// What the next fortnight actually materialises, platform closures already subtracted.
// Every non-running date carries a reason string — render it, never re-derive it.
export const fetchSchedulePreview = (routeId: string, days = 14, from?: string) =>
  api<any[]>(`/routes/${routeId}/schedule-preview?days=${days}${from ? `&from=${from}` : ''}`);

// ─── School closure calendar ───────────────────────────────
// Rows carry no "platform" flag: a platform closure is schoolId === null, and only a
// super-admin may touch one. See isPlatformClosure in lib/runs.ts.
export const fetchClosures = () => api<any[]>('/calendar');

export interface ClosureImpact {
  date: string;
  runCount?: number;
  tripCount?: number;
  tripsCancelled?: number;
  applied?: boolean;
}

// One date per request — the server has no endDate and deliberately no bulk write, so a
// holiday week is a loop. Each date can 409 on its own, which is worth knowing per date.
// dryRun answers "what does this cancel?" before the row exists rather than after.
export const createClosure = (
  body: { scope: 'SCHOOL' | 'PLATFORM'; schoolId?: string; date: string; reason: string },
  dryRun = false,
) => api<ClosureImpact>(`/calendar${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', body });

export const deleteClosure = (id: string) =>
  api<{ success: boolean; tripsRestored?: number }>(`/calendar/${id}`, { method: 'DELETE' });

// ─── Search ────────────────────────────────────────────────
export const searchGlobal = (query: string) =>
  api(`/search?q=${encodeURIComponent(query)}`);

// ─── Broadcast ─────────────────────────────────────────────
export const sendBroadcast = async (data: any) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/broadcast`, { method: 'POST', body: data });
};

// ─── Device Locations (for Live Map initial load) ──────────
export const fetchDeviceLocations = () =>
  api('/devices/locations');
export const importStudentsCSV = async (file: File) => {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new ApiError('Could not read this CSV file. Select it again and retry.', 400);
  }
  const preview = parseStudentImportCSV(text);
  if (!preview.valid) {
    throw new ApiError('Correct the CSV errors before importing students.', 400,
      preview.errors.map(error => ({ path: `row.${error.rowNumber}`, message: `Line ${error.rowNumber}: ${error.message}` })));
  }
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/students/bulk`, { method: 'POST', body: preview.payload });
};
