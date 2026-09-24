"use client";
import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { redirectToLogin, tokenExpiresAt } from '@/lib/api';

/**
 * Warns before the session ends, instead of after.
 *
 * A 401 replaces the page with the login screen. The heaviest task in this product is
 * drawing a route — twenty stops placed, named and ordered — and that work lives only in
 * component state, so an expiry at the moment of saving threw away an hour with no message
 * explaining what had happened. Routes are the geometry every tracking feature depends on,
 * which made this a tax on exactly the work the product most needs done.
 *
 * The JWT's own `exp` claim is already in the browser, so this needs no endpoint. It is
 * advisory only — the server stays the sole authority on whether the token is still good.
 */
const WARN_WITHIN_MS = 5 * 60_000;

export function SessionExpiryNotice() {
  const [msLeft, setMsLeft] = useState<number | null>(null);

  useEffect(() => {
    const check = () => {
      const expiresAt = tokenExpiresAt();
      // No readable `exp` means no warning rather than a wrong one. The 401 handler is
      // still there as the backstop.
      if (expiresAt === null) { setMsLeft(null); return; }
      const remaining = expiresAt - Date.now();
      setMsLeft(remaining);
      // Already gone: send them to the login screen with a reason and a way back, rather
      // than letting the next request fail mid-save.
      if (remaining <= 0) redirectToLogin('expired');
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (msLeft === null || msLeft > WARN_WITHIN_MS || msLeft <= 0) return null;

  const minutes = Math.max(1, Math.ceil(msLeft / 60_000));

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[95] -translate-x-1/2 px-4"
    >
      <div className="flex items-start gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-2xl">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">
            Your session ends in {minutes} {minutes === 1 ? 'minute' : 'minutes'}.
          </p>
          <p className="mt-0.5">
            Save anything in progress. You&apos;ll be returned to this page after signing in again.
          </p>
        </div>
      </div>
    </div>
  );
}
