"use client";
import React from 'react';
import { Search, Bell, Clock, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export function Header({ title = "St. Andrews Academy", subtitle }: HeaderProps) {
  const router = useRouter();
  // Simple static date/time for mockup
  const time = "12:45 PM";
  const date = "Oct 24, 2023";

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10 shrink-0">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {subtitle && (
          <>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-slate-500 font-medium">{subtitle}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search data..." 
            className="pl-10 pr-4 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md text-sm w-64 transition-all outline-none"
          />
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500 border-r border-slate-200 pr-4">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-700">{time}</span>
            <span className="text-[10px] uppercase tracking-wider">{date}</span>
          </div>
          <Clock size={18} className="text-slate-400" />
        </div>

        <div className="flex items-center gap-3">
          <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
          </button>
          
          <div className="flex items-center gap-3 pl-2 border-l border-slate-100">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-semibold text-slate-900 leading-none">Admin User</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Fleet Manager</span>
            </div>
            <img 
              src="https://picsum.photos/seed/admin/100/100" 
              alt="Admin User" 
              className="w-9 h-9 rounded-full border border-slate-200"
            />
            <button 
              onClick={handleLogout}
              className="ml-2 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
