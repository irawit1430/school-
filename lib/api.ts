import { CONFIG } from './config';
import { io, Socket } from 'socket.io-client';
import { cachedGet, clearApiCache } from './apiCache';
import { normalizeNotification } from './notifications';
import type { RosterPayloadRow } from './studentImport';
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

/**
 * When this token expires, in epoch ms, or null if it says nothing useful.
 *
 * Read from the JWT's own `exp` claim, which is already in the browser — no endpoint and
 * no refresh token needed to warn someone before their work is thrown away. The signature
 * is not verified here and must not be: this is for telling a user "you have four minutes",
 * never for deciding what they may do. The server remains the only authority on that.
 */
export const tokenExpiresAt = (token: string | null = getToken()): number | null => {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json?.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
};

/**
 * Send someone to the login screen without losing where they were.
 *
 * A bare redirect to /login was replacing the page — twenty stops placed on a map, a CSV
 * preview, a part-written broadcast — with no explanation and no way back.
 */
export const redirectToLogin = (reason: 'expired' | 'invalid' = 'expired') => {
  if (typeof window === 'undefined') return;
  const here = window.location.pathname + window.location.search;
  const next = here.startsWith('/login') ? '/overview' : here;
  window.location.href = `/login?reason=${reason}&next=${encodeURIComponent(next)}`;
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
    // A support session must not survive into the next sign-in.
    localStorage.removeItem(SUPPORT_SCHOOL_KEY);
  }
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
    redirectToLogin('expired');
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
/**
 * Which school a Voltava support session is looking at.
 *
 * A SUPER_ADMIN has no `schoolId` of their own, and this used to resolve by taking
 * `schools[0].id` — whichever school the API happened to list first. Nothing on screen
 * said which school that was, and every write went to it: students created, routes
 * edited, alerts resolved, against a school nobody chose. Reordering the server's
 * response would have silently moved a support session to a different school's children.
 *
 * So the choice is explicit and stored. `getSchoolId` returns null until one is made,
 * which the dashboard layout turns into a school picker rather than an error.
 *
 * Not done here, because neither can be honestly enforced in this app: read-only default
 * and audited elevation. The server is the only place that can refuse a support write,
 * and the banner says what scope is in effect rather than pretending to enforce it.
 */
const SUPPORT_SCHOOL_KEY = 'voltava.supportSchool';

export type SupportSchool = { id: string; name: string };

export const getSupportSchool = (): SupportSchool | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SUPPORT_SCHOOL_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.id ? parsed : null;
  } catch { return null; }
};

export const setSupportSchool = (school: SupportSchool | null) => {
  if (typeof window === 'undefined') return;
  if (school) localStorage.setItem(SUPPORT_SCHOOL_KEY, JSON.stringify(school));
  else localStorage.removeItem(SUPPORT_SCHOOL_KEY);
  // Leaving or switching school clears everything scoped to the old one, or the next
  // screen renders the previous school's buses under the new school's name.
  clearApiCache();
};

export const fetchSchools = async (): Promise<SupportSchool[]> => {
  const data = await api<any>('/schools');
  const rows = Array.isArray(data) ? data : (data?.data ?? []);
  return rows
    .filter((row: any) => row?.id)
    .map((row: any) => ({ id: row.id, name: row.name || row.schoolName || row.id }));
};

export const getSchoolId = async (): Promise<string | null> => {
  const user = getUser();
  if (!user) return null;

  if (user.schoolId) return user.schoolId;
  if (user.role === 'SUPER_ADMIN') return getSupportSchool()?.id ?? null;
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
      redirectToLogin('invalid');
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


// ─── School ────────────────────────────────────────────────
export type SchoolTransport = {
  id: string;
  name?: string;
  latitude: number | null;
  longitude: number | null;
  /** Minutes a bus waits at each stop; null means the server default. */
  stopDwellMinutes: number | null;
};

export const fetchSchool = async (): Promise<SchoolTransport> => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}`);
};

/** How long buses wait at each stop, for this school's ETAs. null = the default. */
export const updateSchoolTransport = async (stopDwellMinutes: number | null) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api<{ id: string; stopDwellMinutes: number | null; defaultStopDwellMinutes: number }>(
    `/schools/${schoolId}/transport`, { method: 'PATCH', body: { stopDwellMinutes } });
};

// ─── Students ──────────────────────────────────────────────
export const fetchStudents = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/students`);
};

