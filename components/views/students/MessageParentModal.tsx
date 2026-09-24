import React, { useId, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';

interface MessageParentModalProps {
  messageStudent: any;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  messageForm: { subject: string; body: string };
  setMessageForm: (val: any) => void;
  isMessageSubmitting: boolean;
  error?: string | null;
}

export function MessageParentModal({ messageStudent, onClose, onSubmit, messageForm, setMessageForm, isMessageSubmitting, error }: MessageParentModalProps) {
  const id = useId();
  const [validation, setValidation] = useState<{ studentId?: string; subject?: string; body?: string }>({});
  if (!messageStudent) return null;
  const errors = validation.studentId === messageStudent.id ? validation : {};
  const hasParent = !!messageStudent.parentId;
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isMessageSubmitting || !hasParent) return;
    const next = {
      studentId: messageStudent.id,
      subject: messageForm.subject.trim() ? '' : 'Enter a subject.',
      body: messageForm.body.trim() ? '' : 'Enter a message.',
    };
    setValidation(next);
    if (next.subject || next.body) {
      event.currentTarget.querySelector<HTMLElement>(next.subject ? 'input' : 'textarea')?.focus();
      return;
    }
    onSubmit(event);
  };

  return (
    <Dialog title="Message Parent" onClose={onClose} busy={isMessageSubmitting}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p>Regarding <strong className="text-slate-900">{messageStudent.name}</strong>{messageStudent.grade ? ' · Grade ' + messageStudent.grade : ''}</p>
          {hasParent && <>
            <p className="mt-1 break-words">Parent account: <strong>{messageStudent.parentName || 'Linked parent'}</strong></p>
            {messageStudent.parentEmail && <p className="break-all">{messageStudent.parentEmail}</p>}
          </>}
        </div>
        {!hasParent && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No parent account is linked to this student. {messageStudent.guardianPhone ? 'Contact the guardian at ' + messageStudent.guardianPhone + '.' : 'Add parent account details before messaging.'}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <fieldset disabled={isMessageSubmitting || !hasParent} className="min-w-0 space-y-4">
          <div>
            <label htmlFor={id + '-subject'} className="mb-1 block text-sm font-semibold text-slate-700">Subject <span className="text-red-500" aria-hidden="true">*</span></label>
            <input id={id + '-subject'} type="text" required
              value={messageForm.subject} onChange={event => { setMessageForm({ ...messageForm, subject: event.target.value }); setValidation(current => ({ ...current, subject: '' })); }}
              aria-invalid={!!errors.subject} aria-describedby={errors.subject ? id + '-subject-error' : undefined}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50"
              placeholder="e.g. Bus Delay Notice" />
            {errors.subject && <p id={id + '-subject-error'} role="alert" className="mt-1 text-sm text-red-700">{errors.subject}</p>}
          </div>
          <div>
            <label htmlFor={id + '-body'} className="mb-1 block text-sm font-semibold text-slate-700">Message <span className="text-red-500" aria-hidden="true">*</span></label>
            <textarea id={id + '-body'} required rows={4}
              value={messageForm.body} onChange={event => { setMessageForm({ ...messageForm, body: event.target.value }); setValidation(current => ({ ...current, body: '' })); }}
              aria-invalid={!!errors.body} aria-describedby={errors.body ? id + '-body-error' : undefined}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50"
              placeholder="Type your message here..." />
            {errors.body && <p id={id + '-body-error'} role="alert" className="mt-1 text-sm text-red-700">{errors.body}</p>}
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={isMessageSubmitting} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={isMessageSubmitting || !hasParent} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-70">
            {isMessageSubmitting ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
