"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchBuses, fetchLeaves, fetchStats, approveLeave, rejectLeave, fetchRoutes, fetchDrivers, connectSocket, apiErrorMessage } from '@/lib/api';
import { subscribeToBusPositions, mergeBusPosition, reconcileFleet } from '@/lib/liveBuses';
import { leaveDays, formatDay, type LeaveDates } from '@/lib/leaves';
import { Bus, Map, AlertTriangle, Users, CalendarDays, CheckCircle, RefreshCw } from 'lucide-react';
import { MetricCard } from './overview/MetricCard';
import { LiveMapWidget } from './overview/LiveMapWidget';
import { ActiveRoutesWidget } from './overview/ActiveRoutesWidget';
import { RecentLeavesWidget } from './overview/RecentLeavesWidget';

// --- TypeScript Interfaces add kiye gaye hain ---
interface Student { name: string; }
interface Leave extends LeaveDates {
  id: string;
  student?: Student;
  reason: string;
}
interface Trip {
  id: string;
  status: string;
  driverId: string;
  progressPercent?: number;
  currentEtaMessage?: string;
}
interface RouteData {
  id: string;
  name: string;
  trips?: Trip[];
}
interface Driver {
  id: string;
  name: string;
}
interface Stats {
  totalStudents?: number;
  totalBuses?: number;
  totalRoutes?: number;
  activeDevices?: number;
  offlineDevices?: number;
  pendingLeaves?: number;
}

import toast from 'react-hot-toast';

