import React from 'react';
import type { Direction } from '@/lib/runs';

/**
 * Which way the bus is going on this trip.
 *
 * Required, and deliberately not defaulted. A trip saved with `direction: null`
 * costs the driver app its stop order and the parent app its wording, but
 * defaulting to TO_SCHOOL is worse than null: an afternoon trip then ships
 * confidently mislabelled — pickup stop order, "Board" instead of "Drop off".
 * Make the admin say which leg it is, the same way the run form does.
 */
export const TRIP_DIRECTIONS: { value: Direction; label: string; hint: string }[] = [
  { value: 'TO_SCHOOL', label: 'Pickup', hint: 'Home → school' },
  { value: 'FROM_SCHOOL', label: 'Drop-off', hint: 'School → home' },
];

export function DirectionToggle({ value, onChange, disabled, error, name = 'trip-direction' }: {
  value: Direction | '';
  onChange: (direction: Direction) => void;
  disabled?: boolean;
  error?: string;
  /** Unique per form — two toggles mounted at once must not share a radio group. */
  name?: string;
}) {
  return (
    <fieldset disabled={disabled} className="disabled:opacity-50">
      <legend className="block text-sm font-semibold text-slate-700 mb-1">
        Direction <span className="text-red-500">*</span>
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {TRIP_DIRECTIONS.map(option => (
          <label
            key={option.value}
            className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 transition-colors ${
              value === option.value
                ? 'border-orange-500 bg-orange-50'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="accent-orange-600"
              />
              {option.label}
            </span>
            <span className="pl-6 text-[11px] text-slate-500">{option.hint}</span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}
