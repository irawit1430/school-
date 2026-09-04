import { test, expect } from '@playwright/test';
import { getBusDisplayName, getBusOperationalStatus } from '../lib/buses';

test('uses a friendly fleet label before the registration number', () => {
  expect(getBusDisplayName({ fleetNumber: '12', registrationNumber: 'DL 1P 1234' })).toBe('Bus 12');
  expect(getBusDisplayName({ displayName: 'Junior Wing', registrationNumber: 'DL 1P 1234' })).toBe('Junior Wing');
  expect(getBusDisplayName({ registrationNumber: 'DL 1P 1234' })).toBe('DL 1P 1234');
});

test('does not claim a bus is active when operational status is missing', () => {
  expect(getBusOperationalStatus({})).toEqual({ label: 'Status unavailable', tone: 'neutral' });
  expect(getBusOperationalStatus({ operationalStatus: 'MAINTENANCE' })).toEqual({ label: 'Maintenance', tone: 'warning' });
  expect(getBusOperationalStatus({ operationalStatus: 'OUT_OF_SERVICE' })).toEqual({ label: 'Out of service', tone: 'danger' });
});