/**
 * Child, parent account and stop in one request and one transaction on the server: the
 * child is either ready to ride or nothing was saved. Returns who to invite.
 */
export interface CreatedStudent {
  student: { id: string; name: string };
  stopAssigned: boolean;
  parent: { id: string; email: string; created: boolean; invited: boolean } | null;
}
export const createStudent = async (data: {
  name: string;
  rfidTag?: string;
  grade?: string;
  parentEmail?: string;
  parentName?: string;
  guardianPhone?: string;
  routeStopId?: string;
  direction?: Direction | null;
}): Promise<CreatedStudent> => {
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

/**
 * Take a child off a stop entirely.
 *
 * A child who stops using the bus stayed on a driver's roster indefinitely and counted as
 * not-scanned every day — which is the figure the tracking side reports as attendance, so
 * the roster quietly drifted away from reality one leaver at a time.
 */
export const unassignStudentStop = (mappingId: string) =>
  api(`/student-route-mappings/${mappingId}`, { method: 'DELETE' });

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

/**
 * The office confirms a print run came out right. Only then is a card "printed", which is
 * what tells a driver to expect a card from that child.
 */
export const confirmCardsPrinted = async (studentIds: string[]) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api<{ confirmed: number; printedAt: string }>(`/schools/${schoolId}/qr-cards/printed`, { method: 'POST', body: { studentIds } });
};

/** A lost or damaged card: a new code, and the old card stops working. */
export const replaceCard = (studentId: string) =>
  api<{ studentId: string; replaced: boolean }>(`/students/${studentId}/qr-card/replace`, { method: 'POST', body: {} });

// ─── Parent invites and activation ─────────────────────────
// Every family gets its own one-time code, sent by email from the server or handed over
// by the office (WhatsApp, SMS, a printed letter). The activation page shows where each
// family stands, from "not invited" to alerts reaching their phone.
export type ParentStage = 'NOT_INVITED' | 'INVITE_SENT' | 'INVITE_EXPIRED' | 'EMAIL_FAILED' | 'SIGNED_IN' | 'ACTIVATED';
export type ParentPushState = 'NONE' | 'REGISTERED' | 'DELIVERING' | 'FAILING' | 'IPHONE_NOT_SENDING';
export type InviteChannel = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'PRINT' | 'COPY';

export interface ActivationParent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  stage: ParentStage;
  children: Array<{ id: string; name: string; grade: string | null; hasStop: boolean }>;
  invite: { sentAt: string | null; expiresAt: string | null; channel: string | null };
  signedInAt: string | null;
  passwordChosen: boolean;
  push: { state: ParentPushState; devices: Array<{ platform: string; provider: string; enabled: boolean; lastAcceptedAt: string | null; lastFailure: string | null }> };
  lastSeenAt: string | null;
}
export interface ParentActivation {
  totals: {
    students: number; studentsWithoutParent: number; studentsWithoutStop: number; parents: number;
    stages: Partial<Record<ParentStage, number>>;
    push: Partial<Record<ParentPushState, number>>;
  };
  parents: ActivationParent[];
  studentsWithoutParent: Array<{ id: string; name: string; grade: string | null; rfidTag: string; guardianPhone: string | null }>;
  emailConfigured: boolean;
  iphonePushConfigured: boolean;
  appLinks: { android: string | null; ios: string | null };
  inviteDays: number;
}

export const fetchParentActivation = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api<ParentActivation>(`/schools/${schoolId}/parent-activation`);
};

