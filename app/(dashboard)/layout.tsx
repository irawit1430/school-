"use client";
import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { EmergencyAlertBanner } from '@/components/layout/EmergencyAlertBanner';
import { SessionExpiryNotice } from '@/components/layout/SessionExpiryNotice';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toaster } from 'react-hot-toast';
import { getToken } from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /**
   * Three states, not two. `isAuth` being false covered both "we have not looked yet" and
   * "there is no token, we are leaving" — and those want opposite things on screen: a
   * loading shell for the first, nothing at all for the second. Showing a dashboard
   * skeleton to someone who is about to be bounced to the login page flashes a screen
   * they will never get.
   */
  const [status, setStatus] = useState<'checking' | 'authed' | 'redirecting'>('checking');

  useEffect(() => {
    // The token is in this browser's storage, which the prerendered page cannot read:
    // it has to be checked after mount, so this state is set from an effect on purpose.
    const authed = Boolean(getToken());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(authed ? 'authed' : 'redirecting');
    if (!authed) router.replace('/login');
  }, [router]);

  // Close the mobile drawer whenever the route changes: noticed during render, the
  // way React recommends for state that follows a value, instead of an effect that
  // painted the open drawer on the new page first.
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setSidebarOpen(false);
  }

  // On the way to the login page: render nothing, so no dashboard is implied.
  if (status === 'redirecting') return null;

  // Still checking. This used to return null too, so every cold load painted a blank white
  // page with nothing to say it was working — and the app is statically exported, so that
  // is every load, on the hardware schools actually use.
  if (status === 'checking') {
    return (
      <div className="flex min-h-screen bg-slate-50" role="status" aria-label="Loading dashboard">
        <div className="hidden w-64 shrink-0 bg-slate-900 lg:block" />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 relative">
      <Toaster position="top-right" />
      <EmergencyAlertBanner />
      <SessionExpiryNotice />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
