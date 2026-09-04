import { test, expect } from '@playwright/test';
import { isSpeeding, ALERT_ENTER_KMH, ALERT_EXIT_KMH } from '../lib/liveBuses';

test('a bus sitting on the limit does not flicker between alert and normal', () => {
  // The old rule was speed > 60, so this sequence flipped on every packet.
  let alert = false;
  const seen: boolean[] = [];
  for (const speed of [59, 61, 58, 62, 60, 59]) {
    alert = isSpeeding(alert, speed);
    seen.push(alert);
  }
  expect(seen).toEqual([false, false, false, false, false, false]);
});

test('genuinely speeding still raises, and only clears once it has slowed', () => {
  expect(isSpeeding(false, ALERT_ENTER_KMH + 1)).toBe(true);
  expect(isSpeeding(false, ALERT_ENTER_KMH)).toBe(false);

  // Still alert through the dead band, cleared below it.
  expect(isSpeeding(true, 60)).toBe(true);
  expect(isSpeeding(true, ALERT_EXIT_KMH)).toBe(false);
});
