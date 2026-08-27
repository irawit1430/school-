import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBuses, fetchRoutes, assignStudentToStop, createStudent, rejectLeave, API_BASE } from './api';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock fetch
global.fetch = vi.fn();

describe('fetchBuses', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.mocked(global.fetch).mockReset();
  });

  it('should fetch buses successfully when schoolId is present in user localStorage', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ schoolId: 'school-123' }));
    localStorageMock.setItem('token', 'fake-token');

    const mockBuses = [{ id: 'bus-1', name: 'Bus 1' }];
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBuses,
    } as unknown as Response);

    // Execute
    const result = await fetchBuses();

    // Assert
    expect(result).toEqual(mockBuses);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/schools/school-123/buses`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-token',
      },
    });
  });

  it('should throw an error when schoolId is missing', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ role: 'TEACHER' }));

    // Execute & Assert
    await expect(fetchBuses()).rejects.toThrow('No school ID found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw an error when fetch fails', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ schoolId: 'school-123' }));

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
    } as unknown as Response);

    // Execute & Assert
    await expect(fetchBuses()).rejects.toThrow('Failed to fetch buses');
  });

  it('should fetch schoolId from API if SUPER_ADMIN and no schoolId in user', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ role: 'SUPER_ADMIN' }));

    // First fetch for school ID
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'super-school-1' }],
    } as unknown as Response);

    // Second fetch for buses
    const mockBuses = [{ id: 'bus-2', name: 'Bus 2' }];
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBuses,
    } as unknown as Response);

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
  beforeEach(() => {
    localStorageMock.clear();
    vi.mocked(global.fetch).mockReset();
  });

  it('should fetch routes successfully when schoolId is present in user localStorage', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ schoolId: 'school-123' }));
    localStorageMock.setItem('token', 'fake-token');

    const mockRoutes = [{ id: 'route-1', name: 'Route 1' }];
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRoutes,
    } as unknown as Response);

    // Execute
    const result = await fetchRoutes();

    // Assert
    expect(result).toEqual(mockRoutes);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/schools/school-123/routes`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-token',
      },
    });
  });

  it('should throw an error when schoolId is missing', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ role: 'TEACHER' }));

    // Execute & Assert
    await expect(fetchRoutes()).rejects.toThrow('No school ID found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw an error when fetch fails', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ schoolId: 'school-123' }));

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
    } as unknown as Response);

    // Execute & Assert
    await expect(fetchRoutes()).rejects.toThrow('Failed to fetch routes');
  });

  it('should fetch schoolId from API if SUPER_ADMIN and no schoolId in user', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ role: 'SUPER_ADMIN' }));

    // First fetch for school ID
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'super-school-1' }],
    } as unknown as Response);

    // Second fetch for routes
    const mockRoutes = [{ id: 'route-2', name: 'Route 2' }];
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRoutes,
    } as unknown as Response);

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
  beforeEach(() => {
    localStorageMock.clear();
    vi.mocked(global.fetch).mockReset();
    localStorageMock.setItem('token', 'fake-token');
  });

  it('should return success and text when json parsing fails on success response', async () => {
    // Setup
    const mockData = { studentId: 'student-1', routeStopId: 'stop-1' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'Invalid JSON Response',
    } as unknown as Response);

    // Execute
    const result = await assignStudentToStop(mockData);

    // Assert
    expect(result).toEqual({ success: true, text: 'Invalid JSON Response' });
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/student-route-mappings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-token',
      },
      body: JSON.stringify(mockData),
    });
  });

  it('should ignore text parsing errors on failure and throw default error', async () => {
    // Setup
    const mockData = { studentId: 'student-1', routeStopId: 'stop-1' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => { throw new Error('Text reading error'); },
    } as unknown as Response);

    // Execute & Assert
    await expect(assignStudentToStop(mockData)).rejects.toThrow('Failed to assign student');
  });

  it('should include truncated error text on failure', async () => {
    // Setup
    const mockData = { studentId: 'student-1', routeStopId: 'stop-1' };
    const longErrorText = 'A'.repeat(150);
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => longErrorText,
    } as unknown as Response);

    // Execute & Assert
    await expect(assignStudentToStop(mockData)).rejects.toThrow(`Failed to assign student (HTTP 400): ${'A'.repeat(100)}`);
  });

  it('should return parsed json on successful assignment', async () => {
    // Setup
    const mockData = { studentId: 'student-1', routeStopId: 'stop-1' };
    const mockResponse = { success: true, data: 'assigned' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    } as unknown as Response);

    // Execute
    const result = await assignStudentToStop(mockData);

    // Assert
    expect(result).toEqual(mockResponse);
  });

  it('should return success true on empty text response', async () => {
    // Setup
    const mockData = { studentId: 'student-1', routeStopId: 'stop-1' };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '',
    } as unknown as Response);

    // Execute
    const result = await assignStudentToStop(mockData);

    // Assert
    expect(result).toEqual({ success: true });
  });
});

describe('createStudent', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.mocked(global.fetch).mockReset();
  });

  it('should create a student successfully when schoolId is present', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ schoolId: 'school-123' }));
    localStorageMock.setItem('token', 'fake-token');

    const mockStudentData = { rfidTag: 'tag-1', name: 'John Doe', grade: '10' };
    const mockResponse = { id: 'student-1', ...mockStudentData };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    // Execute
    const result = await createStudent(mockStudentData);

    // Assert
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/schools/school-123/students`, {
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
    localStorageMock.setItem('user', JSON.stringify({ role: 'TEACHER' }));

    const mockStudentData = { rfidTag: 'tag-1', name: 'John Doe' };

    // Execute & Assert
    await expect(createStudent(mockStudentData)).rejects.toThrow('No school ID found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw an error when fetch fails', async () => {
    // Setup
    localStorageMock.setItem('user', JSON.stringify({ schoolId: 'school-123' }));
    const mockStudentData = { rfidTag: 'tag-1', name: 'John Doe' };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
    } as unknown as Response);

    // Execute & Assert
    await expect(createStudent(mockStudentData)).rejects.toThrow('Failed to create student');
  });
});

describe('rejectLeave', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.mocked(global.fetch).mockReset();
  });

  it('should reject leave successfully and return parsed JSON', async () => {
    // Setup
    localStorageMock.setItem('token', 'fake-token');

    const mockLeaveId = 'leave-123';
    const mockResponse = { success: true, message: 'Leave rejected' };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    // Execute
    const result = await rejectLeave(mockLeaveId);

    // Assert
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/leaves/${mockLeaveId}/reject`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-token',
      },
    });
  });

  it('should throw an error when fetch fails', async () => {
    // Setup
    localStorageMock.setItem('token', 'fake-token');
    const mockLeaveId = 'leave-123';

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
    } as unknown as Response);

    // Execute & Assert
    await expect(rejectLeave(mockLeaveId)).rejects.toThrow('Failed to reject leave');
  });
});
