import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dashboard from './page';
import { useRouter } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: ({ activeTab, setActiveTab }: any) => (
    <div data-testid="sidebar">
      <button onClick={() => setActiveTab('overview')}>OverviewTab</button>
      <button onClick={() => setActiveTab('drivers')}>DriversTab</button>
      <button onClick={() => setActiveTab('routes')}>RoutesTab</button>
      <button onClick={() => setActiveTab('students')}>StudentsTab</button>
      <button onClick={() => setActiveTab('map')}>MapTab</button>
      <button onClick={() => setActiveTab('leaves')}>LeavesTab</button>
      <button onClick={() => setActiveTab('unknown')}>UnknownTab</button>
    </div>
  ),
}));
vi.mock('@/components/layout/Header', () => ({ Header: () => <div data-testid="header" /> }));
vi.mock('@/components/views/Overview', () => ({ Overview: () => <div data-testid="overview" /> }));
vi.mock('@/components/views/ManageRoutes', () => ({ ManageRoutes: () => <div data-testid="manage-routes" /> }));
vi.mock('@/components/views/StudentsAttendance', () => ({ StudentsAttendance: () => <div data-testid="students-attendance" /> }));
vi.mock('@/components/views/LiveFleetMap', () => ({ LiveFleetMap: () => <div data-testid="live-fleet-map" /> }));
vi.mock('@/components/views/LeaveRequests', () => ({ LeaveRequests: () => <div data-testid="leave-requests" /> }));
vi.mock('@/components/views/DriversList', () => ({ DriversList: () => <div data-testid="drivers-list" /> }));
vi.mock('@/components/layout/EmergencyAlertBanner', () => ({ EmergencyAlertBanner: () => <div data-testid="emergency-alert-banner" /> }));

describe('Dashboard Component', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any);
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login if token or user is missing', () => {
    const { container } = render(<Dashboard />);
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders loading state initially and then dashboard if authenticated', async () => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('user', 'fake-user');

    render(<Dashboard />);

    expect(mockPush).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('emergency-alert-banner')).toBeInTheDocument();
    expect(screen.getByTestId('overview')).toBeInTheDocument();
  });

  it('renders correct component based on activeTab', async () => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('user', 'fake-user');

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('DriversTab'));
    expect(screen.getByTestId('drivers-list')).toBeInTheDocument();

    fireEvent.click(screen.getByText('RoutesTab'));
    expect(screen.getByTestId('manage-routes')).toBeInTheDocument();

    fireEvent.click(screen.getByText('StudentsTab'));
    expect(screen.getByTestId('students-attendance')).toBeInTheDocument();

    fireEvent.click(screen.getByText('MapTab'));
    expect(screen.getByTestId('live-fleet-map')).toBeInTheDocument();

    fireEvent.click(screen.getByText('LeavesTab'));
    expect(screen.getByTestId('leave-requests')).toBeInTheDocument();

    fireEvent.click(screen.getByText('UnknownTab'));
    expect(screen.getByTestId('overview')).toBeInTheDocument(); // default case
  });
});
