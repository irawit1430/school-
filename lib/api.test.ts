import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBuses, fetchRoutes, API_BASE } from './api';

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
    expect(global.fetch).toHaveBeenCalledWith('/api/proxy/schools/school-123/buses', {
      headers: {
        'Content-Type': 'application/json',

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
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/proxy/schools', expect.any(Object));
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/proxy/schools/super-school-1/buses', expect.any(Object));
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
    } as Response);

    // Execute
    const result = await fetchRoutes();

    // Assert
    expect(result).toEqual(mockRoutes);
    expect(global.fetch).toHaveBeenCalledWith('/api/proxy/schools/school-123/routes', {
      headers: {
        'Content-Type': 'application/json',

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
    } as Response);

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
    } as Response);

    // Second fetch for routes
    const mockRoutes = [{ id: 'route-2', name: 'Route 2' }];
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRoutes,
    } as Response);

    // Execute
    const result = await fetchRoutes();

    // Assert
    expect(result).toEqual(mockRoutes);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/proxy/schools', expect.any(Object));
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/proxy/schools/super-school-1/routes', expect.any(Object));
  });
});
