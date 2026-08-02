import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StudentsAttendance } from './StudentsAttendance';
import { fetchStudents, fetchTodayAttendance, createStudent, fetchStats, fetchRoutes, assignStudentToStop } from '@/lib/api';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API calls
vi.mock('@/lib/api', () => ({
  fetchStudents: vi.fn(),
  fetchTodayAttendance: vi.fn(),
  createStudent: vi.fn(),
  fetchStats: vi.fn(),
  fetchRoutes: vi.fn(),
  assignStudentToStop: vi.fn(),
}));

// Mock Recharts to avoid issues with ResizeObserver
vi.mock('recharts', () => {
  const OriginalModule = vi.importActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    PieChart: () => <div data-testid="pie-chart" />,
    Pie: () => <div data-testid="pie" />,
    Cell: () => <div data-testid="cell" />,
  };
});

describe('StudentsAttendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders students and attendance data after loading', async () => {
    const mockStudents = [{ id: 1, name: 'John Doe', rfidTag: '123' }];
    const mockAttendance = [{ id: 1, studentId: 1, timestamp: '2023-01-01T10:00:00Z', type: 'in' }];
    const mockStats = { total: 10, present: 5, absent: 5 };
    const mockRoutes = [{ id: 1, name: 'Route A', stops: [] }];

    vi.mocked(fetchStudents).mockResolvedValue(mockStudents);
    vi.mocked(fetchTodayAttendance).mockResolvedValue(mockAttendance);
    vi.mocked(fetchStats).mockResolvedValue(mockStats);
    vi.mocked(fetchRoutes).mockResolvedValue(mockRoutes);

    render(<StudentsAttendance />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('Students & Attendance')).toBeInTheDocument();
  });

  it('handles API errors gracefully (logs error without crashing)', async () => {
     const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

     vi.mocked(fetchStudents).mockRejectedValue(new Error('API Error'));
     vi.mocked(fetchTodayAttendance).mockRejectedValue(new Error('API Error'));
     vi.mocked(fetchStats).mockRejectedValue(new Error('API Error'));
     vi.mocked(fetchRoutes).mockRejectedValue(new Error('API Error'));

     render(<StudentsAttendance />);

     await waitFor(() => {
       expect(consoleSpy).toHaveBeenCalledWith('Failed to load students/attendance:', expect.any(Error));
     });

     consoleSpy.mockRestore();
  });

  it('opens create student modal and submits form successfully', async () => {
    const mockStudents = [{ id: 1, name: 'John Doe', rfidTag: '123' }];
    vi.mocked(fetchStudents).mockResolvedValue(mockStudents);
    vi.mocked(fetchTodayAttendance).mockResolvedValue([]);
    vi.mocked(fetchStats).mockResolvedValue({});
    vi.mocked(fetchRoutes).mockResolvedValue([]);

    vi.mocked(createStudent).mockResolvedValue({
      success: true,
      parentCredentials: { email: 'parent@example.com', temporaryPassword: 'password123' }
    });

    render(<StudentsAttendance />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click "Add New Student"
    fireEvent.click(screen.getByText('Add New Student'));

    // Wait for modal to open
    expect(screen.getByText('Register New Student')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('e.g. RFID-123456789'), { target: { value: 'NEW-RFID' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), { target: { value: 'Jane Smith' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Mr. Smith'), { target: { value: 'Mr. Smith' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. alex.parent@example.com'), { target: { value: 'smith@example.com' } });

    // Submit form
    fireEvent.click(screen.getByText('Register Student'));

    // Wait for submission and popup
    await waitFor(() => {
      expect(createStudent).toHaveBeenCalledWith({
        rfidTag: 'NEW-RFID',
        name: 'Jane Smith',
        grade: undefined,
        parentName: 'Mr. Smith',
        parentEmail: 'smith@example.com'
      });
      expect(screen.getByText('Student Added!')).toBeInTheDocument();
      expect(screen.getByText('parent@example.com')).toBeInTheDocument();
      expect(screen.getByText('password123')).toBeInTheDocument();
    });

    // Close popup
    fireEvent.click(screen.getByText('Done'));
    await waitFor(() => {
      expect(screen.queryByText('Student Added!')).not.toBeInTheDocument();
    });
  });

  it('opens assign modal and submits assignment successfully', async () => {
     const mockStudents = [{ id: 1, name: 'John Doe', rfidTag: '123', assignedRoute: null }];
     const mockRoutes = [
       { id: 'route1', name: 'Route 1', stops: [{ id: 'stop1', name: 'Stop A', stopTime: '08:00 AM' }] }
     ];
     vi.mocked(fetchStudents).mockResolvedValue(mockStudents);
     vi.mocked(fetchTodayAttendance).mockResolvedValue([]);
     vi.mocked(fetchStats).mockResolvedValue({});
     vi.mocked(fetchRoutes).mockResolvedValue(mockRoutes);

     vi.mocked(assignStudentToStop).mockResolvedValue({ success: true });

     render(<StudentsAttendance />);

     await waitFor(() => {
       expect(screen.getByText('John Doe')).toBeInTheDocument();
     });

     // Open assign modal
     fireEvent.click(screen.getByText('Assign Bus'));

     expect(screen.getByText('Assign Bus / Route')).toBeInTheDocument();

     // Select Route - The label actually has a <span> inside it, so getByRole might fail or be tricky, let's just find the select by finding its first option
     const routeSelect = screen.getByText('Select a Route').parentElement as HTMLSelectElement;
     fireEvent.change(routeSelect, { target: { value: 'route1' } });

     // Select Stop - will appear after route is selected
     await waitFor(() => {
       expect(screen.getByText('Select a Stop')).toBeInTheDocument();
     });
     const stopSelect = screen.getByText('Select a Stop').parentElement as HTMLSelectElement;
     fireEvent.change(stopSelect, { target: { value: 'stop1' } });

     // Submit form
     fireEvent.click(screen.getByText('Confirm Assignment'));

     await waitFor(() => {
       expect(assignStudentToStop).toHaveBeenCalledWith({
         studentId: 1,
         routeStopId: 'stop1'
       });
       expect(screen.queryByText('Assign Bus / Route')).not.toBeInTheDocument();
     });
  });
});
