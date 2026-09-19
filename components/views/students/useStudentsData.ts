import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage, clearApiCache, fetchNotifications, fetchStats, fetchStudents, fetchTodayAttendance } from '@/lib/api';
import type { AppNotification } from '@/lib/notifications';
import type { AttendanceLog, StudentRecord } from '@/lib/students';

type Resource = 'roster' | 'stats' | 'notifications';
type RequestState = { sequence: number; pending: Promise<void> | null };

export function useStudentsData() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [stats, setStats] = useState<{ lateArrivals?: number; studentsGrowthPercent?: number } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requests = useRef<Record<Resource, RequestState>>({
    roster: { sequence: 0, pending: null }, stats: { sequence: 0, pending: null }, notifications: { sequence: 0, pending: null },
  });

  const refresh = useCallback(async (force = false, supersede = false) => {
    if (force) clearApiCache();
    const start = (resource: Resource, load: (current: () => boolean) => Promise<void>) => {
      const state = requests.current[resource];
      // A slow request must be allowed to finish between polling ticks. A completed
      // write can supersede an older read, and each optional panel has its own clock.
      if (state.pending && !supersede) return state.pending;
      const sequence = ++state.sequence;
      const current = () => state.sequence === sequence;
      const pending = load(current).finally(() => { if (current()) state.pending = null; });
      state.pending = pending;
      return pending;
    };

    // Optional panels must not hold up the roster or replace it with an error screen.
    const rosterRequest = start('roster', current => {
      setRefreshing(true);
      return Promise.all([fetchStudents(), fetchTodayAttendance()])
      .then(([rows, logs]) => {
        if (!current()) return;
        if (!Array.isArray(rows) || !Array.isArray(logs)) throw new Error('Unexpected student data. Please retry.');
        setStudents(rows);
        setAttendance(logs);
        setLastUpdated(new Date());
        setError(null);
      })
      .catch(reason => { if (current()) setError(apiErrorMessage(reason, 'Could not load students and attendance.')); })
      .finally(() => { if (current()) { setLoading(false); setRefreshing(false); } });
    });

    const statsRequest = start('stats', current => fetchStats({ strict: true })
      .then(value => { if (current()) { setStats(value); setStatsError(null); } })
      .catch(reason => { if (current()) { setStats(null); setStatsError(apiErrorMessage(reason, 'Statistics unavailable.')); } }));

    const notificationsRequest = start('notifications', current => {
      setNotificationsLoading(true);
      return fetchNotifications()
      .then(value => { if (current()) { setNotifications(value); setNotificationsError(null); } })
      .catch(reason => { if (current()) setNotificationsError(apiErrorMessage(reason, 'Alerts unavailable.')); })
      .finally(() => { if (current()) setNotificationsLoading(false); });
    });

    await Promise.all([rosterRequest, statsRequest, notificationsRequest]);
  }, []);

  useEffect(() => {
    const requestStates = requests.current;
    void refresh();
    const refreshVisible = () => { if (document.visibilityState !== 'hidden') void refresh(true); };
    const interval = window.setInterval(refreshVisible, 30_000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      for (const state of Object.values(requestStates)) { state.sequence++; state.pending = null; }
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refresh]);

  return { students, attendance, stats, notifications, loading, refreshing, notificationsLoading,
    error, statsError, notificationsError, lastUpdated, refresh };
}
