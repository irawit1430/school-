import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StudentsAttendance } from '../StudentsAttendance';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  fetchStudents: vi.fn(),
  fetchTodayAttendance: vi.fn(),
  fetchStats: vi.fn(),
  fetchRoutes: vi.fn(),
  createStudent: vi.fn(),
  assignStudentToStop: vi.fn()
}));

// Ignore Recharts ResizeObserver issue
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('StudentsAttendance Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles data loading error gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock API calls to reject
    const mockError = new Error('API Error');
    (api.fetchStudents as any).mockRejectedValueOnce(mockError);
    (api.fetchTodayAttendance as any).mockResolvedValueOnce([]);
    (api.fetchStats as any).mockResolvedValueOnce({});
    (api.fetchRoutes as any).mockResolvedValueOnce([]);

    render(<StudentsAttendance />);

    // Wait for the useEffect to finish
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load students/attendance:', mockError);
    });

    // We can check if main elements are visible even after failure
    expect(screen.getByText('Students & Attendance')).toBeInTheDocument();

    // We can also verify that data functions were called
    expect(api.fetchStudents).toHaveBeenCalled();
    expect(api.fetchTodayAttendance).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
