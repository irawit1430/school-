import { getBusDisplayName, getBusRegistration } from './buses';
import type { Direction } from './runs';

export interface DriverBus {
  id: string;
  licensePlate?: string | null;
  registrationNumber?: string | null;
  displayName?: string | null;
  capacity?: number;
  isAvailable?: boolean;
  trips?: DriverTrip[];
}

export interface DriverTrip {
  id: string;
  status: string;
  busId?: string | null;
  routeId?: string | null;
  driverId?: string | null;
  direction?: Direction | null;
  scheduledStart?: string | null;
  bus?: DriverBus | null;
  route?: { id?: string; name: string } | null;
}

export interface DriverRecord {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  driverTrips?: DriverTrip[];
}

export type DriverFilter = 'all' | 'running' | 'planned' | 'unassigned';

const departure = (trip: DriverTrip) => {
  const time = Date.parse(trip.scheduledStart ?? '');
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
};

export function getDriverTrips(driver: DriverRecord) {
  const trips = driver.driverTrips ?? [];
  const running = trips.filter(trip => ['ON_SCHEDULE', 'DELAYED'].includes(trip.status));
  const planned = trips.filter(trip => trip.status === 'PLANNED')
    .sort((a, b) => departure(a) - departure(b) || a.id.localeCompare(b.id));
  const activity: Exclude<DriverFilter, 'all'> = running.length ? 'running' : planned.length ? 'planned' : 'unassigned';
  return { running, planned, activity, primary: running[0] ?? planned[0] ?? null };
}

export function matchesDriverSearch(driver: DriverRecord, query: string) {
  const search = query.trim().toLocaleLowerCase();
  const fields = [driver.name, driver.email, driver.phone,
    ...(driver.driverTrips ?? []).flatMap(trip => [trip.route?.name,
      trip.bus && getBusDisplayName(trip.bus), trip.bus && getBusRegistration(trip.bus)])];
  return !search || fields.some(value => {
    const text = String(value ?? '').toLocaleLowerCase();
    return text.includes(search) || text.replace(/[\s+-]/g, '').includes(search.replace(/[\s+-]/g, ''));
  });
}

export function buildDriverUpdate(form: { name: string; email: string; phone: string; password: string }) {
  return {
    name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null,
    ...(form.password ? { password: form.password } : {}),
  };
}

export function toLocalDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDeparture(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Departure time not set';
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
