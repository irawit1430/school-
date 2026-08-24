import React, { useRef } from 'react';
import { CheckCircle, Copy } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { toast } from 'react-hot-toast';

interface CredentialsPopupProps {
  credentialsPopup: any;
  setCredentialsPopup: (val: any) => void;
}

export function CredentialsPopup({ credentialsPopup, setCredentialsPopup }: CredentialsPopupProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, () => setCredentialsPopup(null));

  if (!credentialsPopup) return null;

  const credentials = Array.isArray(credentialsPopup) ? credentialsPopup : [credentialsPopup];
  const isBulk = credentials.length > 1;

  const handleCopyAll = () => {
    const text = credentials.map(c => `Email: ${c.email}\nPassword: ${c.temporaryPassword}`).join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success('Copied all credentials to clipboard');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <CheckCircle size={20} className="text-emerald-500" />
            {isBulk ? 'Students Imported!' : 'Student Added!'}
          </h3>
        </div>
        <div className="p-6 overflow-y-auto">
          <p className="text-sm text-slate-600 mb-4">
            {isBulk ? `${credentials.length} new parent accounts were created. Please copy these credentials and share them with the parents:` : 'A new parent account was created. Please copy these credentials and share them with the parent:'}
          </p>
          
          <div className="space-y-4">
            {credentials.map((cred: any, idx: number) => (
              <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 gap-4 font-mono text-sm">
                <div>
                  <span className="text-slate-500 font-semibold block mb-1">Email:</span>
                  <div className="bg-white px-3 py-2 border border-slate-200 rounded font-medium text-slate-900 truncate" title={cred.email}>
                    {cred.email}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block mb-1">Temporary Password:</span>
                  <div className="bg-white px-3 py-2 border border-slate-200 rounded font-medium text-slate-900">
                    {cred.temporaryPassword}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button 
            onClick={handleCopyAll}
            className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
          >
            <Copy size={16} /> Copy All
          </button>
          <button 
            onClick={() => setCredentialsPopup(null)}
            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
