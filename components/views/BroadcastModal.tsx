import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { sendBroadcast } from '@/lib/api';
import toast from 'react-hot-toast';

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BroadcastModal({ isOpen, onClose }: BroadcastModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'PARENTS' | 'DRIVERS' | 'ALL'>('PARENTS');
  const [type, setType] = useState<'SOS' | 'SYSTEM' | 'DELAY'>('SYSTEM');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useClickOutside(modalRef, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message) return;
    setIsSubmitting(true);
    try {
      await sendBroadcast({ title, message, audience, type });
      toast.success('Broadcast sent successfully');
      setTitle('');
      setMessage('');
      setAudience('PARENTS');
      setType('SYSTEM');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send broadcast');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Send Broadcast</h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Title (Optional)</label>
            <input 
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
              placeholder="e.g. Weather Alert"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Message <span className="text-red-500">*</span></label>
            <textarea 
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
              placeholder="Type your message here..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Audience</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
            >
              <option value="PARENTS">Parents</option>
              <option value="DRIVERS">Drivers</option>
              <option value="ALL">All</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
            >
              <option value="SYSTEM">System</option>
              <option value="SOS">SOS</option>
              <option value="DELAY">Delay</option>
            </select>
          </div>
          <div className="pt-4 flex gap-3 justify-end">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 flex items-center gap-2"
            >
              {isSubmitting ? 'Sending...' : 'Send Broadcast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
