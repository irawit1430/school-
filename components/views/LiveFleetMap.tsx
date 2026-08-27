"use client";
import React, { useState, useEffect } from 'react';
import { Bell, Settings, Filter, Layers, Bus, MoreVertical, PhoneCall, Focus, MessageSquare, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchBuses, fetchDrivers, API_URL } from '@/lib/api';
import { io } from 'socket.io-client';

export function LiveFleetMap() {
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial fetch
    Promise.all([fetchBuses(), fetchDrivers()])
      .then(([busesData, driversData]) => {
        setBuses(busesData);
        setDrivers(driversData);
        setLoading(false);
      }).catch(err => {
        console.error(err);
        setLoading(false);
      });

    // Socket.io connection
    const socket = io(API_URL);


    // Listen to real-time location updates from hardware telemetry
    socket.on('location_update', (data: any) => {
      setBuses(prev => prev.map(b => {
        if (b.id === data.busId || b.id === data.id) { // fallback check for busId vs id
          return {
            ...b,
            capacity: data.capacity || b.capacity,
            driverName: data.driverName || b.driverName,
            routeName: data.routeName || b.routeName,
            gpsLogs: [{
              lat: data.lat,
              lng: data.lng,
              speed: data.speed,
              timestamp: data.timestamp
            }]
          };
        }
        return b;
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);


  const activeDriverByBusId = React.useMemo(() => {
    const map = new Map(); // Active driver lookup
    drivers.forEach(d => {
      if (d.driverTrips) {
        d.driverTrips.forEach((t: any) => {
          if (t.status === 'ON_SCHEDULE' || t.status === 'PLANNED') {
            if (!map.has(t.busId)) {
              map.set(t.busId, d);
            }
          }
        });
      }
    });
    return map;
  }, [drivers]);

  const activeBusesCount = buses.filter(b => b.status === 'active').length;


  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Map Area */}
      <div className="flex-1 bg-slate-200 relative">
         <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:24px_24px]"></div>
         {/* Simulated Map Background */}
         <img src="https://picsum.photos/seed/mapbg/1920/1080" alt="Map Background" className="absolute inset-0 w-full h-full object-cover opacity-50 slatescale" />
         
         <div className="absolute inset-0 flex items-center justify-center">
             {/* Map over real buses if they have coordinates, otherwise fallback */}
             {buses.map((bus, idx) => {
               // Fallback coordinates if none exist, just scatter them around the center
               const latestLog = bus.gpsLogs?.[0];
               const top = latestLog?.lat ? `${(latestLog.lat % 1) * 100}%` : `${20 + (idx * 15) % 60}%`;
               const left = latestLog?.lng ? `${(latestLog.lng % 1) * 100}%` : `${30 + (idx * 20) % 50}%`;
               const speed = latestLog?.speed || 0;
               
               const isAlert = speed > 60; // Mock speeding condition
               const isDelayed = bus.status === 'delayed';

               return (
                 <div key={bus.id} className="absolute flex flex-col items-center" style={{ top, left }}>
                   <div className={clsx(
                     "w-8 h-8 rounded-full text-white flex items-center justify-center shadow-lg border-2 border-white relative z-10",
                     isAlert ? "bg-red-500 animate-pulse" : isDelayed ? "bg-amber-500" : "bg-emerald-500"
                   )}>
                     <Bus size={14} />
                   </div>
                   <div className={clsx(
                     "backdrop-blur text-white px-2 py-1 rounded text-[10px] mt-1 shadow-md",
                     isAlert ? "bg-red-900/80" : isDelayed ? "bg-amber-900/80" : "bg-slate-900/80"
                   )}>
                     {bus.name}
                   </div>
                 </div>
               );
             })}
         </div>

         {/* Floating Map Controls */}
         <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200 shadow-md p-4 w-64">
           <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
             <Layers size={16} className="text-slate-500" /> Map Layers
           </h4>
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <span className="text-sm font-medium text-slate-700">Traffic View</span>
               <div className="w-8 h-4 bg-orange-600 rounded-full relative cursor-pointer">
                 <div className="w-3 h-3 bg-white rounded-full absolute right-0.5 top-0.5"></div>
               </div>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm font-medium text-slate-700">Satellite View</span>
               <div className="w-8 h-4 bg-slate-200 rounded-full relative cursor-pointer">
                 <div className="w-3 h-3 bg-white rounded-full absolute left-0.5 top-0.5 shadow"></div>
               </div>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-sm font-medium text-slate-700">School Zones</span>
               <div className="w-8 h-4 bg-orange-600 rounded-full relative cursor-pointer">
                 <div className="w-3 h-3 bg-white rounded-full absolute right-0.5 top-0.5"></div>
               </div>
             </div>
           </div>
           
           <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-900 mb-3">Fleet Status Legend</h4>
              <div className="space-y-2 text-sm text-slate-600 font-medium">
                 <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> On Schedule</div>
                 <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div> Delayed (5m+)</div>
                 <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> Alert / Overspeed</div>
              </div>
           </div>
         </div>

         {/* Bottom Controls */}
         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md p-1.5 flex gap-1 text-slate-600">
               <button className="p-2 hover:bg-slate-100 rounded transition-colors"><Focus size={18} /></button>
               <button className="p-2 hover:bg-slate-100 rounded transition-colors"><Layers size={18} /></button>
               <button className="p-2 hover:bg-slate-100 rounded transition-colors"><Settings size={18} /></button>
            </div>
            <button className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2.5 rounded-lg shadow-md font-semibold transition-colors flex items-center gap-2 text-sm">
              <Focus size={16} /> Recenter All
            </button>
         </div>
      </div>

      {/* Sidebar List */}
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col relative z-10">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Active Fleet</h3>
            <span className="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-1 rounded-md">{activeBusesCount} Online</span>
          </div>
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filter by status or driver..." 
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-500 focus:bg-white"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {buses.length > 0 ? buses.map((bus) => {
            const isAlert = bus.gpsStatus?.speed > 60;
            const isDelayed = bus.status === 'delayed';
            const isActive = bus.status === 'active';
            
            const activeDriver = activeDriverByBusId.get(bus.id);
            const resolvedDriverName = activeDriver?.name || (bus.driverName !== 'Unassigned' ? bus.driverName : null) || bus.driver?.user?.name || 'Unassigned';
            
            return (
              <div key={bus.id} className={clsx(
                "p-4 rounded-xl border shadow-sm",
                isAlert ? "border-red-200 bg-red-50/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]" :
                isDelayed ? "border-amber-100 bg-amber-50/30" :
                isActive ? "border-emerald-100 bg-emerald-50/30" : "border-slate-200 bg-slate-50"
              )}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={clsx(
                      "p-1.5 rounded",
                      isAlert ? "bg-red-100 text-red-700" :
                      isDelayed ? "bg-amber-100 text-amber-700" :
                      isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                    )}>
                      {isAlert ? <AlertTriangle size={14} /> : <Bus size={14} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 leading-tight">{bus.name || bus.licensePlate}</h4>
                      <p className="text-[10px] font-medium text-slate-500">{bus.routeName || bus.registrationNumber}</p>
                    </div>
                  </div>
                  <div className={clsx(
                    "w-2 h-2 rounded-full mt-1",
                    isAlert ? "bg-red-500 animate-pulse" :
                    isDelayed ? "bg-amber-500" :
                    isActive ? "bg-emerald-500" : "bg-slate-300"
                  )}></div>
                </div>
                <div className="flex justify-between items-center text-xs mt-3">
                   <div>
                      <p className="text-slate-400 uppercase tracking-wider text-[9px] font-bold">Driver / Cap</p>
                      <p className="font-medium text-slate-900">{resolvedDriverName} ({bus.capacity})</p>
                   </div>
                    <div className="text-right">
                      <p className={clsx(
                        "uppercase tracking-wider text-[9px] font-bold",
                        isAlert ? "text-red-400" : "text-slate-400"
                      )}>{isAlert ? 'Alert' : 'Speed'}</p>
                      <p className={clsx(
                        "font-medium",
                        isAlert ? "text-red-600 font-bold" : "text-slate-900"
                      )}>
                        {bus.gpsLogs?.[0]?.speed ? `${bus.gpsLogs[0].speed.toFixed(1)} km/h` : '0 km/h'}
                      </p>
                   </div>
                </div>
                {isActive || isAlert || isDelayed ? (
                  <div className="mt-3 flex gap-2">
                    <button className={clsx(
                      "flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded transition-colors shadow-sm",
                      isAlert ? "text-white bg-red-600 hover:bg-red-700" : "text-orange-600 bg-white border border-orange-100 hover:bg-orange-50"
                    )}>
                      {isAlert ? <><PhoneCall size={12} /> Call Driver</> : <><MessageSquare size={12} /> Contact</>}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 text-center py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-400">
                     Offline
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="text-center p-4 text-slate-500 text-sm">Loading buses...</div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
           <button className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm shadow-sm">
             <Bell size={16} /> Broadcast Message to Fleet
           </button>
        </div>
      </div>
    </div>
  );
}
