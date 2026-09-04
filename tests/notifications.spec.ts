import { test, expect } from '@playwright/test';
import {
  isEmergencyNotification,
  mergeNotification,
  normalizeNotification,
  notificationSeverity,
} from '../lib/notifications';

test('normalizes REST and socket notification variants to one shape', () => {
  expect(normalizeNotification({
    _id: 'n-1',
    type: 'driver_sos',
    body: 'Driver pressed SOS',
    readAt: '2026-09-04T08:00:00.000Z',
    timestamp: '2026-09-04T07:59:00.000Z',
  })).toMatchObject({
    id: 'n-1',
    type: 'DRIVER_SOS',
    title: 'Emergency alert',
    message: 'Driver pressed SOS',
    isRead: true,
    createdAt: '2026-09-04T07:59:00.000Z',
  });
});

test('upserts a repeated socket event instead of duplicating it', () => {
  const first = normalizeNotification({ id: 'n-1', title: 'Old', createdAt: '2026-09-04T07:00:00.000Z' });
  const update = normalizeNotification({ id: 'n-1', title: 'Updated', createdAt: '2026-09-04T08:00:00.000Z' });
  const merged = mergeNotification([first], update);

  expect(merged).toHaveLength(1);
  expect(merged[0].title).toBe('Updated');
});

test('keeps emergency lifecycle separate from presentation severity', () => {
  expect(isEmergencyNotification({ type: 'HARDWARE_SOS', status: 'ACTIVE' })).toBe(true);
  expect(isEmergencyNotification({ type: 'DELAY', status: 'RESOLVED' })).toBe(true);
  expect(isEmergencyNotification({ type: 'DELAY' })).toBe(false);
  expect(isEmergencyNotification({ type: 'SOS' })).toBe(false);
  expect(notificationSeverity('DRIVER_SOS')).toBe('critical');
  expect(notificationSeverity('DELAY')).toBe('warning');
  expect(notificationSeverity('PASSWORD_RESET')).toBe('info');
});
