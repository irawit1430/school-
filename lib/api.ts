import { CONFIG } from './config';
import { io, Socket } from 'socket.io-client';

const API_BASE = `${CONFIG.API_BASE_URL}/api`;

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

export const clearAuth = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem(CONFIG.USER_STORAGE_KEY);
  }
};

// ─── Error class with status + validation issues ───────────
export class ApiError extends Error {
  status: number;
  issues?: Array<{ path: string; message: string }>;

  constructor(message: string, status: number, issues?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

// ─── Core HTTP wrapper with global error handling ──────────
const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

async function api<T = any>(
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
      data.issues
    );
    throw err;
  }

  return data as T;
}

// ─── SchoolId helper ───────────────────────────────────────
const getSchoolId = async (): Promise<string | null> => {
  const user = getUser();
  if (!user) return null;

  if (user.schoolId) return user.schoolId;

  // SUPER_ADMIN fallback — fetch first school
  if (user.role === 'SUPER_ADMIN') {
    try {
      const responseData = await api<any>('/schools');
      const schools = Array.isArray(responseData) ? responseData : responseData.data;
      if (schools && schools.length > 0) return schools[0].id;
    } catch {
      return null;
    }
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

export async function updatePassword(password: string) {
  const user = getUser();
  if (!user) throw new ApiError('Not authenticated', 401);
  return api(`/users/${user.id}/password`, { method: 'PUT', body: { password } });
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
export const fetchStats = () => api('/stats');

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
export const fetchRoutes = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/routes`);
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

// ─── Trips ─────────────────────────────────────────────────
export const createTrip = async (data: { routeId: string; busId: string; driverId: string }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/trips`, { method: 'POST', body: data });
};

export const updateTripStatus = async (tripId: string, status: string) =>
  api(`/trips/${tripId}`, { method: 'PUT', body: { status } });

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

export const createDriver = async (data: { name: string; email: string }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  return api(`/schools/${schoolId}/drivers`, { method: 'POST', body: data });
};

// ─── Notifications ─────────────────────────────────────────
export const fetchNotifications = async (limit = 20) => {
  try {
    return await api(`/notifications?limit=${limit}`);
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
    return [];
  }
};

export const markAllNotificationsRead = async () => {
  return api(`/notifications/mark-read`, { method: 'POST' });
};

export const markNotificationRead = async (id: string) => {
  return api(`/notifications/${id}/read`, { method: 'POST' });
};

// ─── Search ────────────────────────────────────────────────
export const searchGlobal = (query: string) =>
  api(`/search?q=${encodeURIComponent(query)}`);

// ─── Device Locations (for Live Map initial load) ──────────
export const fetchDeviceLocations = () =>
  api('/devices/locations');
export const importStudentsCSV = async (file: File) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new ApiError('No school ID found', 0);
  
  const formData = new FormData();
  formData.append('file', file);
  
  const token = getToken();
  const res = await fetch(`${API_BASE}/schools/${schoolId}/students/import`, {
    method: 'POST',
    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    body: formData
  });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || 'Failed to import students', res.status, data.issues);
  }
  return data;
};
