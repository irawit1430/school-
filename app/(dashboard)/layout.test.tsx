import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRouter } from 'next/navigation';
import DashboardLayout from './layout';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/overview'),
}));

vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('@/components/layout/Header', () => ({ Header: () => <div data-testid="header" /> }));
vi.mock('@/components/layout/EmergencyAlertBanner', () => ({
  EmergencyAlertBanner: () => <div data-testid="emergency-banner" />,
}));

describe('DashboardLayout', () => {
  const mockReplace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as unknown as any).mockReturnValue({ replace: mockReplace });
    localStorage.clear();
  });

  it('redirects to login and renders nothing if the token is missing', () => {
    const { container } = render(
      <DashboardLayout>
        <div data-testid="page" />
      </DashboardLayout>
    );

    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('page')).not.toBeInTheDocument();
  });

  it('renders the dashboard shell around the page when authenticated', async () => {
    localStorage.setItem('token', 'mock-token');

    render(
      <DashboardLayout>
        <div data-testid="page" />
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('emergency-banner')).toBeInTheDocument();
      expect(screen.getByTestId('page')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
