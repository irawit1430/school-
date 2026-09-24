import React from 'react';
import { getBusDisplayName } from '@/lib/buses';

const when = (trip: any) => {
  const at = Date.parse(trip.scheduledStart ?? '');
  return Number.isFinite(at)
    ? new Date(at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : null;
};

const label = (trip: any) =>
  [trip.route?.name, trip.bus && getBusDisplayName(trip.bus), when(trip)].filter(Boolean).join(' · ') || 'another trip';

/**
 * The warning for a driver put on two trips at once — see findDriverClashes().
 *
 * A warning, not a block: the admin may be about to move the other trip, and the server
 * still refuses to let the driver start the second one while the first is live.
 */
export function DriverClashWarning({ driverName, clashes }: { driverName?: string | null; clashes: any[] }) {
  if (!clashes.length) return null;
  const who = driverName || 'This driver';
  const running = clashes.filter(trip => trip.status === 'ON_SCHEDULE' || trip.status === 'DELAYED');
  return (
    <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      <p className="font-semibold">
        {running.length === clashes.length
          ? `${who} is driving another trip right now.`
          : `${who} already has ${clashes.length === 1 ? 'a trip' : `${clashes.length} trips`} at this time.`}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {clashes.map(trip => (
          <li key={trip.id}>{label(trip)}{running.includes(trip) ? ' (running now)' : ''}</li>
        ))}
      </ul>
      <p className="mt-1">A driver can only run one trip at a time, so they won&apos;t be able to start this one until the other ends. Pick another driver or change the departure time.</p>
    </div>
  );
}
