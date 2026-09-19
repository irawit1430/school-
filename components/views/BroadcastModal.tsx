import React, { useRef, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { sendBroadcast, apiErrorMessage } from '@/lib/api';
import toast from 'react-hot-toast';

type Audience = 'PARENTS' | 'DRIVERS' | 'ALL';
type BroadcastType = 'SYSTEM' | 'DELAY';

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The fleet map opens this to reach drivers; the sidebar defaults to parents. */
  defaultAudience?: Audience;
}

/**
 * Who a broadcast actually reaches, in the words the sender needs to read back.
 *
 * "PARENTS" on a select is a value, not a consequence. This is the sentence that has to
 * make someone stop and think before notifying an entire school.
 */
const AUDIENCE_COPY: Record<Audience, { label: string; reach: string }> = {
  PARENTS: { label: 'Parents', reach: 'every parent in the school' },
  DRIVERS: { label: 'Drivers', reach: 'every driver in the school' },
  ALL: { label: 'Parents and drivers', reach: 'every parent and every driver in the school' },
};

// `SOS` was selectable here. An SOS means a vehicle is in trouble right now, and every
// one sent by hand from an office teaches parents and drivers to treat the real signal as
// noise. Admin-originated messages are announcements or delays.
const TYPE_COPY: Record<BroadcastType, string> = {
  SYSTEM: 'Announcement',
  DELAY: 'Delay notice',
};

export function BroadcastModal({ isOpen, onClose, defaultAudience = 'PARENTS' }: BroadcastModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Audience>(defaultAudience);
  const [type, setType] = useState<BroadcastType>('SYSTEM');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const dirty = Boolean(title.trim() || message.trim());

  const close = () => {
    // A part-written message explaining that buses are delayed by flooding is usually
    // composed under time pressure. Losing it to a stray click outside the dialog meant
    // typing it twice before anyone noticed the pattern.
    if (dirty && !window.confirm('Discard this broadcast?')) return;
    setTitle(''); setMessage(''); setAudience(defaultAudience);
    setType('SYSTEM'); setError(''); setConfirming(false);
    onClose();
  };

  useClickOutside(modalRef, () => { if (!isSubmitting) close(); });

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) { setError('Type the message you want to send.'); return; }
    setError('');
    setConfirming(true);
  };

  const send = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await sendBroadcast({ title: title.trim(), message: message.trim(), audience, type });
      toast.success(`Sent to ${AUDIENCE_COPY[audience].label.toLowerCase()}.`);
      setTitle(''); setMessage(''); setAudience(defaultAudience);
      setType('SYSTEM'); setConfirming(false);
      onClose();
    } catch (err) {
      // Stay on the confirmation rather than closing: a failed broadcast that looks sent
      // is the whole defect this dialog exists to avoid.
      setError(apiErrorMessage(err, 'Could not send this broadcast. Nobody has been notified.'));
      setConfirming(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const field = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm disabled:bg-slate-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Send broadcast"
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">
            {confirming ? 'Confirm this broadcast' : 'Send Broadcast'}
          </h3>
          <button
            onClick={close}
            disabled={isSubmitting}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {confirming ? (
          <div className="p-6 space-y-4 overflow-y-auto">
            {/* This is the step that was missing entirely: one click used to notify the
                whole school, with no recall and no sent history. */}
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">This goes to {AUDIENCE_COPY[audience].reach}.</p>
                <p className="mt-0.5">It cannot be recalled.</p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {TYPE_COPY[type]}
              </p>
              {title.trim() && <p className="mt-1 font-semibold text-slate-900 break-words">{title.trim()}</p>}
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{message.trim()}</p>
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200 disabled:opacity-50"
              >
                Back to edit
              </button>
              <button
                type="button"
                onClick={send}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70"
              >
                {isSubmitting ? 'Sending…' : `Send to ${AUDIENCE_COPY[audience].label.toLowerCase()}`}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            <fieldset disabled={isSubmitting} className="space-y-4">
              <div>
                <label htmlFor="broadcast-title" className="block text-sm font-semibold text-slate-700 mb-1">Title (Optional)</label>
                <input
                  id="broadcast-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={field}
                  placeholder="e.g. Weather Alert"
                />
              </div>
              <div>
                <label htmlFor="broadcast-message" className="block text-sm font-semibold text-slate-700 mb-1">Message <span className="text-red-500">*</span></label>
                <textarea
                  id="broadcast-message"
                  rows={4}
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); if (error) setError(''); }}
                  className={field}
                  placeholder="Type your message here..."
                />
              </div>
              <div>
                <label htmlFor="broadcast-audience" className="block text-sm font-semibold text-slate-700 mb-1">Audience</label>
                <select
                  id="broadcast-audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as Audience)}
                  className={field}
                >
                  {(Object.keys(AUDIENCE_COPY) as Audience[]).map(key => (
                    <option key={key} value={key}>{AUDIENCE_COPY[key].label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Reaches {AUDIENCE_COPY[audience].reach}.</p>
              </div>
              <div>
                <label htmlFor="broadcast-type" className="block text-sm font-semibold text-slate-700 mb-1">Type</label>
                <select
                  id="broadcast-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as BroadcastType)}
                  className={field}
                >
                  {(Object.keys(TYPE_COPY) as BroadcastType[]).map(key => (
                    <option key={key} value={key}>{TYPE_COPY[key]}</option>
                  ))}
                </select>
              </div>
            </fieldset>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="pt-4 flex gap-3 justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={close}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 flex items-center gap-2"
              >
                Review &amp; send
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
