import React, { useEffect, useId, useRef, useState } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { parseStudentImportCSV, STUDENT_IMPORT_TEMPLATE, type StudentImportPreview } from '@/lib/studentImport';
import { Dialog } from '@/components/ui/Dialog';

interface ImportStudentsModalProps {
  onClose: () => void;
  onImport: (file: File) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
}

export function ImportStudentsModal({ onClose, onImport, isSubmitting, error: submitError }: ImportStudentsModalProps) {
  const inputId = useId();
  const readVersion = useRef(0);
  const submitting = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [acceptIgnored, setAcceptIgnored] = useState(false);
  useEffect(() => () => { readVersion.current++; }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitting || submitting.current) return;
    const selected = event.target.files?.[0] ?? null;
    event.target.value = ''; // Selecting the same corrected file must fire change again.
    const version = ++readVersion.current;
    setFile(selected); setPreview(null); setError(''); setPage(1); setOnlyErrors(false); setAcceptIgnored(false);
    if (!selected) return;
    if (!/\.csv$/i.test(selected.name)) { setError('Select a .csv file. Export spreadsheets as CSV before uploading.'); return; }
    setReading(true);
    try {
      const result = parseStudentImportCSV(await selected.text());
      if (version === readVersion.current) setPreview(result);
    } catch {
      if (version === readVersion.current) setError('Could not read this file. Select it again and retry.');
    } finally {
      if (version === readVersion.current) setReading(false);
    }
  };

  const canImport = !!file && !!preview?.valid && (!preview.warnings.length || acceptIgnored) && !reading && !isSubmitting;
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canImport || !file || submitting.current) return;
    submitting.current = true;
    setError('');
    try { await onImport(file); }
    catch (err) { setError(err instanceof Error ? err.message : 'Import failed. Review the file and retry.'); }
    finally { submitting.current = false; }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([STUDENT_IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'student_import_template.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const invalidRows = preview?.rows.filter(row => row.errors.length > 0) ?? [];
  const visibleRows = onlyErrors ? invalidRows : preview?.rows ?? [];
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const headerErrors = preview?.errors.filter(item => item.rowNumber === 1) ?? [];

  return (
    <Dialog title="Import students from CSV" onClose={onClose} busy={isSubmitting || reading} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2 text-sm text-slate-600">
          <p>Use one student per row. All four columns are required:</p>
          <p className="break-words font-mono text-xs text-slate-900">name, rollNumber, guardianName, guardianPhone</p>
          <p>Headers are case-insensitive. Spaced names such as “Student Name”, “Roll Number”, “Parent Name” and “Guardian Phone” are also accepted.</p>
          <p>Phone numbers need 7–15 digits; +, spaces, brackets, dots and hyphens are allowed. Keep roll numbers and phone numbers as text to retain leading zeros.</p>
          <p>Grade, student ID, parent email, route and stop columns are not imported. Use Add New Student for records that need grade, student ID or parent email, and assign pickup stops after importing.</p>
          <button type="button" onClick={downloadTemplate} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download size={16} aria-hidden="true" /> Download CSV template
          </button>
          <p className="text-xs">The template contains headers only. Fill it in before importing.</p>
        </div>

        <div>
          <label htmlFor={inputId} className="mb-2 block text-sm font-semibold text-slate-700">Choose a CSV file</label>
          <input id={inputId} type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={isSubmitting || reading} aria-describedby={inputId + '-file-status'} className="block w-full min-w-0 rounded-lg border border-slate-300 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700 disabled:opacity-50" />
          <p id={inputId + '-file-status'} role="status" className="mt-2 break-words text-xs text-slate-500">{reading ? 'Reading and checking every row…' : file ? 'Selected: ' + file.name : 'No file selected.'}</p>
        </div>
        {(error || submitError) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || submitError}</p>}

        {preview && (
          <section aria-label="Import preview" className="space-y-3">
            <div role="status" className="text-sm font-semibold text-slate-800">
              {preview.totalRows} total rows · {preview.totalRows - invalidRows.length} rows with valid fields · {invalidRows.length} rows needing correction
            </div>
            {!preview.valid && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">Nothing will be imported until all errors are fixed.</p>
                {headerErrors.length > 0 && <ul className="mt-2 list-inside list-disc">{headerErrors.map((item, index) => <li key={index}>{item.message}</li>)}</ul>}
                <p className="mt-1">Review the errors below, correct your CSV, then choose the file again. Line numbers refer to the original file.</p>
              </div>
            )}
            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><p className="break-words">{preview.warnings.join(' ')}</p></div>
                <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={acceptIgnored} onChange={event => setAcceptIgnored(event.target.checked)} disabled={isSubmitting} className="mt-1" />I understand that these columns will not be imported.</label>
              </div>
            )}
            {invalidRows.length > 0 && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={onlyErrors} onChange={event => { setOnlyErrors(event.target.checked); setPage(1); }} disabled={isSubmitting} />Show only rows with errors</label>}
            {visibleRows.length > 0 && (
              <>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[36rem] text-left text-xs">
                    <caption className="sr-only">Preview of the four fields that will be imported</caption>
                    <thead className="bg-slate-50 text-slate-600"><tr>{['CSV line', 'Student name', 'Roll number', 'Guardian name', 'Guardian phone'].map(label => <th key={label} scope="col" className="p-2 font-semibold">{label}</th>)}</tr></thead>
                    <tbody>{visibleRows.slice((page - 1) * pageSize, page * pageSize).map(row => (
                      <React.Fragment key={row.rowNumber}>
                        <tr className="border-t border-slate-100 align-top"><th scope="row" className="p-2 font-medium">{row.rowNumber}</th>{Object.values(row.data).map((value, index) => <td key={index} className="max-w-40 whitespace-pre-wrap break-words p-2">{value || '—'}</td>)}</tr>
                        {row.errors.length > 0 && <tr><td colSpan={5} className="px-2 pb-2 text-red-700"><ul className="list-inside list-disc">{row.errors.map(message => <li key={message}>Line {row.rowNumber}: {message}</li>)}</ul></td></tr>}
                      </React.Fragment>
                    ))}</tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>Preview page {page} of {pageCount}</span>
                  <div className="flex gap-2"><button type="button" onClick={() => setPage(value => value - 1)} disabled={page === 1} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-50">Previous rows</button><button type="button" onClick={() => setPage(value => value + 1)} disabled={page >= pageCount} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-50">Next rows</button></div>
                </div>
              </>
            )}
          </section>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={isSubmitting || reading} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!canImport} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">{isSubmitting ? 'Importing…' : preview?.valid ? 'Import ' + preview.totalRows + ' student' + (preview.totalRows === 1 ? '' : 's') : 'Import students'}</button>
        </div>
      </form>
    </Dialog>
  );
}
