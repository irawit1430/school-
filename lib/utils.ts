import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Spec §7.9: a file of children's records leaves BusLink's access control the moment it
 * is saved — it gets emailed, left on a shared PC, printed. Say so before it happens.
 * Native confirm: focus-trapped, keyboard-operable and announced with no extra code.
 */
export const confirmChildDataExport = (count: number): boolean =>
  window.confirm(
    `This file will contain ${count} ${count === 1 ? 'record' : 'records'} about children.\n\n` +
    'Once downloaded it is outside BusLink access control. Store it securely and delete it when done.',
  );
