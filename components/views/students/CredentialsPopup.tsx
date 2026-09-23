import React, { useId, useState } from 'react';
import { CheckCircle, Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { StudentDialog } from './StudentDialog';

interface CredentialsPopupProps {
  credentialsPopup: any;
  setCredentialsPopup: (val: any) => void;
  operation?: 'create' | 'import' | 'reset';
  importedCount?: number;
}

export function CredentialsPopup({ credentialsPopup, setCredentialsPopup, operation = 'create', importedCount }: CredentialsPopupProps) {
  const id = useId();
  const [isCopying, setIsCopying] = useState(false);
  const [copyError, setCopyError] = useState('');
  if (!credentialsPopup) return null;
  const credentials = Array.isArray(credentialsPopup) ? credentialsPopup : [credentialsPopup];
  if (!credentials.length) return null;

  const handleCopyAll = async () => {
    if (isCopying) return;
    setIsCopying(true);
    setCopyError('');
    try {
      const text = credentials.map(cred => 'Email: ' + cred.email + '\nPassword: ' + cred.temporaryPassword).join('\n\n');
      await navigator.clipboard.writeText(text);
      toast.success('Copied all credentials to clipboard');
    } catch {
      setCopyError('Copy failed. Select and copy the fields below, or try Copy All again.');
    } finally {
      setIsCopying(false);
    }
  };
  const close = () => { if (!isCopying) { setCopyError(''); setCredentialsPopup(null); } };

  return (
    <StudentDialog
      title={<span className="flex items-center gap-2"><CheckCircle size={20} className="shrink-0 text-emerald-600" aria-hidden="true" />{operation === 'reset' ? 'New temporary password' : operation === 'import' ? 'Students Imported!' : 'Student Added!'}</span>}
      onClose={close} size="lg" busy={isCopying} dismissible={false}
    >
      {operation === 'reset' ? (
        <p className="mb-4 text-sm text-slate-600">
          Share this with them directly, not in a group. It is shown only once. Their old password, and any phone signed in with it, stopped working just now, and they will choose their own password when they next sign in.
        </p>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          {operation === 'import' && typeof importedCount === 'number' && <>{importedCount} {importedCount === 1 ? 'student was' : 'students were'} imported. </>}
          {credentials.length} new parent {credentials.length === 1 ? 'account was' : 'accounts were'} created. Copy these temporary credentials and share them with the parents before choosing Done.
        </p>
      )}
      {copyError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{copyError}</p>}
      <div className="space-y-4">
        {credentials.map((cred: any, index: number) => (
          <div key={index} className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={id + '-email-' + index} className="mb-1 block text-sm font-semibold text-slate-600">Email</label>
              <textarea id={id + '-email-' + index} readOnly rows={2} value={cred.email} onFocus={event => event.currentTarget.select()}
                className="w-full resize-none break-all rounded border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:ring-2 focus:ring-orange-500" />
            </div>
            <div className="min-w-0">
              <label htmlFor={id + '-password-' + index} className="mb-1 block text-sm font-semibold text-slate-600">Temporary Password</label>
              <textarea id={id + '-password-' + index} readOnly rows={2} value={cred.temporaryPassword} onFocus={event => event.currentTarget.select()}
                className="w-full resize-none break-all rounded border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
        <button type="button" onClick={handleCopyAll} disabled={isCopying} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Copy size={16} aria-hidden="true" />{isCopying ? 'Copying...' : 'Copy All'}
        </button>
        <button type="button" onClick={close} disabled={isCopying} className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 font-semibold text-white hover:bg-orange-700 disabled:opacity-50">Done</button>
      </div>
    </StudentDialog>
  );
}
