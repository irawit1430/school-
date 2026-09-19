import type { DriverRecord, DriverTrip } from '../../lib/drivers';

const buses = [
  { id: 'bus-a', licensePlate: 'DL 1P 1234', capacity: 40, isAvailable: false },
  { id: 'bus-b', licensePlate: 'DL 1P 5678', capacity: 32, isAvailable: false },
  { id: 'bus-c', licensePlate: 'DL 1P 9012', capacity: 40, isAvailable: true },
];
const routes = [{ id: 'route-a', name: 'North Gate' }, { id: 'route-b', name: 'West Campus' }];
let drivers: DriverRecord[] = [
  { id: 'driver-a', name: 'Asha Kumar', email: 'asha@example.test', phone: '+91 9000000001', driverTrips: [
    { id: 'trip-a', driverId: 'driver-a', busId: buses[0].id, bus: buses[0], routeId: routes[0].id, route: routes[0], status: 'DELAYED', scheduledStart: '2026-09-05T01:45:00Z' },
    { id: 'trip-b', driverId: 'driver-a', busId: buses[0].id, bus: buses[0], routeId: routes[0].id, route: routes[0], status: 'PLANNED', scheduledStart: '2026-09-06T01:45:00Z' },
  ] },
  { id: 'driver-b', name: 'Ravi Sharma', email: 'ravi@example.test', phone: null, driverTrips: [
    { id: 'trip-c', driverId: 'driver-b', busId: buses[1].id, bus: buses[1], routeId: routes[1].id, route: routes[1], status: 'PLANNED', scheduledStart: '2026-09-06T02:00:00Z' },
    { id: 'trip-d', driverId: 'driver-b', busId: buses[1].id, bus: buses[1], routeId: routes[1].id, route: routes[1], status: 'PLANNED', scheduledStart: null },
  ] },
  { id: 'driver-c', name: 'Noor Ali', email: 'noor@example.test', phone: '+91 9000000002', driverTrips: [] },
];
export const fetchDrivers = async () => structuredClone(drivers);
export const clearApiCache = () => {};
export const fetchBuses = async () => structuredClone(buses);
export const fetchRoutes = async () => structuredClone(routes);
export const apiErrorMessage = (error: Error, fallback: string) => error.message || fallback;
export const updateDriver = async (id: string, data: Partial<DriverRecord>) => {
  drivers = drivers.map(driver => driver.id === id ? { ...driver, ...data } : driver);
};
export const deleteDriver = async (id: string) => { drivers = drivers.filter(driver => driver.id !== id); };
export const createDriver = async (data: { name: string; email: string; phone?: string }) => {
  const driver = { ...data, id: `driver-${Date.now()}`, driverTrips: [] };
  drivers.push(driver);
  return { driver, tempPassword: 'local-preview-only' };
};
export const updateTripStatus = async (id: string, status: string) => {
  drivers = drivers.map(driver => ({ ...driver, driverTrips: driver.driverTrips?.map(trip => trip.id === id ? { ...trip, status } : trip) }));
};
export const updateTrip = async (id: string, data: Partial<DriverTrip>) => {
  drivers = drivers.map(driver => ({ ...driver, driverTrips: driver.driverTrips?.map(trip => trip.id === id ? {
    ...trip, ...data, bus: buses.find(bus => bus.id === (data.busId ?? trip.busId)), route: routes.find(route => route.id === (data.routeId ?? trip.routeId)),
  } : trip) }));
};
export const createTrip = async (data: { busId: string; routeId: string; driverId: string; direction: 'TO_SCHOOL' | 'FROM_SCHOOL'; scheduledStart?: string }) => {
  const trip = { ...data, id: `trip-${Date.now()}`, status: 'PLANNED', bus: buses.find(bus => bus.id === data.busId), route: routes.find(route => route.id === data.routeId) };
  drivers = drivers.map(driver => driver.id === data.driverId ? { ...driver, driverTrips: [...(driver.driverTrips ?? []), trip] } : driver);
  return trip;
};
