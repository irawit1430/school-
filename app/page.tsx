"use client";
import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Overview } from '@/components/views/Overview';
import { ManageRoutes } from '@/components/views/ManageRoutes';
import { StudentsAttendance } from '@/components/views/StudentsAttendance';
import { LiveFleetMap } from '@/components/views/LiveFleetMap';
import { LeaveRequests } from '@/components/views/LeaveRequests';
import { DriversList } from '@/components/views/DriversList';
import { EmergencyAlertBanner } from '@/components/layout/EmergencyAlertBanner';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (!token || !user) {
      router.push('/login');
    } else {
      setTimeout(() => {
        setIsAuthenticated(true);
      }, 0);
    }
  }, [router]);

  if (!isAuthenticated) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
    </div>;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'drivers':
        return <DriversList />;
      case 'routes':
        return <ManageRoutes />;
      case 'students':
        return <StudentsAttendance />;
      case 'map':
        return <LiveFleetMap />;
      case 'leaves':
        return <LeaveRequests />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 relative">
      <EmergencyAlertBanner />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex-1 ml-64 flex flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
