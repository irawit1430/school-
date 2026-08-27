"use client";
import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { API_URL } from '@/lib/api';
import { io } from 'socket.io-client';

export function EmergencyAlertBanner() {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    
    let user;
    try {
      user = JSON.parse(userStr);
    } catch (e) {
      return;
    }

    const socket = io(API_URL);
    
    socket.on('emergency_alert', (alert) => {
      console.warn("CRITICAL: Emergency Alert Received!", alert);
      // Check if it belongs to admin's school or if user is SUPER_ADMIN
      if (alert.schoolId === user.schoolId || user.role === 'SUPER_ADMIN') {
        setAlerts(prev => [alert, ...prev]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-3xl px-4 pointer-events-none">
      {alerts.map((alert, idx) => (
        <div key={idx} className="bg-rose-600 text-white p-4 rounded-xl shadow-2xl flex items-start gap-4 pointer-events-auto border-2 border-rose-400">
          <div className="bg-rose-500/50 p-2 rounded-lg animate-pulse shrink-0">
            <AlertTriangle size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg leading-tight flex items-center gap-2">
              EMERGENCY ALERT 
              <span className="text-xs bg-white text-rose-600 px-2 py-0.5 rounded-full font-bold tracking-wider uppercase">
                {alert.type || 'SOS'}
              </span>
            </h3>
            <p className="text-sm text-rose-100 mt-1 font-medium">{alert.message || "An emergency was triggered from one of the active fleet vehicles."}</p>
          </div>
          <button 
            onClick={() => setAlerts(prev => prev.filter((_, i) => i !== idx))}
            className="p-2 hover:bg-rose-500 rounded-lg transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>
      ))}
    </div>
  );
}
