"use client";

import React from 'react';
import { Bus, Map, Route, Users, CalendarDays, Settings, HelpCircle, AlertTriangle, LogOut, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { clearAuth } from '@/lib/api';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await clearAuth();
    router.push('/login');
  };

  const handleEmergencyBroadcast = () => {
    toast('Emergency Broadcast is not available yet.', { icon: '🚧' });
  };

  const handleComingSoon = (feature: string) => {
    toast(`${feature} is coming soon.`, { icon: '🚧' });
  };

  const menuItems = [
    { href: '/overview', label: 'Overview', icon: Bus },
    { href: '/map', label: 'Live Fleet Map', icon: Map },
    { href: '/buses', label: 'Manage Buses', icon: Bus },
    { href: '/drivers', label: 'Drivers', icon: Users },
    { href: '/routes', label: 'Manage Routes', icon: Route },
    { href: '/students', label: 'Students & Attendance', icon: Users },
    { href: '/leaves', label: 'Leave Requests', icon: CalendarDays },
  ];

  return (
    <>
      {/* Mobile overlay */}
      <div
        onClick={onClose}
        className={clsx(
          "fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
      />

      <aside
        className={clsx(
          "w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 shrink-0 z-40 transition-transform duration-300 ease-in-out lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-white p-2 rounded-lg">
            <Bus size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight">Voltava</h1>
            <p className="text-xs text-slate-400 font-medium">India HQ</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-4 py-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary text-white font-medium"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <Icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={handleEmergencyBroadcast}
          className="w-full flex items-center justify-center gap-2 bg-danger hover:bg-danger-hover text-white py-2 px-4 rounded-md text-sm font-medium transition-colors mb-4 shadow-sm"
        >
          <AlertTriangle size={16} />
          Emergency Broadcast
        </button>

        <div className="space-y-1">
          <button
            onClick={() => handleComingSoon('Settings')}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
          >
            <Settings size={18} className="text-slate-400" />
            Settings
          </button>
          <button
            onClick={() => handleComingSoon('Support')}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
          >
            <HelpCircle size={18} className="text-slate-400" />
            Support
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors text-rose-400 hover:text-rose-300 hover:bg-slate-800">
            <LogOut size={18} />
            Logout
          </button>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-medium tracking-wide">VOLTAVA MOBILITY INDIA 🇮🇳</p>
        </div>
      </div>
      </aside>
    </>
  );
}
