"use client";
import React, { useState, useEffect } from 'react';
import { fetchBuses, fetchLeaves, fetchStats, approveLeave, rejectLeave, fetchRoutes, fetchDrivers } from '@/lib/api';
import { Bus, Map, AlertTriangle, Users, CalendarDays, CheckCircle, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { activeRoutes as mockActiveRoutes, recentLeaves as mockRecentLeaves } from '@/lib/mock-data';

export function Overview() {
  const [buses, setBuses] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [busesData, leavesData, statsData, routesData, driversData] = await Promise.all([
          fetchBuses(),
          fetchLeaves('pending'),
          fetchStats(),
          fetchRoutes(),
          fetchDrivers()
        ]);
        setBuses(busesData);
        setLeaves(leavesData);
        setStats(statsData);
        setRoutes(routesData);
        setDrivers(driversData);
      } catch (error) {
        console.error('Failed to load overview data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleApproveLeave = async (id: string) => {
    try {
      await approveLeave(id);
      setLeaves(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error(e);
      alert('Failed to approve leave');
    }
  };

  const handleRejectLeave = async (id: string) => {
    try {
      await rejectLeave(id);
      setLeaves(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error(e);
      alert('Failed to reject leave');
    }
  };

  const activeBusesCount = buses.filter(b => b.status === 'active').length;
  
  // Transform leaves from API to match UI
  const displayLeaves = leaves.slice(0, 5).map(leave => ({
    id: leave.id,
    student: leave.student?.name || 'Unknown',
    initials: (leave.student?.name || 'U').substring(0, 2).toUpperCase(),
    date: new Date(leave.startDate).toLocaleDateString(),
    reason: leave.reason,
    color: "bg-orange-100 text-orange-700",
    rawId: leave.id
  }));

  const activeTripsList = routes.flatMap(r => {
    return (r.trips || []).filter((t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').map((t: any) => {
      const assignedDriver = drivers.find(d => d.id === t.driverId);
      return {
        id: t.id,
        name: r.name,
        driver: assignedDriver?.name || 'Unassigned',
        progress: t.progressPercent || 0,
        type: t.status === 'DELAYED' ? 'warning' : 'good',
        eta: t.currentEtaMessage || (t.status === 'DELAYED' ? 'Delayed' : 'On Schedule')
      };
    });
  });

  return (
    <div className="p-6 space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard 
          title="Total Students" 
          value={loading ? '...' : stats?.totalStudents || 0}
          icon={Users}
          color="blue" 
        />
        <MetricCard 
          title="Total Buses" 
          value={loading ? '...' : stats?.totalBuses || 0}
          icon={Bus}
          color="blue" 
        />
        <MetricCard 
          title="Total Routes" 
          value={loading ? '...' : stats?.totalRoutes || 0} 
          icon={Map} 
          color="blue" 
        />
        <MetricCard 
          title="Active Devices" 
          value={loading ? '...' : stats?.activeDevices || 0}
          icon={CheckCircle}
          color="emerald" 
        />
        <MetricCard 
          title="Offline Devices" 
          value={loading ? '...' : stats?.offlineDevices || 0}
          icon={AlertTriangle}
          color="amber" 
        />
        <MetricCard 
          title="Pending Leaves" 
          value={loading ? '...' : stats?.pendingLeaves || leaves.length || 0} 
          subtitle="Urgent"
          icon={CalendarDays} 
          color="slate" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Fleet Map Widget (Left 2 columns) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Map size={18} className="text-orange-600" /> Live Fleet Map
            </h3>
            <div className="flex gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 bg-orange-50 px-2 py-0.5 rounded">Real-time</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-0.5">Heatmap</span>
            </div>
          </div>
          <div className="flex-1 bg-orange-50/50 p-6 flex items-center justify-center relative min-h-[400px]">
             {/* Map Placeholder Graphic */}
             <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]"></div>
             
             {/* Bus 4 Marker */}
             <div className="absolute top-1/4 left-1/4 flex flex-col items-center">
               <div className="bg-white px-3 py-1.5 rounded shadow-md border border-slate-200 mb-1 z-10">
                 <p className="text-xs font-bold text-slate-900">Bus 4</p>
                 <p className="text-[10px] text-slate-500">Speed: 45 km/h</p>
               </div>
               <div className="w-8 h-8 bg-orange-600 rounded-full text-white flex items-center justify-center shadow-lg border-2 border-white relative z-10">
                 <Bus size={14} />
               </div>
             </div>

             {/* Bus 7 Marker */}
             <div className="absolute top-1/2 right-1/3 flex flex-col items-center">
               <div className="bg-white px-3 py-1.5 rounded shadow-md border border-slate-200 mb-1 z-10">
                 <p className="text-xs font-bold text-slate-900">Bus 7</p>
                 <p className="text-[10px] text-slate-500">Speed: 52 km/h</p>
               </div>
               <div className="w-8 h-8 bg-emerald-500 rounded-full text-white flex items-center justify-center shadow-lg border-2 border-white relative z-10">
                 <Bus size={14} />
               </div>
             </div>

             <div className="absolute bottom-4 left-4 flex gap-3 text-xs font-medium bg-white/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-slate-200">
               <span className="flex items-center gap-1.5 text-slate-700"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> On Schedule</span>
               <span className="flex items-center gap-1.5 text-slate-700"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Delayed</span>
             </div>
          </div>
        </div>

        {/* Active Routes & Recent Leaves (Right Column) */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">Active Routes</h3>
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{activeTripsList.length} Live</span>
            </div>
            
            <div className="space-y-3">
              {activeTripsList.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-4">No active trips currently.</div>
              ) : activeTripsList.map((route: any) => (
                <div key={route.id} className="p-3 border border-slate-100 rounded-lg hover:border-slate-200 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-900">{route.name}</h4>
                      <p className="text-[11px] text-slate-500">Driver: {route.driver}</p>
                    </div>
                    <span className={clsx(
                      "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded",
                      route.type === 'good' ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"
                    )}>
                      {route.progress}% Done
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                    <div 
                      className={clsx("h-1.5 rounded-full", route.type === 'good' ? "bg-emerald-500" : "bg-amber-500")} 
                      style={{ width: `${route.progress}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                    <Clock size={12} className={route.type === 'warning' ? "text-amber-500" : "text-slate-400"} />
                    <span className={route.type === 'warning' ? "text-amber-600" : ""}>{route.eta}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <button className="w-full mt-4 text-xs font-bold text-orange-600 hover:text-orange-700 py-1.5 rounded-md transition-colors">
              View All Routes
            </button>
          </div>
        </div>
      </div>

      {/* Recent Leave Applications */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800">Recent Leave Applications</h4>
          <select className="text-xs font-medium border border-slate-200 rounded py-1 px-2 bg-white text-slate-700 outline-none focus:border-orange-500">
            <option>All Statuses</option>
            <option>Pending</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 border-b border-slate-100">Student Name</th>
                <th className="px-4 py-3 border-b border-slate-100">Date</th>
                <th className="px-4 py-3 border-b border-slate-100">Reason</th>
                <th className="px-4 py-3 border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayLeaves.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No pending leave applications.
                  </td>
                </tr>
              ) : (
                displayLeaves.map((leave) => (
                  <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px]", leave.color)}>
                          {leave.initials}
                        </div>
                        <span className="font-medium text-slate-900 text-xs">{leave.student}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">{leave.date}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{leave.reason}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleApproveLeave((leave as any).rawId || (leave as any).id)}
                          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handleRejectLeave((leave as any).rawId || (leave as any).id)}
                          className="bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 px-3 py-1 rounded text-xs font-medium transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-slate-100 text-center">
           <button className="text-[11px] font-bold text-orange-600 hover:text-orange-700 uppercase tracking-wider">View All Applications</button>
        </div>
      </div>
    </div>
  );
}

// Subcomponent for Metric Cards
function MetricCard({ title, value, trend, icon: Icon, color, isWarning = false, subtitle }: any) {
  const colorStyles: Record<string, string> = {
    blue: "text-orange-600",
    amber: "text-amber-500",
    emerald: "text-emerald-500",
    slate: "text-slate-500"
  };
  
  const iconColor = colorStyles[color] || "text-slate-500";

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-[104px]">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <Icon size={16} className={iconColor} />
      </div>
      <div className="flex items-end justify-between">
        <h3 className="text-2xl font-bold text-slate-900 leading-none">{value}</h3>
        {trend && (
          <span className={clsx("text-xs font-medium px-2 py-0.5 rounded", trend.startsWith('+') || trend.endsWith('%') ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50")}>
            {trend}
          </span>
        )}
        {subtitle && (
          <span className="text-[10px] uppercase font-bold text-slate-400">{subtitle}</span>
        )}
      </div>
    </div>
  );
}
