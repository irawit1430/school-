"use client";
import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { fetchStudents, fetchQrCards, apiErrorMessage } from '@/lib/api';
import { Printer, Search, Info, CheckSquare, Square, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Skeleton } from '@/components/ui/Skeleton';

interface CardData {
  studentId: string;
  name: string;
  grade?: string;
  routeStopName?: string;
  qrToken: string;
}

// A school that already issues ID cards — admission numbers, roll numbers, Code128 —
// imports those codes instead of being reprinted, which is the whole cost argument.
// Those children need no card from us, and printing one for them wastes a sheet and
// hands the child a second competing code.
//
// The field is provenance, not presence: once the migration lands every child has a
// code, so "has a code" would be true for everyone and exclude nobody. What this screen
// needs to know is whether the child already holds a physical card.
const hasOwnCode = (student: any): boolean => Boolean(student?.qrCodeImported);

const UNGRADED = 'No class set';

export function QrCards() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [qrSvgs, setQrSvgs] = useState<Record<string, string>>({});
  const [isPreparing, setIsPreparing] = useState(false);

  useEffect(() => {
    fetchStudents()
      .then(data => { setStudents(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(err => {
        toast.error(apiErrorMessage(err, 'Failed to load students.'));
        setLoading(false);
      });
  }, []);

  const grades = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => set.add(s.grade || UNGRADED));
    return Array.from(set).sort();
  }, [students]);

  const visible = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return students.filter(s => {
      if (gradeFilter !== 'all' && (s.grade || UNGRADED) !== gradeFilter) return false;
      if (!q) return true;
      return String(s.name || '').toLowerCase().includes(q);
    });
  }, [students, searchQuery, gradeFilter]);

  const needCards = useMemo(() => visible.filter(s => !hasOwnCode(s)), [visible]);
  const alreadyCoded = useMemo(() => visible.filter(hasOwnCode), [visible]);

  const selectedNeeding = useMemo(
    () => needCards.filter(s => selected.has(s.id)),
    [needCards, selected]
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Selects only children who need a card — the ones with their own code are never
  // swept in by a select-all.
  const selectAllNeeding = () => {
    const allSelected = needCards.every(s => selected.has(s.id));
    setSelected(prev => {
      const next = new Set(prev);
      needCards.forEach(s => allSelected ? next.delete(s.id) : next.add(s.id));
      return next;
    });
  };

  const handlePrepare = async () => {
    if (selectedNeeding.length === 0) return;
    setIsPreparing(true);
    try {
      const data = await fetchQrCards(selectedNeeding.map(s => s.id));
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        toast.error('No cards came back for that selection.');
        return;
      }
      // Level Q, not M. The payload is a short hex token, so Q still lands around
      // 29-33 modules — roughly 1.3mm each at 42mm, which a phone reads comfortably at
      // arm's length. The density cost is theoretical; the damage tolerance is not,
      // because these live in a school bag for a year.
      const svgs = await Promise.all(
        rows.map(async row => [
          row.studentId,
          await QRCode.toString(row.qrToken, {
            type: 'svg', margin: 0, errorCorrectionLevel: 'Q',
          }),
        ] as const)
      );
      setQrSvgs(Object.fromEntries(svgs));
      setCards(rows);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to prepare cards.'));
    } finally {
      setIsPreparing(false);
    }
  };

  const sheetCount = cards ? Math.ceil(cards.length / 8) : 0;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <>
      {/* ── Screen ─────────────────────────────────────────── */}
      <div className="p-6 space-y-6 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Student QR Cards</h2>
          <p className="text-sm text-slate-500 mt-1">
            Print scannable cards on plain A4 — eight per sheet, no card printer needed.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[14rem]">
            <label htmlFor="card-search" className="block text-xs font-semibold text-slate-600 mb-1">Find a student</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="card-search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="card-class" className="block text-xs font-semibold text-slate-600 mb-1">Class set</label>
            <select
              id="card-class"
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            >
              <option value="all">All classes</option>
              {grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button
            onClick={handlePrepare}
            disabled={selectedNeeding.length === 0 || isPreparing}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
          >
            {isPreparing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            {isPreparing ? 'Preparing…' : `Prepare ${selectedNeeding.length || ''} card${selectedNeeding.length === 1 ? '' : 's'}`.trim()}
          </button>
        </div>

        {alreadyCoded.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <Info size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <p className="font-semibold">
                {alreadyCoded.length} {alreadyCoded.length === 1 ? 'child already has' : 'children already have'} a code from your existing ID cards.
              </p>
              <p className="text-emerald-800 mt-0.5">
                They need nothing printed, and they are excluded from Select all so a reprint can&apos;t hand them a second, competing code.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <button
              onClick={selectAllNeeding}
              disabled={needCards.length === 0}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-orange-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-orange-500 rounded px-1"
            >
              {needCards.length > 0 && needCards.every(s => selected.has(s.id))
                ? <CheckSquare size={16} className="text-orange-600" />
                : <Square size={16} />}
              Select all needing a card ({needCards.length})
            </button>
            <span className="text-xs text-slate-500 font-medium">
              {selectedNeeding.length} selected · {Math.ceil(selectedNeeding.length / 8)} sheet{Math.ceil(selectedNeeding.length / 8) === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="divide-y divide-slate-50 max-h-[26rem] overflow-y-auto">
            {visible.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-slate-500">No students match that filter.</li>
            )}
            {visible.map(s => {
              const own = hasOwnCode(s);
              const isChecked = selected.has(s.id);
              return (
                <li key={s.id}>
                  <label className={clsx(
                    "flex items-center gap-3 px-4 py-2.5 text-sm",
                    own ? "opacity-60" : "hover:bg-slate-50 cursor-pointer"
                  )}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={own}
                      onChange={() => toggle(s.id)}
                      className="w-4 h-4 accent-orange-600"
                    />
                    <span className="font-semibold text-slate-900 flex-1">{s.name}</span>
                    <span className="text-xs text-slate-500">{s.grade || UNGRADED}</span>
                    {own && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                        Has own code
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {cards && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-slate-700">
              <p className="font-semibold">{cards.length} cards ready · {sheetCount} A4 sheet{sheetCount === 1 ? '' : 's'}</p>
              <p className="text-slate-500 mt-0.5">
                Print at 100% scale (not &ldquo;fit to page&rdquo;), then laminate <strong>matte, not gloss</strong> — gloss throws a
                reflection into the camera in direct sun, which is exactly a 7am stop.
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
            >
              <Printer size={16} /> Print sheets
            </button>
          </div>
        )}
      </div>

      {/* ── Print sheet ────────────────────────────────────── */}
      {cards && (
        <div className="qr-sheet hidden print:grid" aria-hidden="true">
          {cards.map(card => (
            <div key={card.studentId} className="qr-card">
              <div
                className="qr-code"
                dangerouslySetInnerHTML={{ __html: qrSvgs[card.studentId] || '' }}
              />
              <div className="qr-meta">
                <p className="qr-name">{card.name}</p>
                <p className="qr-sub">{card.grade || UNGRADED}</p>
                {card.routeStopName && <p className="qr-sub">{card.routeStopName}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

    </>
  );
}