export function Overview() {
  const [buses, setBuses] = useState<any[]>([]); // Add Bus interface later if needed
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Separate, because a routes outage must not blank the metric cards and a stats
  // outage must not hide the trips.
  const [coreError, setCoreError] = useState('');
  const [tripsError, setTripsError] = useState('');

  /**
   * Reloaded on an interval and on focus, because this is the screen most likely left
   * open on a second monitor all morning — which is what a dashboard is for. It used to
   * load once on mount and then quietly rot for hours while looking authoritative.
   */
  const loadData = useCallback(async () => {
    setRefreshing(true);

    // Routes and drivers only feed the Trips in Progress widget, and the routes payload
    // carries every stop on every route. Blocking the metric cards and the map on them
    // meant the whole dashboard waited for the heaviest call of the five.
    //
    // Deliberately NOT ?summary=1: the summary shape has no `trips`, and the widget is
    // built entirely from r.trips. Switching this to summary makes the panel silently
    // empty — it renders fine, it just shows nothing.
    void Promise.all([fetchRoutes(), fetchDrivers()])
      .then(([routesData, driversData]) => {
        setRoutes(Array.isArray(routesData) ? routesData : []);
        setDrivers(Array.isArray(driversData) ? driversData : []);
        setTripsError('');
      })
      .catch(err => setTripsError(apiErrorMessage(err, 'Trips are unavailable.')));

    try {
      const [busesData, leavesData, statsData] = await Promise.all([
        fetchBuses(),
        fetchLeaves('pending'),
        fetchStats(),
      ]);
      // This polls every 60s and again on every window focus, so assigning the payload
      // outright meant the markers lost their live positions once a minute.
      setBuses(prev => reconcileFleet(prev, Array.isArray(busesData) ? busesData : []));
      setLeaves(Array.isArray(leavesData) ? leavesData : []);
      setStats(statsData);
      setCoreError('');
      setLastUpdated(new Date());
    } catch (error) {
      setCoreError(apiErrorMessage(error, 'Could not load dashboard data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    const refreshVisible = () => { if (document.visibilityState !== 'hidden') void loadData(); };
    const interval = window.setInterval(refreshVisible, 60_000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);

    // Socket.io connection for real-time telemetry
    const socket = connectSocket();

    const stopPositions = subscribeToBusPositions(socket, batch => {
      setBuses(prev => prev.map(b => {
        const data = batch.get(b.id);
        return data ? mergeBusPosition(b, data) : b;
      }));
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      stopPositions();
      socket.disconnect();
    };
  }, [loadData]);

  const handleApproveLeave = async (id: string) => {
    try {
      await approveLeave(id);
      setLeaves(prev => prev.filter(l => l.id !== id));
      toast.success('Leave approved successfully');
    } catch (e) {
      console.error(e);
      toast.error(apiErrorMessage(e, 'Failed to approve leave.'));
    }
  };

  const handleRejectLeave = async (id: string) => {
    try {
      await rejectLeave(id);
      setLeaves(prev => prev.filter(l => l.id !== id));
      toast.success('Leave rejected successfully');
    } catch (e) {
      console.error(e);
      toast.error(apiErrorMessage(e, 'Failed to reject leave.'));
    }
  };


  
  // Transform leaves from API to match UI (useMemo added for performance)
  const displayLeaves = useMemo(() => 
    leaves.slice(0, 5).map(leave => ({
      id: leave.id,
      student: leave.student?.name || 'Unknown',
      initials: (leave.student?.name || 'U').substring(0, 2).toUpperCase(),
      date: formatDay(leaveDays(leave).start),
      reason: leave.reason,
      color: "bg-orange-100 text-orange-700",
      rawId: leave.id
    })), [leaves]);

  const activeTripsList = useMemo(() => routes.flatMap(r => {
    return (r.trips || []).filter((t: Trip) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').map((t: Trip) => {
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
  }), [routes, drivers]);

  /**
   * What to print on a tile.
   *
   * `—` means we are still loading. A failed first load has nothing cached, and printing
   * `—` there left six cards looking like they were still working while the banner above
   * them said the refresh had failed. `0` stays `0` — a successful zero is a real answer,
   * and on this screen "0 buses with GPS offline" has to be distinguishable from "we do
   * not know", because one of them means every bus is accounted for.
   */
  const figure = (value: number | undefined): number | string =>
    value ?? (coreError ? 'Unavailable' : '—');

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 lg:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Command Centre</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Loading…'}
            {refreshing && ' · refreshing'}
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : undefined} /> Refresh
        </button>
      </div>

      {coreError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Couldn&apos;t refresh the dashboard.</p>
          <p className="mt-0.5">{coreError}</p>
          {lastUpdated && <p className="mt-1">Figures below are from {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>}
          <button disabled={refreshing} onClick={() => void loadData()} className="mt-2 font-semibold underline disabled:opacity-50">Retry</button>
        </div>
      )}

      {/* Metrics Row
          Operational figures first, asset totals after. The order used to be Students,
          Buses, Routes, then GPS — so the first three things an operator read at 07:30
          were counts that had not changed since the school was set up, and the one number
          that could mean a bus is missing sat fifth. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6">
        <MetricCard
          title="Buses with GPS Offline"
          href="/map?filter=silent"
          value={figure(stats?.offlineDevices)}
          loading={loading}
          icon={AlertTriangle}
          color="warning"
        />
        <MetricCard
          title="GPS Devices Online"
          href="/map?filter=reporting"
          value={figure(stats?.activeDevices)}
          loading={loading}
          icon={CheckCircle}
          color="success"
        />
        <MetricCard
          title="Pending Leaves"
          href="/leaves"
          // The pending list arrives in the same call, so its length stands in when the
          // stats payload omits the count. `?? leaves.length` on its own would have printed
          // 0 whenever the call failed, which on a queue of decisions is the wrong lie.
          value={figure(stats ? (stats.pendingLeaves ?? leaves.length) : undefined)}
          loading={loading}
          icon={CalendarDays}
          color="slate"
        />
        <MetricCard
          title="Total Students"
          href="/students"
          value={figure(stats?.totalStudents)}
          loading={loading}
          icon={Users}
          color="primary"
        />
        <MetricCard
          title="Total Buses"
          href="/buses"
          value={figure(stats?.totalBuses)}
          loading={loading}
          icon={Bus}
          color="primary"
        />
        <MetricCard
          title="Total Routes"
          href="/routes"
          value={figure(stats?.totalRoutes)}
          loading={loading}
          icon={Map}
          color="primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
        {/* Live Fleet Map Widget (Left 2 columns) */}
        <LiveMapWidget buses={buses} />

        {/* Active Routes & Recent Leaves (Right Column) */}
        <div className="space-y-4 md:space-y-6 lg:space-y-8">
          <ActiveRoutesWidget activeTripsList={activeTripsList} error={tripsError} onRetry={() => void loadData()} />
        </div>
      </div>

      {/* Recent Leave Applications */}
      <RecentLeavesWidget displayLeaves={displayLeaves} handleApproveLeave={handleApproveLeave} handleRejectLeave={handleRejectLeave} />
    </div>
  );
}
