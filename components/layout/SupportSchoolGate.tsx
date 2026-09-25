"use client";
import React, { useEffect, useState } from 'react';
import { Building2, LifeBuoy, RefreshCw } from 'lucide-react';
import {
  apiErrorMessage, fetchSchools, getSupportSchool, getUser, setSupportSchool,
  type SupportSchool,
} from '@/lib/api';

/**
 * Which school a Voltava support session is working in, chosen out loud.
 *
 * A SUPER_ADMIN has no school of their own, and the API layer used to resolve one by
 * taking whichever school `/schools` listed first. That is not authorization — it is an
 * accident of response order deciding whose children's records are on screen. Nothing
 * named the school, so a support user could edit a route, create a student or resolve an
 * SOS believing they were somewhere else entirely, and the school whose data they touched
 * would have no way to tell it had happened.
 *
 * So: no school until one is picked, and once picked, a band across the top that cannot be
 * dismissed. A school admin never sees any of this — they carry their own schoolId.
 *
 * The banner states the scope rather than enforcing it. Read-only support access has to be
 * refused by the server; a disabled button here would only hide the capability from the
 * one person who can see it is wrong.
 */
export function SupportSchoolGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [school, setSchool] = useState<SupportSchool | null>(null);
  const [schools, setSchools] = useState<SupportSchool[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setUser(getUser());
    setSchool(getSupportSchool());
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const isSupport = ready && user?.role === 'SUPER_ADMIN' && !user?.schoolId;

  const load = () => {
    setLoading(true);
    setError('');
    fetchSchools()
      .then(setSchools)
      .catch(err => setError(apiErrorMessage(err, 'Could not load the list of schools.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isSupport && !school && schools === null && !loading && !error) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupport, school, schools]);

  const choose = (next: SupportSchool) => {
    setSupportSchool(next);
    setSchool(next);
    // Everything already fetched belongs to the previous school, and components hold it in
    // their own state. A reload is the honest way to drop all of it at once.
    window.location.reload();
  };

  const leave = () => {
    setSupportSchool(null);
    window.location.reload();
  };

  // Not a support session, or we have not read storage yet: nothing to add.
  if (!ready || !isSupport) return <>{children}</>;

  if (!school) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
          <div className="flex items-center gap-2.5 text-sm font-bold uppercase tracking-wider text-orange-600">
            <LifeBuoy size={16} /> Voltava support
          </div>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Choose a school to work in</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Your account is not tied to one school. Pick the school you are supporting — the
            whole dashboard, including anything you change, applies to that school only.
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
              <button onClick={load} className="ml-2 font-semibold underline">Try again</button>
            </div>
          )}

          {loading && <p className="mt-4 text-sm text-slate-500">Loading schools…</p>}

          {schools?.length === 0 && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              No schools came back for this account.
            </p>
          )}

          <ul className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
            {schools?.map(option => (
              <li key={option.id}>
                <button
                  onClick={() => choose(option)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:border-orange-400 hover:bg-orange-50"
                >
                  <Building2 size={16} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 break-words">{option.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Undismissable on purpose. The failure this replaces was a support user not
          knowing whose data they were changing, and a banner you can close is a banner
          that is closed. */}
      <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-orange-600 px-4 py-1.5 text-xs font-semibold text-white">
        <span className="flex items-center gap-2">
          <LifeBuoy size={13} />
          VOLTAVA SUPPORT VIEW · {school.name}
        </span>
        <button onClick={leave} className="flex items-center gap-1.5 underline hover:no-underline">
          <RefreshCw size={12} /> Switch school
        </button>
      </div>
      {children}
    </>
  );
}
