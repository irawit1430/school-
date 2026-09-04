export type BusStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

type BusIdentity = {
  displayName?: string | null;
  name?: string | null;
  fleetNumber?: string | number | null;
  registrationNumber?: string | null;
  licensePlate?: string | null;
};

const nonEmpty = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text || null;
};

export const getBusRegistration = (bus: BusIdentity): string | null =>
  nonEmpty(bus.registrationNumber) || nonEmpty(bus.licensePlate);

export const getBusDisplayName = (bus: BusIdentity): string => {
  const named = nonEmpty(bus.displayName) || nonEmpty(bus.name);
  if (named) return named;

  const fleetNumber = nonEmpty(bus.fleetNumber);
  if (fleetNumber) return /^bus\b/i.test(fleetNumber) ? fleetNumber : `Bus ${fleetNumber}`;

  return getBusRegistration(bus) || 'Unnamed bus';
};

const STATUS: Record<string, { label: string; tone: BusStatusTone }> = {
  ACTIVE: { label: 'Available', tone: 'success' },
  AVAILABLE: { label: 'Available', tone: 'success' },
  MAINTENANCE: { label: 'Maintenance', tone: 'warning' },
  OUT_OF_SERVICE: { label: 'Out of service', tone: 'danger' },
  INACTIVE: { label: 'Out of service', tone: 'danger' },
};

export const getBusOperationalStatus = (bus: { operationalStatus?: string | null }) =>
  STATUS[String(bus.operationalStatus ?? '').toUpperCase()] ?? {
    label: 'Status unavailable',
    tone: 'neutral' as const,
  };
