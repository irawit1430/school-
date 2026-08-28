"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { fetchBuses, fetchLeaves, fetchStats, approveLeave, rejectLeave, fetchRoutes, fetchDrivers, connectSocket, apiErrorMessage } from '@/lib/api';
import { subscribeToBusPositions, mergeBusPosition } from '@/lib/liveBuses';
import { Bus, Map, AlertTriangle, Users, CalendarDays, CheckCircle, Clock } from 'lucide-react';
import { MetricCard } from './overview/MetricCard';
import { LiveMapWidget } from './overview/LiveMapWidget';
import { ActiveRoutesWidget } from './overview/ActiveRoutesWidget';
import { RecentLeavesWidget } from './overview/RecentLeavesWidget';

// --- TypeScript Interfaces add kiye gaye hain ---
interface Student { name: string; }
interface Leave {
  id: string;
  student?: Student;
  startDate: string;
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
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    loadData();

    // Socket.io connection for real-time telemetry
    const socket = connectSocket();

    socket.on('connect', () => {
      console.log('Connected to fleet socket for Dashboard Map');
    });

    const stopPositions = subscribeToBusPositions(socket, batch => {
      setBuses(prev => prev.map(b => {
        const data = batch.get(b.id);
        return data ? mergeBusPosition(b, data) : b;
      }));
    });

    return () => {
      stopPositions();
      socket.disconnect();
    };
  }, []);

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
      date: new Date(leave.startDate).toLocaleDateString(),
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

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 lg:space-y-8">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6">
        <MetricCard
          title="Total Students"
          value={stats?.totalStudents ?? '—'}
          loading={loading}
          icon={Users}
          color="primary"
        />
        <MetricCard
          title="Total Buses"
          value={stats?.totalBuses ?? '—'}
          loading={loading}
          icon={Bus}
          color="primary"
        />
        <MetricCard
          title="Total Routes"
          value={stats?.totalRoutes ?? '—'}
          loading={loading}
          icon={Map}
          color="primary"
        />
        <MetricCard
          title="Active Devices"
          value={stats?.activeDevices ?? '—'}
          loading={loading}
          icon={CheckCircle}
          color="success"
        />
        <MetricCard
          title="Offline Devices"
          value={stats?.offlineDevices ?? '—'}
          loading={loading}
          icon={AlertTriangle}
          color="warning"
        />
        <MetricCard
          title="Pending Leaves"
          value={stats?.pendingLeaves ?? leaves.length ?? '—'}
          loading={loading}
          subtitle="Urgent"
          icon={CalendarDays}
          color="slate"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
        {/* Live Fleet Map Widget (Left 2 columns) */}
        <LiveMapWidget buses={buses} />

        {/* Active Routes & Recent Leaves (Right Column) */}
        <div className="space-y-4 md:space-y-6 lg:space-y-8">
          <ActiveRoutesWidget activeTripsList={activeTripsList} />
        </div>
      </div>

      {/* Recent Leave Applications */}
      <RecentLeavesWidget displayLeaves={displayLeaves} handleApproveLeave={handleApproveLeave} handleRejectLeave={handleRejectLeave} />
    </div>
  );
}
