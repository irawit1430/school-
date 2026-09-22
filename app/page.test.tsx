import { describe, it, expect, vi } from 'vitest';
import { redirect } from 'next/navigation';
import Home from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// The dashboard used to be one page that switched views by tab. Each view is now its own
// route under app/(dashboard)/, and the auth guard lives in that group's layout — see
// app/(dashboard)/layout.test.tsx. The root only forwards to the default view.
describe('Home', () => {
  it('redirects to the overview', () => {
    Home();
    expect(redirect).toHaveBeenCalledWith('/overview');
  });
});
