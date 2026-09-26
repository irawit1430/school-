import React, { useEffect, useId, useRef, useState } from 'react';
import { Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { importResultCsv, parseStudentImportCSV, STUDENT_IMPORT_COLUMNS, STUDENT_IMPORT_TEMPLATE, type StudentImportPreview } from '@/lib/studentImport';
import { apiErrorMessage, checkStudentImport, commitStudentImport, type ImportResult, type ImportRowResult, type ImportRowState } from '@/lib/api';
import { Dialog } from '@/components/ui/Dialog';

interface ImportStudentsModalProps {
  onClose: () => void;
  /** After a successful import, with every row's result. */
  onImported: (result: ImportResult) => void;
  check?: typeof checkStudentImport;
  commit?: typeof commitStudentImport;
}

const STATE_META: Record<ImportRowState, { label: string; tone: string }> = {
  NEEDS_CORRECTION: { label: 'Needs correction', tone: 'bg-red-50 text-red-700 border-red-200' },
  INVITE_READY: { label: 'New parent · invite ready', tone: 'bg-sky-50 text-sky-800 border-sky-200' },
  EXISTING_PARENT_LINKED: { label: 'Existing parent linked', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  PARENT_LINKED: { label: 'Parent already linked', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  NO_PARENT: { label: 'No parent email', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
};

type Filter = 'ALL' | ImportRowState | 'NO_STOP';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const PAGE = 8;

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * The roster import, in three steps the office can see:
 *   1. the file is read here, and anything malformed is listed by line;
 *   2. the server checks every row against the school's real routes, stops, parents and
 *      cards, and says what would happen to each (nothing is written);
 *   3. the import, which happens only when no row needs correcting, all at once.
 * Every result can be downloaded as a CSV to fix in a spreadsheet and upload again, and
 * uploading the same file twice changes nothing.
 */
export function ImportStudentsModal({ onClose, onImported, check = checkStudentImport, commit = commitStudentImport }: ImportStudentsModalProps) {
  const inputId = useId();
  const readVersion = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'reading' | 'checking' | 'importing'>('idle');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [page, setPage] = useState(1);
  useEffect(() => () => { readVersion.current++; }, []);
  const busy = phase !== 'idle';

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (busy) return;
    const selected = event.target.files?.[0] ?? null;
    event.target.value = ''; // Choosing the same corrected file must fire change again.
    const version = ++readVersion.current;
    setFile(selected); setPreview(null); setResult(null); setError(''); setFilter('ALL'); setPage(1);
    if (!selected) return;
    if (!/\.csv$/i.test(selected.name)) { setError('Select a .csv file. In Excel or Google Sheets, use File → Download → CSV.'); return; }
    setPhase('reading');
    try {
      const parsed = parseStudentImportCSV(await selected.text());
      if (version !== readVersion.current) return;
      setPreview(parsed);
      if (!parsed.valid) return;
      setPhase('checking');
      const checked = await check(parsed.payload);
      if (version === readVersion.current) setResult(checked);
    } catch (err) {
      if (version === readVersion.current) setError(apiErrorMessage(err, 'Could not check this file. Try again.'));
    } finally {
      if (version === readVersion.current) setPhase('idle');
    }
  };

  const canImport = !!preview?.valid && !!result && result.totals.needsCorrection === 0 && !busy;
  const handleImport = async () => {
    if (!canImport || !preview) return;
    setPhase('importing'); setError('');
    try {
      const done = await commit(preview.payload);
      if (!done.committed) {
        // Something changed since the check (another import, an edit). Show the new picture.
        setResult(done);
        setError(done.error || 'Some rows need correcting now. Nothing was imported.');
        return;
      }
      onImported(done);
    } catch (err) {
      setError(apiErrorMessage(err, 'The import did not happen. Nothing was changed.'));
    } finally {
      setPhase('idle');
    }
  };

  const rows: ImportRowResult[] = result?.rows ?? [];
  const shown = rows.filter(r => filter === 'ALL' || (filter === 'NO_STOP' ? r.stop.action === 'NONE' && r.state !== 'NEEDS_CORRECTION' : r.state === filter));
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE));
  const t = result?.totals;
  const localBad = preview && !preview.valid ? preview.rows.filter(r => r.errors.length) : [];
  const headerErrors = preview?.errors.filter(e => e.rowNumber === 1) ?? [];

  const chip = (key: Filter, label: string, n: number) => (
    <button type="button" key={key} onClick={() => { setFilter(key); setPage(1); }} aria-pressed={filter === key}
      className={clsx('rounded-full border px-3 py-1 text-xs font-semibold', filter === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}>
      {label} ({n})
    </button>
  );

  return (
    <Dialog title="Import the student roster" onClose={onClose} busy={busy} size="lg">
      <div className="space-y-5">
        <div className="space-y-2 text-sm text-slate-600">
          <p>One child per row. Only <span className="font-semibold text-slate-900">studentId</span> and <span className="font-semibold text-slate-900">name</span> are required; fill in the rest so each child is ready to ride.</p>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer font-semibold text-slate-800">What each column means</summary>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[9rem_1fr]">
              {STUDENT_IMPORT_COLUMNS.map(c => (
                <React.Fragment key={c.field}>
                  <dt className="font-mono font-semibold text-slate-900">{c.label}{c.required ? ' *' : ''}</dt>
                  <dd>{c.help}</dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
          <p>Checking writes nothing. Uploading the same file again later is safe: children already imported are only completed, never duplicated or changed.</p>
          <button type="button" onClick={() => download('student_roster_template.csv', STUDENT_IMPORT_TEMPLATE)} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download size={16} aria-hidden="true" /> Download CSV template
          </button>
        </div>

        <div>
          <label htmlFor={inputId} className="mb-2 block text-sm font-semibold text-slate-700">Choose a CSV file</label>
          <input id={inputId} type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={busy} aria-describedby={inputId + '-status'}
            className="block w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700 disabled:opacity-50" />
          <p id={inputId + '-status'} role="status" className="mt-2 break-words text-xs text-slate-500">
            {phase === 'reading' ? 'Reading the file…' : phase === 'checking' ? 'Checking every row against your routes, stops and parents…' : phase === 'importing' ? 'Importing…' : file ? 'Selected: ' + file.name : 'No file selected.'}
          </p>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {preview?.warnings.length ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">{preview.warnings.map(w => <p key={w}>{w}</p>)}</div>
          </div>
        ) : null}

        {preview && !preview.valid && (
          <section aria-label="Problems in the file" role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">The file needs fixing before it can be checked. Line numbers match your spreadsheet.</p>
            {headerErrors.length > 0 && <ul className="list-inside list-disc">{headerErrors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>}
            <ul className="max-h-48 list-inside list-disc overflow-y-auto">
              {localBad.slice(0, 50).flatMap(r => r.errors.map(message => <li key={r.rowNumber + message}>Line {r.rowNumber}: {message}</li>))}
            </ul>
            {localBad.length > 50 && <p>…and {localBad.length - 50} more rows.</p>}
          </section>
        )}

        {result && t && (
          <section aria-label="Check results" className="space-y-3">
            <div role="status" className={clsx('rounded-lg border p-3 text-sm', t.needsCorrection ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900')}>
              {t.needsCorrection ? (
                <p className="font-semibold">{t.needsCorrection} of {t.rows} rows need correcting. Nothing will be imported until they are fixed.</p>
              ) : (
                <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} aria-hidden /> Every row can be imported.</p>
              )}
              <p className="mt-1">
                {t.new} new · {t.updated} completed · {t.unchanged} already up to date · {plural(t.parentsCreated, 'new parent account', 'new parent accounts')} ·
                {' '}{plural(t.parentsLinked, 'linked to an existing parent', 'linked to existing parents')} · {plural(t.stopsAssigned, 'stop', 'stops')} assigned ·
                {' '}<span className="font-semibold">{t.ready} fully ready</span> (parent and stop)
              </p>
              {(t.noParent > 0 || t.noStop > 0) && (
                <p className="mt-1">{t.noParent} without a parent email and {t.noStop} without a stop will be imported but are not ready to ride.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {chip('ALL', 'All', rows.length)}
              {chip('NEEDS_CORRECTION', 'Needs correction', t.needsCorrection)}
              {chip('INVITE_READY', 'New parent', rows.filter(r => r.state === 'INVITE_READY').length)}
              {chip('EXISTING_PARENT_LINKED', 'Existing parent', t.parentsLinked)}
              {chip('NO_PARENT', 'No parent email', t.noParent)}
              {chip('NO_STOP', 'No stop', t.noStop)}
              <button type="button" onClick={() => download('student_import_results.csv', importResultCsv(rows))}
                className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-orange-700 hover:underline">
                <Download size={14} aria-hidden /> Download results (CSV)
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[44rem] text-left text-xs">
                <caption className="sr-only">What the import will do with each row</caption>
                <thead className="bg-slate-50 text-slate-600">
                  <tr>{['Line', 'Student ID', 'Name', 'Result', 'Parent', 'Stop'].map(h => <th key={h} scope="col" className="p-2 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {shown.slice((page - 1) * PAGE, page * PAGE).map(r => (
                    <React.Fragment key={r.line}>
                      <tr className="border-t border-slate-100 align-top">
                        <th scope="row" className="p-2 font-medium">{r.line}</th>
                        <td className="p-2 font-mono">{r.rfidTag}</td>
                        <td className="p-2">{r.name}{r.student !== 'NEW' && <span className="ml-1 text-slate-500">({r.student === 'UPDATE' ? 'completing' : 'no change'})</span>}</td>
                        <td className="p-2"><span className={clsx('inline-block rounded-full border px-2 py-0.5 font-semibold', STATE_META[r.state].tone)}>{STATE_META[r.state].label}</span></td>
                        <td className="max-w-40 break-words p-2">{r.parent.email ?? '—'}</td>
                        <td className="max-w-48 break-words p-2">{r.stop.route ? `${r.stop.stop} · ${r.stop.route}` : '—'}</td>
                      </tr>
                      {(r.errors.length > 0 || r.warnings.length > 0) && (
                        <tr><td colSpan={6} className="px-2 pb-2">
                          <ul className="list-inside list-disc">
                            {r.errors.map(m => <li key={m} className="text-red-700">{m}</li>)}
                            {r.warnings.map(m => <li key={m} className="text-amber-800">{m}</li>)}
                          </ul>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-500">No rows in this group.</td></tr>}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Page {page} of {pageCount}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPage(p => p - 1)} disabled={page === 1} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-50">Previous</button>
                  <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= pageCount} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void handleImport()} disabled={!canImport}
            className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
            {phase === 'importing' ? 'Importing…' : t && !t.needsCorrection ? `Import ${t.rows} ${t.rows === 1 ? 'student' : 'students'}` : 'Import students'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
