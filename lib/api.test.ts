import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchBuses,
  fetchRoutes,
  assignStudentToStop,
  createStudent,
  API_BASE,
  clearApiCache,
  clearSchoolIdCache,
  updatePassword,
  resetParentPassword,
  approvePasswordReset,
  rejectPasswordReset,
  fetchPasswordResetRequests,
} from './api';
import { CONFIG } from './config';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Read the key from config rather than hardcoding it: these tests went stale once
// already when the key was namespaced from 'user' to 'voltava_user'.
const setUser = (user: object) =>
  localStorageMock.setItem(CONFIG.USER_STORAGE_KEY, JSON.stringify(user));

// Mock fetch
global.fetch = vi.fn();

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const failed = (status: number, body?: unknown) =>
  ({
    ok: false,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  }) as Response;

const authedGet = {
  cache: 'no-store',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer fake-token',
  },
  body: undefined,
};

beforeEach(() => {
  localStorageMock.clear();
  vi.mocked(global.fetch).mockReset();
  // GETs are cached for 30s and the SUPER_ADMIN school lookup for the session; without
  // clearing both, one test's response is served to the next.
  clearApiCache();
  clearSchoolIdCache();
});

describe('fetchBuses', () => {
  it('should fetch buses successfully when schoolId is present in user localStorage', async () => {
    // Setup
    setUser({ schoolId: 'school-123' });
    localStorageMock.setItem('token', 'fake-token');

    const mockBuses = [{ id: 'bus-1', name: 'Bus 1' }];
    vi.mocked(global.fetch).mockResolvedValueOnce(ok(mockBuses));

    // Execute
    const result = await fetchBuses();

    // Assert
    expect(result).toEqual(mockBuses);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/schools/school-123/buses`, authedGet);
  });

  it('should throw an error when schoolId is missing', async () => {
    // Setup
    setUser({ role: 'TEACHER' });

    // Execute & Assert
    await expect(fetchBuses()).rejects.toThrow('No school ID found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw an error when fetch fails', async () => {
    // Setup
    setUser({ schoolId: 'school-123' });
    vi.mocked(global.fetch).mockResolvedValueOnce(failed(500));

    // Execute & Assert
    await expect(fetchBuses()).rejects.toMatchObject({ name: 'ApiError', status: 500, message: 'HTTP 500' });
  });

  it('should fetch schoolId from API if SUPER_ADMIN and no schoolId in user', async () => {
    // Setup
    setUser({ role: 'SUPER_ADMIN' });

    // First fetch for school ID
    vi.mocked(global.fetch).mockResolvedValueOnce(ok([{ id: 'super-school-1' }]));

    // Second fetch for buses
    const mockBuses = [{ id: 'bus-2', name: 'Bus 2' }];
    vi.mocked(global.fetch).mockResolvedValueOnce(ok(mockBuses));

    // Execute
    const result = await fetchBuses();

    // Assert
    expect(result).toEqual(mockBuses);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/schools`, expect.any(Object));
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${API_BASE}/schools/super-school-1/buses`, expect.any(Object));
  });
});

describe('fetchRoutes', () => {
  it('should fetch routes successfully when schoolId is present in user localStorage', async () => {
    // Setup
    setUser({ schoolId: 'school-123' });
    localStorageMock.setItem('token', 'fake-token');

    const mockRoutes = [{ id: 'route-1', name: 'Route 1' }];
    vi.mocked(global.fetch).mockResolvedValueOnce(ok(mockRoutes));

    // Execute
    const result = await fetchRoutes();

    // Assert
    expect(result).toEqual(mockRoutes);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/schools/school-123/routes`, authedGet);
  });

  it('should throw an error when schoolId is missing', async () => {
    // Setup
    setUser({ role: 'TEACHER' });

    // Execute & Assert
    await expect(fetchRoutes()).rejects.toThrow('No school ID found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw an error when fetch fails', async () => {
    // Setup
    setUser({ schoolId: 'school-123' });
    vi.mocked(global.fetch).mockResolvedValueOnce(failed(500));

    // Execute & Assert
    await expect(fetchRoutes()).rejects.toMatchObject({ name: 'ApiError', status: 500, message: 'HTTP 500' });
  });

  it('should fetch schoolId from API if SUPER_ADMIN and no schoolId in user', async () => {
    // Setup
    setUser({ role: 'SUPER_ADMIN' });

    // First fetch for school ID
    vi.mocked(global.fetch).mockResolvedValueOnce(ok([{ id: 'super-school-1' }]));

    // Second fetch for routes
    const mockRoutes = [{ id: 'route-2', name: 'Route 2' }];
    vi.mocked(global.fetch).mockResolvedValueOnce(ok(mockRoutes));

    // Execute
    const result = await fetchRoutes();

    // Assert
    expect(result).toEqual(mockRoutes);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/schools`, expect.any(Object));
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${API_BASE}/schools/super-school-1/routes`, expect.any(Object));
  });
});

