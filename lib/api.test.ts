import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBuses, createStudent, API_BASE } from './api';

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
    } as Response);

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
    } as Response);

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
    } as Response);

    // Second fetch for buses
    const mockBuses = [{ id: 'bus-2', name: 'Bus 2' }];
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBuses,
    } as Response);

    // Execute
    const result = await fetchBuses();

    // Assert
    expect(result).toEqual(mockBuses);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/schools`, expect.any(Object));
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${API_BASE}/schools/super-school-1/buses`, expect.any(Object));
  });
});

describe('createStudent', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.mocked(global.fetch).mockReset();
  });

  const studentData = {
    rfidTag: '12345',
    name: 'John Doe',
    grade: '10',
    parentEmail: 'parent@example.com',
    parentName: 'Jane Doe',
  };

  it('should create a student successfully when schoolId is present', async () => {
    localStorageMock.setItem('user', JSON.stringify({ schoolId: 'school-123' }));
    localStorageMock.setItem('token', 'fake-token');

    const mockResponse = { id: 'student-1', ...studentData };
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await createStudent(studentData);

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/schools/school-123/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-token',
      },
      body: JSON.stringify(studentData),
    });
  });

  it('should throw an error when schoolId is missing', async () => {
    localStorageMock.setItem('user', JSON.stringify({ role: 'TEACHER' }));

    await expect(createStudent(studentData)).rejects.toThrow('No school ID found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw an error when fetch fails', async () => {
    localStorageMock.setItem('user', JSON.stringify({ schoolId: 'school-123' }));

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
    } as Response);

    await expect(createStudent(studentData)).rejects.toThrow('Failed to create student');
  });
});
