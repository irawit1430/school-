"use client";
import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { connectSocket, getUser } from '@/lib/api';

export function EmergencyAlertBanner() {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const user = getUser();
    if (!user) return;

    const socket = connectSocket();
    
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
      {alerts.map((alert, idx) => {
        const isDelay = alert.type === 'DELAY';
        const bgColor = isDelay ? 'bg-orange-600 border-orange-400' : 'bg-rose-600 border-rose-400';
        const iconBg = isDelay ? 'bg-orange-500/50' : 'bg-rose-500/50';
        const textColor = isDelay ? 'text-orange-100' : 'text-rose-100';
        const badgeColor = isDelay ? 'text-orange-600' : 'text-rose-600';
        const titleText = isDelay ? 'ROUTE DELAY' : 'EMERGENCY ALERT';
        const defaultMsg = isDelay ? 'A vehicle has reported a routine traffic delay.' : 'An emergency was triggered from one of the active fleet vehicles.';

        return (
          <div key={idx} className={`${bgColor} text-white p-4 rounded-xl shadow-2xl flex items-start gap-4 pointer-events-auto border-2`}>
            <div className={`${iconBg} p-2 rounded-lg animate-pulse shrink-0`}>
              <AlertTriangle size={24} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg leading-tight flex items-center gap-2">
                {titleText}
                <span className={`text-xs bg-white ${badgeColor} px-2 py-0.5 rounded-full font-bold tracking-wider uppercase`}>
                  {alert.type || 'SOS'}
                </span>
              </h3>
              <p className={`text-sm ${textColor} mt-1 font-medium`}>{alert.message || defaultMsg}</p>
            </div>
          <button 
            onClick={() => setAlerts(prev => prev.filter((_, i) => i !== idx))}
            className="p-2 hover:bg-rose-500 rounded-lg transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>
        );
      })}
    </div>
  );
}
