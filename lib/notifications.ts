export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  status?: string;
  kind?: 'ordinary' | 'emergency';
  metadata?: Record<string, any>;
}

const EMERGENCY_TYPES = new Set(['DRIVER_SOS', 'HARDWARE_SOS', 'SOS', 'DELAY']);

const defaultTitle = (type: string): string => {
  if (type === 'DELAY') return 'Route delay';
  if (EMERGENCY_TYPES.has(type)) return 'Emergency alert';
  if (type === 'PASSWORD_RESET') return 'Password reset requested';
  return 'Notification';
};

export const normalizeNotification = (
  raw: any,
  kind?: 'ordinary' | 'emergency',
): AppNotification => {
  const type = String(raw?.type || 'SYSTEM').toUpperCase();
  const createdAt = raw?.createdAt || raw?.created_at || raw?.timestamp || new Date().toISOString();
  const message = raw?.message || raw?.body || raw?.content || '';
  const id = String(raw?.id || raw?._id || raw?.notificationId || `${type}:${createdAt}:${message}`);

  return {
    ...raw,
    id,
    type,
    title: raw?.title || defaultTitle(type),
    message,
    isRead: typeof raw?.isRead === 'boolean'
      ? raw.isRead
      : typeof raw?.read === 'boolean'
        ? raw.read
        : Boolean(raw?.readAt || raw?.status === 'READ'),
    createdAt,
    status: raw?.status ? String(raw.status).toUpperCase() : undefined,
    kind,
    metadata: raw?.metadata || {},
  };
};

export const isEmergencyNotification = (notification: { type?: string; status?: string; kind?: string }): boolean => {
  if (notification.kind) return notification.kind === 'emergency';
  return ['ACTIVE', 'RESOLVED'].includes(String(notification.status || '').toUpperCase());
};

export const isActiveEmergency = (notification: { type?: string; status?: string }): boolean =>
  isEmergencyNotification(notification) && String(notification.status || 'ACTIVE').toUpperCase() !== 'RESOLVED';

export const notificationSeverity = (type?: string): 'critical' | 'warning' | 'info' => {
  const normalized = String(type || '').toUpperCase();
  if (['DRIVER_SOS', 'HARDWARE_SOS', 'SOS'].includes(normalized)) return 'critical';
  if (normalized === 'DELAY') return 'warning';
  return 'info';
};

export const mergeNotification = (
  existing: AppNotification[],
  incoming: AppNotification,
  limit = 50,
): AppNotification[] => {
  const withoutOlderCopy = existing.filter(item => item.id !== incoming.id);
  return [incoming, ...withoutOlderCopy]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
};
