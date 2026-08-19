/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, Clock, LogOut, Bus, Map, Users, Route } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { CONFIG } from '@/lib/config';
import { fetchNotifications as fetchNotifs, markAllNotificationsRead, markNotificationRead, searchGlobal, getUser, getToken, clearAuth } from '@/lib/api';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

interface SearchResult {
  id: string;
  type: string; // 'student', 'driver', 'bus', 'route'
  name: string;
  detail: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function Header({ title = "Voltava", subtitle }: HeaderProps) {
  const router = useRouter();
  const [time, setTime] = useState<string>("--:-- --");
  const [date, setDate] = useState<string>("--- --, ----");
  const [userName, setUserName] = useState<string>("User");
  const [userRole, setUserRole] = useState<string>("Role");
  const [token, setToken] = useState<string>("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Populate user details from local storage
    try {
      const user = getUser();
      const storedToken = getToken();
      if (storedToken) setToken(storedToken);
      if (user) {
        setUserName(user.name || user.email || 'Admin User');
        setUserRole(user.role || 'Fleet Manager');
      }
    } catch (e) {
      console.error("Failed to parse user from local storage");
    }

    // Real-time clock update
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    };
    
    updateTime(); // Initial call
    const timerId = setInterval(updateTime, 60000); // Update every minute
    
    return () => clearInterval(timerId);
  }, []);

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const data = await fetchNotifs();
      if (Array.isArray(data)) {
        setNotifications(data);
      }
    } catch {
      // Quietly handle notification polling errors
    }
  };

  useEffect(() => {
    fetchNotifications();
    const notifTimer = setInterval(fetchNotifications, 60000); // Poll every minute
    return () => clearInterval(notifTimer);
  }, [token]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Search
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim() || !token) {
        setSearchResults([]);
        return;
      }
      
      setIsSearching(true);
      try {
        const data = await searchGlobal(searchQuery);
        setSearchResults(data.results || data || []);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, token]);

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  const markAllAsRead = async () => {
    if (!token) return;
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const markAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getSearchIcon = (type: string) => {
    if (!type) return <Search size={14} className="text-slate-500" />;
    switch (type.toLowerCase()) {
      case 'student': return <Users size={14} className="text-blue-500" />;
      case 'driver': return <Users size={14} className="text-orange-500" />;
      case 'bus': return <Bus size={14} className="text-emerald-500" />;
      case 'route': return <Route size={14} className="text-purple-500" />;
      default: return <Search size={14} className="text-slate-500" />;
    }
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
        <div className="relative" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search students, drivers..." 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchDropdown(true);
            }}
            onFocus={() => setShowSearchDropdown(true)}
            className="pl-10 pr-4 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-md text-sm w-64 transition-all outline-none"
          />
          
          {showSearchDropdown && searchQuery.trim() !== '' && (
            <div className="absolute top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-md shadow-lg py-2 max-h-80 overflow-y-auto z-50">
              {isSearching ? (
                <div className="px-4 py-3 text-sm text-slate-500 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Searching...
                </div>
              ) : searchResults.length > 0 ? (
                <ul>
                  {searchResults.map((result) => (
                    <li key={result.id} className="px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-start gap-3 border-b border-slate-50 last:border-0 transition-colors">
                      <div className="mt-0.5 p-1.5 bg-slate-100 rounded-md">
                        {getSearchIcon(result.type)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">{result.name}</div>
                        <div className="text-xs text-slate-500">{result.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500 text-center">
                  No results found for &quot;{searchQuery}&quot;
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500 border-r border-slate-200 pr-4">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-700">{time}</span>
            <span className="text-[10px] uppercase tracking-wider">{date}</span>
          </div>
          <Clock size={18} className="text-slate-400" />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white border-2 border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            
            {showNotifDropdown && (
              <div className="absolute top-full mt-2 right-0 w-80 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <h3 className="font-bold text-slate-900 text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-xs text-orange-600 font-medium hover:text-orange-700 transition-colors"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length > 0 ? (
                    <ul className="divide-y divide-slate-100">
                      {notifications.map((notif) => (
                        <li 
                          key={notif.id} 
                          className={clsx(
                            "px-4 py-3 hover:bg-slate-50 transition-colors relative group",
                            !notif.isRead ? "bg-orange-50/30" : ""
                          )}
                        >
                          {!notif.isRead && (
                            <span className="absolute left-2 top-4 w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                          )}
                          <div className={clsx("pl-2 flex justify-between gap-2", !notif.isRead ? "font-medium" : "")}>
                            <div>
                              <div className="text-sm text-slate-900">{notif.title}</div>
                              <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.message}</div>
                              <div className="text-[10px] text-slate-400 mt-1">
                                {new Date(notif.createdAt).toLocaleString(undefined, {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </div>
                            </div>
                            {!notif.isRead && (
                              <button 
                                onClick={(e) => markAsRead(notif.id, e)}
                                className="opacity-0 group-hover:opacity-100 text-xs text-orange-600 hover:text-orange-700 transition-opacity whitespace-nowrap self-start"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="py-8 px-4 text-center text-slate-500 text-sm flex flex-col items-center">
                      <Bell size={24} className="text-slate-300 mb-2" />
                      <p>You have no notifications</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3 pl-2 border-l border-slate-100">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-semibold text-slate-900 leading-none">{userName}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{userRole.replace('_', ' ')}</span>
            </div>
            <img 
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`}
              alt={userName} 
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
