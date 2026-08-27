import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { StudentsAttendance } from '../StudentsAttendance';
import { fetchStudents, fetchTodayAttendance, fetchStats, fetchRoutes, createStudent, assignStudentToStop } from '@/lib/api';

// Mock the API calls
vi.mock('@/lib/api', () => ({
  fetchStudents: vi.fn(),
  fetchTodayAttendance: vi.fn(),
  createStudent: vi.fn(),
  fetchStats: vi.fn(),
  fetchRoutes: vi.fn(),
  assignStudentToStop: vi.fn(),
}));

// Mock ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('StudentsAttendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful responses
    (fetchStudents as any).mockResolvedValue([
      { id: '1', name: 'John Doe', rfidTag: '123', grade: '10th', routeStopId: 'stop1', routeName: 'Route A', stopName: 'Stop 1' }
    ]);
    (fetchTodayAttendance as any).mockResolvedValue([
      { id: '1', studentId: '1', studentName: 'John Doe', status: 'present', timestamp: new Date().toISOString() }
    ]);
    (fetchStats as any).mockResolvedValue({
      totalStudents: 100,
      presentToday: 95,
      absentToday: 5,
      lateToday: 0
    });
    (fetchRoutes as any).mockResolvedValue([
      { id: 'route1', name: 'Route A', stops: [{ id: 'stop1', name: 'Stop 1', stopTime: '08:00' }] }
    ]);
  });

  it('renders loading state initially', async () => {
    await act(async () => {
      render(<StudentsAttendance />);
    });

    expect(fetchStudents).toHaveBeenCalled();
    expect(fetchTodayAttendance).toHaveBeenCalled();
    expect(fetchStats).toHaveBeenCalled();
    expect(fetchRoutes).toHaveBeenCalled();
  });

  it('renders student data after loading', async () => {
    await act(async () => {
      render(<StudentsAttendance />);
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('10th')).toBeInTheDocument();
    });
  });

  it('opens create student modal and submits form', async () => {
    (createStudent as any).mockResolvedValue({ success: true, parentCredentials: { email: 'parent@example.com', temporaryPassword: 'password123' } });

    await act(async () => {
      render(<StudentsAttendance />);
    });

    const registerButton = await screen.findByText('Add New Student');
    fireEvent.click(registerButton);

    const rfidInput = await screen.findByPlaceholderText('e.g. RFID-123456789');
    const nameInput = await screen.findByPlaceholderText('e.g. John Doe');
    const parentNameInput = await screen.findByPlaceholderText('e.g. Mr. Smith');
    const parentEmailInput = await screen.findByPlaceholderText('e.g. alex.parent@example.com');

    fireEvent.change(rfidInput, { target: { value: 'RFID-999' } });
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    fireEvent.change(parentNameInput, { target: { value: 'Mr. Doe' } });
    fireEvent.change(parentEmailInput, { target: { value: 'doe@example.com' } });

    const submitButton = screen.getByText('Register Student');

    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(createStudent).toHaveBeenCalledWith({
      rfidTag: 'RFID-999',
      name: 'Jane Doe',
      grade: undefined,
      parentEmail: 'doe@example.com',
      parentName: 'Mr. Doe'
    });

    await waitFor(() => {
      expect(screen.getByText('Student Added!')).toBeInTheDocument();
      expect(screen.getByText('parent@example.com')).toBeInTheDocument();
      expect(screen.getByText('password123')).toBeInTheDocument();
    });
  });

  it('opens assign modal and submits', async () => {
    (assignStudentToStop as any).mockResolvedValue({ success: true });

    await act(async () => {
      render(<StudentsAttendance />);
    });

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const assignButton = await screen.findByText('Assign Bus');
    fireEvent.click(assignButton);

    const routeSelect = await screen.findByDisplayValue('Select a Route');
    fireEvent.change(routeSelect, { target: { value: 'route1' } });

    const stopSelect = await screen.findByDisplayValue('Select a Stop');
    fireEvent.change(stopSelect, { target: { value: 'stop1' } });

    const confirmButton = screen.getByText('Confirm Assignment');

    await act(async () => {
      fireEvent.click(confirmButton);
    });

    expect(assignStudentToStop).toHaveBeenCalledWith({
      studentId: '1',
      routeStopId: 'stop1'
    });
  });
});
