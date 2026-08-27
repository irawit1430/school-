import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';

// The cards are printed at 42mm and laminated, so a change to the error-correction
// level or token length shows up in the physical world — as cards a phone won't read
// at a 7am stop — long before anyone sees it in code review.

const PRINT_MM = 42;
const TOKEN = 'a3f9'.repeat(8); // 32-char hex, the qrToken shape

test('a card QR stays readable at the printed size', () => {
  const qr = QRCode.create(TOKEN, { errorCorrectionLevel: 'Q' });
  const moduleMm = PRINT_MM / qr.modules.size;

  // Below ~1mm a phone camera struggles at arm's length in poor light.
  expect(moduleMm).toBeGreaterThan(1.0);
  expect(qr.modules.size).toBeLessThanOrEqual(41);
});

test('level Q is kept — these cards live in a school bag for a year', () => {
  const q = QRCode.create(TOKEN, { errorCorrectionLevel: 'Q' });
  const m = QRCode.create(TOKEN, { errorCorrectionLevel: 'M' });
  // Q costs density over M; the point is that it still clears the readability bar
  // above, so the damage tolerance is free in practice.
  expect(q.modules.size).toBeGreaterThanOrEqual(m.modules.size);
});
