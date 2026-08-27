import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './page';
import { useRouter } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: ({ activeTab, setActiveTab }: any) => (
    <div data-testid="sidebar">
      <span>{activeTab}</span>
      <button onClick={() => setActiveTab('routes')}>Set Routes</button>
      <button onClick={() => setActiveTab('drivers')}>Set Drivers</button>
      <button onClick={() => setActiveTab('students')}>Set Students</button>
      <button onClick={() => setActiveTab('map')}>Set Map</button>
      <button onClick={() => setActiveTab('leaves')}>Set Leaves</button>
      <button onClick={() => setActiveTab('unknown')}>Set Unknown</button>
    </div>
  ),
}));

vi.mock('@/components/layout/Header', () => ({ Header: () => <div data-testid="header" /> }));
vi.mock('@/components/layout/EmergencyAlertBanner', () => ({ EmergencyAlertBanner: () => <div data-testid="emergency-banner" /> }));

vi.mock('@/components/views/Overview', () => ({ Overview: () => <div data-testid="overview" /> }));
vi.mock('@/components/views/ManageRoutes', () => ({ ManageRoutes: () => <div data-testid="manage-routes" /> }));
vi.mock('@/components/views/StudentsAttendance', () => ({ StudentsAttendance: () => <div data-testid="students-attendance" /> }));
vi.mock('@/components/views/LiveFleetMap', () => ({ LiveFleetMap: () => <div data-testid="live-fleet-map" /> }));
vi.mock('@/components/views/LeaveRequests', () => ({ LeaveRequests: () => <div data-testid="leave-requests" /> }));
vi.mock('@/components/views/DriversList', () => ({ DriversList: () => <div data-testid="drivers-list" /> }));

describe('Dashboard', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as unknown as any).mockReturnValue({ push: mockPush });
    localStorage.clear();
  });

  it('redirects to login if token is missing', async () => {
    render(<Dashboard />);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('redirects to login if user is missing', async () => {
    localStorage.setItem('token', 'mock-token');
    render(<Dashboard />);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('renders loading state initially and then renders dashboard if authenticated', async () => {
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem('user', 'mock-user');

    render(<Dashboard />);

    // Initially renders loading spinner
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    // After timeout, it should render dashboard content
    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('emergency-banner')).toBeInTheDocument();
      expect(screen.getByTestId('overview')).toBeInTheDocument();
    });
  });

  it('renders all tab content correctly', async () => {
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem('user', 'mock-user');

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    // Default overview
    expect(screen.getByTestId('overview')).toBeInTheDocument();

    // Routes
    act(() => { screen.getByText('Set Routes').click(); });
    expect(screen.getByTestId('manage-routes')).toBeInTheDocument();

    // Drivers
    act(() => { screen.getByText('Set Drivers').click(); });
    expect(screen.getByTestId('drivers-list')).toBeInTheDocument();

    // Students
    act(() => { screen.getByText('Set Students').click(); });
    expect(screen.getByTestId('students-attendance')).toBeInTheDocument();

    // Map
    act(() => { screen.getByText('Set Map').click(); });
    expect(screen.getByTestId('live-fleet-map')).toBeInTheDocument();

    // Leaves
    act(() => { screen.getByText('Set Leaves').click(); });
    expect(screen.getByTestId('leave-requests')).toBeInTheDocument();

    // Unknown (should render overview by default)
    act(() => { screen.getByText('Set Unknown').click(); });
    expect(screen.getByTestId('overview')).toBeInTheDocument();
  });
});
