import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface MessageParentModalProps {
  messageStudent: any;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  messageForm: { subject: string; body: string };
  setMessageForm: (val: any) => void;
  isMessageSubmitting: boolean;
}

export function MessageParentModal({
  messageStudent,
  onClose,
  onSubmit,
  messageForm,
  setMessageForm,
  isMessageSubmitting
}: MessageParentModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose);

  if (!messageStudent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Message Parent</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">
              Sending message regarding <span className="font-bold text-slate-900">{messageStudent.name}</span>
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Subject <span className="text-red-500">*</span></label>
            <input 
              type="text" required
              value={messageForm.subject} onChange={(e) => setMessageForm({...messageForm, subject: e.target.value})}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm"
              placeholder="e.g. Bus Delay Notice"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Message <span className="text-red-500">*</span></label>
            <textarea 
              required rows={4}
              value={messageForm.body} onChange={(e) => setMessageForm({...messageForm, body: e.target.value})}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm resize-none"
              placeholder="Type your message here..."
            ></textarea>
          </div>
          <div className="pt-4 flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200">
              Cancel
            </button>
            <button type="submit" disabled={isMessageSubmitting} className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 flex items-center gap-2">
              {isMessageSubmitting ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
