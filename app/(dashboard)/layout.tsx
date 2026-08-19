"use client";
import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { EmergencyAlertBanner } from '@/components/layout/EmergencyAlertBanner';
import { Toaster } from 'react-hot-toast';
import { getToken } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen bg-slate-50 relative">
      <Toaster position="top-right" />
      <EmergencyAlertBanner />
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
