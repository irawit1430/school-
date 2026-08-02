import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriversList } from './DriversList';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  fetchDrivers: vi.fn(),
  fetchBuses: vi.fn(),
  fetchRoutes: vi.fn(),
  createDriver: vi.fn(),
  createTrip: vi.fn(),
}));

describe('DriversList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(api.fetchDrivers).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.fetchBuses).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.fetchRoutes).mockImplementation(() => new Promise(() => {}));

    render(<DriversList />);
    expect(screen.getByText('Loading drivers...')).toBeInTheDocument();
  });

  it('renders drivers list after data is loaded', async () => {
    const mockDrivers = [
      { id: '1', name: 'John Doe', email: 'john@example.com', currentTrip: null },
      { id: '2', name: 'Jane Smith', email: 'jane@example.com', currentTrip: { bus: { licensePlate: 'ABC-123' }, route: { name: 'Route A' } } },
    ];

    vi.mocked(api.fetchDrivers).mockResolvedValue(mockDrivers);
    vi.mocked(api.fetchBuses).mockResolvedValue([]);
    vi.mocked(api.fetchRoutes).mockResolvedValue([]);

    render(<DriversList />);

    await waitFor(() => {
      expect(screen.queryByText('Loading drivers...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    // Test for Jane Smith
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();

    // In DriversList.tsx:
    // {currentTrip && currentTrip.bus ? currentTrip.bus.licensePlate : 'Unassigned'}
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
  });

  it('opens add driver modal, submits form, and shows credentials', async () => {
    vi.mocked(api.fetchDrivers).mockResolvedValue([]);
    vi.mocked(api.fetchBuses).mockResolvedValue([]);
    vi.mocked(api.fetchRoutes).mockResolvedValue([]);
    vi.mocked(api.createDriver).mockResolvedValue({
      driver: { id: '3', name: 'New Driver', email: 'new@example.com' },
      tempPassword: 'password123'
    });

    render(<DriversList />);

    await waitFor(() => {
      expect(screen.queryByText('Loading drivers...')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Driver/i }));

    expect(screen.getByText('Add New Driver')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. Raju Kumar'), { target: { value: 'New Driver' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. raju@yourfleet.com'), { target: { value: 'new@example.com' } });

    // The submit button also has "Add Driver"
    const buttons = screen.getAllByRole('button', { name: /Add Driver/i });
    const submitBtn = buttons.find(b => b.getAttribute('type') === 'submit') || buttons[1];
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createDriver).toHaveBeenCalledWith({ name: 'New Driver', email: 'new@example.com' });
    });

    expect(screen.getByText('Driver Created Successfully!')).toBeInTheDocument();
    expect(screen.getByText('password123')).toBeInTheDocument();
  });

  it('opens assign trip modal, selects bus and route, and submits', async () => {
    const mockDrivers = [
      { id: '1', name: 'John Doe', email: 'john@example.com', currentTrip: null },
    ];
    const mockBuses = [{ id: 'b1', licensePlate: 'BUS-001', capacity: 40 }];
    const mockRoutes = [{ id: 'r1', name: 'Route 1' }];

    vi.mocked(api.fetchDrivers).mockResolvedValue(mockDrivers);
    vi.mocked(api.fetchBuses).mockResolvedValue(mockBuses);
    vi.mocked(api.fetchRoutes).mockResolvedValue(mockRoutes);
    vi.mocked(api.createTrip).mockResolvedValue({ id: 't1' });

    render(<DriversList />);

    await waitFor(() => {
      expect(screen.queryByText('Loading drivers...')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Assign Trip'));

    expect(screen.getByText('Assign Trip to John Doe')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');

    // First select is Bus, Second is Route
    fireEvent.change(selects[0], { target: { value: 'b1' } });
    fireEvent.change(selects[1], { target: { value: 'r1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Assignment' }));

    await waitFor(() => {
      expect(api.createTrip).toHaveBeenCalled();
    });

    // Verify arguments separately
    const createTripCall = vi.mocked(api.createTrip).mock.calls[0][0];
    expect(createTripCall.driverId).toBe('1');
    expect(createTripCall.busId).toBe('b1');
    expect(createTripCall.routeId).toBe('r1');
  });
});
