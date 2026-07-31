"use client";

import React from 'react';
import { Bus, Map, Route, Users, CalendarDays, Settings, HelpCircle, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: Bus },
    { id: 'map', label: 'Live Fleet Map', icon: Map },
    { id: 'drivers', label: 'Drivers', icon: Users },
    { id: 'routes', label: 'Manage Routes', icon: Route },
    { id: 'students', label: 'Students & Attendance', icon: Users },
    { id: 'leaves', label: 'Leave Requests', icon: CalendarDays },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 shrink-0">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="bg-orange-600 text-white p-2 rounded-lg">
            <Bus size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight">Voltava</h1>
            <p className="text-xs text-slate-400 font-medium">India HQ</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 py-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive 
                  ? "bg-orange-600 text-white font-medium" 
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <Icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors mb-4 shadow-sm">
          <AlertTriangle size={16} />
          Emergency Broadcast
        </button>
        
        <div className="space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-md transition-colors">
            <Settings size={18} className="text-slate-400" />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-md transition-colors">
            <HelpCircle size={18} className="text-slate-400" />
            Support
          </button>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-medium tracking-wide">VOLTAVA MOBILITY INDIA 🇮🇳</p>
        </div>
      </div>
    </aside>
  );
}
