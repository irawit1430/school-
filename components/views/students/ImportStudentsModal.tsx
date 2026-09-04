import React, { useRef, useState } from 'react';
import { X, Upload, FileText, AlertTriangle } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface ImportStudentsModalProps {
  onClose: () => void;
  onImport: (file: File) => Promise<void>;
  isSubmitting: boolean;
}

export function ImportStudentsModal({ onClose, onImport, isSubmitting }: ImportStudentsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);

  useClickOutside(modalRef, onClose);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    onImport(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Import Students CSV</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Upload CSV File</label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isSubmitting}
              />
              <div className="flex flex-col items-center justify-center pointer-events-none">
                {file ? (
                  <>
                    <FileText size={32} className="text-orange-500 mb-3" />
                    <p className="text-sm font-medium text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </>
                ) : (
                  <>
                    <Upload size={32} className="text-slate-400 mb-3" />
                    <p className="text-sm font-medium text-slate-900">Click or drag file to upload</p>
                    <p className="text-xs text-slate-500 mt-1">CSV files only</p>
                  </>
                )}
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
              <div className="text-xs text-amber-800">
                <p className="font-semibold mb-1">Important:</p>
                <p>New parents receive a unique temporary password. Older imported parent accounts should complete a password reset before signing in.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isSubmitting}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? 'Importing...' : 'Import Students'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