describe('assignStudentToStop', () => {
  const mockData = { studentId: 'student-1', routeStopId: 'stop-1' };

  beforeEach(() => {
    localStorageMock.setItem('token', 'fake-token');
  });

  it('should return parsed json on successful assignment', async () => {
    // Setup
    const mockResponse = { success: true, data: 'assigned' };
    vi.mocked(global.fetch).mockResolvedValueOnce(ok(mockResponse));

    // Execute
    const result = await assignStudentToStop(mockData);

    // Assert
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/student-route-mappings`, {
      cache: 'no-store',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-token',
      },
      body: JSON.stringify(mockData),
    });
  });

  it('should not throw when a successful response has no parseable body', async () => {
    // Setup — an empty 200/204 is still a successful assignment.
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    } as Response);

    // Execute & Assert
    await expect(assignStudentToStop(mockData)).resolves.toEqual({});
  });

  it("should surface the server's error message and status on failure", async () => {
    // Setup — a conflict names the stop the child already occupies; the admin needs that.
    vi.mocked(global.fetch).mockResolvedValueOnce(
      failed(409, { error: 'Student is already assigned to Stop 4', code: 'MAPPING_EXISTS' })
    );

    // Execute & Assert
    await expect(assignStudentToStop(mockData)).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Student is already assigned to Stop 4',
      data: { code: 'MAPPING_EXISTS' },
    });
  });

  it('should carry validation issues from a 400', async () => {
    // Setup
    const issues = [{ path: 'routeStopId', message: 'routeStopId is required' }];
    vi.mocked(global.fetch).mockResolvedValueOnce(failed(400, { error: 'Validation failed', issues }));

    // Execute & Assert
    await expect(assignStudentToStop(mockData)).rejects.toMatchObject({ status: 400, issues });
  });

  it('should fall back to the HTTP status when the failure body is unreadable', async () => {
    // Setup
    vi.mocked(global.fetch).mockResolvedValueOnce(failed(500));

    // Execute & Assert
    await expect(assignStudentToStop(mockData)).rejects.toMatchObject({ status: 500, message: 'HTTP 500' });
  });
});

describe('createStudent', () => {
  it('should create a student successfully when schoolId is present', async () => {
    // Setup
    setUser({ schoolId: 'school-123' });
    localStorageMock.setItem('token', 'fake-token');

    const mockStudentData = { rfidTag: 'tag-1', name: 'John Doe', grade: '10' };
    const mockResponse = { id: 'student-1', ...mockStudentData };

    vi.mocked(global.fetch).mockResolvedValueOnce(ok(mockResponse));

    // Execute
    const result = await createStudent(mockStudentData);

    // Assert
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/schools/school-123/students`, {
      cache: 'no-store',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-token',
      },
      body: JSON.stringify(mockStudentData),
    });
  });

  it('should throw an error when schoolId is missing', async () => {
    // Setup
    setUser({ role: 'TEACHER' });

    const mockStudentData = { rfidTag: 'tag-1', name: 'John Doe' };

    // Execute & Assert
    await expect(createStudent(mockStudentData)).rejects.toThrow('No school ID found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw an error when fetch fails', async () => {
    // Setup
    setUser({ schoolId: 'school-123' });
    const mockStudentData = { rfidTag: 'tag-1', name: 'John Doe' };

    vi.mocked(global.fetch).mockResolvedValueOnce(failed(500));

    // Execute & Assert
    await expect(createStudent(mockStudentData)).rejects.toMatchObject({ name: 'ApiError', status: 500, message: 'HTTP 500' });
  });
});

describe('updatePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    setUser({ id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });
    localStorageMock.setItem('token', 'old-token');
  });

  it('checks the current password and keeps the admin signed in with the new token', async () => {
    // The old token is revoked by the change. It used to be kept, so the very next
    // request came back 401 and the admin was sent to the login page.
    (global.fetch as any).mockResolvedValueOnce(ok({ message: 'Password updated successfully', token: 'new-token' }));

    await updatePassword('current-pass', 'new-pass-1234');

    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe(`${API_BASE}/auth/change-password`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ oldPassword: 'current-pass', newPassword: 'new-pass-1234' });
    expect(localStorageMock.getItem('token')).toBe('new-token');
  });
});

describe('password help', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    setUser({ id: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });
    localStorageMock.setItem('token', 'tok');
  });

  it('calls the routes the backend serves', async () => {
    const issued = { user: { id: 'p', name: 'P', email: 'p@x.com' }, tempPassword: 'T' };
    (global.fetch as any)
      .mockResolvedValueOnce(ok(issued))
      .mockResolvedValueOnce(ok(issued))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(ok([]));

    expect(await resetParentPassword('parent-1')).toEqual(issued);
    expect(await approvePasswordReset('req-1')).toEqual(issued);
    await rejectPasswordReset('req-2');
    await fetchPasswordResetRequests();

    const calls = (global.fetch as any).mock.calls.map(([url, init]: [string, RequestInit]) => `${init.method} ${url.replace(API_BASE, '')}`);
    expect(calls).toEqual([
      'POST /parents/parent-1/reset-password',
      'POST /password-reset-requests/req-1/approve',
      'POST /password-reset-requests/req-2/reject',
      'GET /password-reset-requests',
    ]);
  });
});