/** What an invite handed back. `code` only for channels the office sends itself. */
export interface InviteResult {
  parentId: string;
  channel: InviteChannel;
  sent: boolean | null;
  expiresAt: string;
  code?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  childNames?: string[];
  message?: { subject: string; text: string };
}

export const sendParentInvite = (parentId: string, channel: InviteChannel) =>
  api<InviteResult>(`/parents/${parentId}/invite`, { method: 'POST', body: { channel } });

export const sendParentInvites = async (parentIds: string[], channel: 'EMAIL' | 'PRINT') => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api<{
    channel: string;
    sent: number;
    failed: Array<{ parentId: string; error: string }>;
    skipped: Array<{ parentId: string; reason: string; error: string }>;
    letters?: InviteResult[];
  }>(`/schools/${schoolId}/parent-invites`, { method: 'POST', body: { parentIds, channel } });
};

export const revokeParentInvite = (parentId: string) =>
  api<{ parentId: string; revoked: boolean }>(`/parents/${parentId}/invite/revoke`, { method: 'POST', body: {} });

// ─── Readiness (the office's exception queue) ─────────────
export interface ReadinessItem {
  key: string;
  severity: 'critical' | 'warning' | 'info';
  count: number;
  title: string;
  detail: string;
  href: string;
}
export interface Readiness {
  generatedAt: string;
  platform: { degraded: boolean; alarms: Array<{ check: string; since: string; message: string }> };
  items: ReadinessItem[];
  counts: { students: number; parents: number; stages: Partial<Record<ParentStage, number>> };
  setup: { androidPush: boolean; iphonePush: boolean; email: boolean; appLinks: { android: string | null; ios: string | null } };
}

export const fetchReadiness = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api<Readiness>(`/schools/${schoolId}/readiness`);
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
// ─── Roster import ────────────────────────────────────────
// Two calls with the same rows: a check that writes nothing and says, row by row, what
// would happen; then the import, which the server refuses outright if any row still
// needs correcting. Rerunning the same file changes nothing.
export type ImportRowState = 'NEEDS_CORRECTION' | 'INVITE_READY' | 'EXISTING_PARENT_LINKED' | 'PARENT_LINKED' | 'NO_PARENT';
export interface ImportRowResult {
  line: number;
  name: string;
  rfidTag: string;
  student: 'NEW' | 'UPDATE' | 'UNCHANGED';
  state: ImportRowState;
  parent: { action: 'NEW' | 'LINK_NEW' | 'LINK_EXISTING' | 'ALREADY' | 'NONE'; email: string | null };
  stop: { action: 'ASSIGN' | 'ALREADY' | 'NONE'; route: string | null; stop: string | null };
  card: 'GENERATED' | 'IMPORTED' | 'ATTACH' | 'KEPT';
  ready: boolean;
  changes: string[];
  errors: string[];
  warnings: string[];
}
export interface ImportTotals {
  rows: number; new: number; updated: number; unchanged: number; needsCorrection: number;
  parentsCreated: number; parentsLinked: number; noParent: number; stopsAssigned: number; noStop: number; ready: number;
}
export interface ImportResult {
  dryRun: boolean;
  committed: boolean;
  totals: ImportTotals;
  rows: ImportRowResult[];
  message?: string;
  error?: string;
}

const rosterImport = async (rows: RosterPayloadRow[], dryRun: boolean): Promise<ImportResult> => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  try {
    return await api<ImportResult>(`/schools/${schoolId}/students/bulk${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', body: rows });
  } catch (err) {
    // A refused import still carries every row's result; hand it back as one.
    if (err instanceof ApiError && err.status === 409 && Array.isArray(err.data?.rows)) return err.data as ImportResult;
    throw err;
  }
};

export const checkStudentImport = (rows: RosterPayloadRow[]) => rosterImport(rows, true);
export const commitStudentImport = (rows: RosterPayloadRow[]) => rosterImport(rows, false);
