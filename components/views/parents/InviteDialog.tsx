import React, { useState } from 'react';
import { Copy, Mail, MessageCircle, MessageSquare, Printer, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Dialog } from '@/components/ui/Dialog';
import { apiErrorMessage, sendParentInvite, type InviteChannel, type InviteResult } from '@/lib/api';
import { inviteDay, printInviteLetters, smsUrl, whatsappUrl } from '@/lib/invites';

export interface InviteTarget {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface InviteDialogProps {
  parent: InviteTarget;
  /** Unknown (undefined) lets the office try; the server says if email is not set up. */
  emailConfigured?: boolean;
  onClose: () => void;
  /** After an invite is made, so the list can refresh its stage. */
  onInvited?: (result: InviteResult) => void;
  send?: typeof sendParentInvite;
}

/**
 * One family's invite: pick how it goes, and the code is made for that channel.
 *
 * Email is sent by the server, so it either went or it failed, and the office is told
 * which. The other ways hand the office the message to pass on, once: the code is not
 * kept anywhere readable, and a lost one is replaced by sending again, which also kills it.
 */
export function InviteDialog({ parent, emailConfigured, onClose, onInvited, send = sendParentInvite }: InviteDialogProps) {
  const [busy, setBusy] = useState<InviteChannel | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState('');
  const hasPhone = Boolean(parent.phone);

  const make = async (channel: InviteChannel) => {
    if (busy) return;
    setBusy(channel); setError('');
    try {
      const made = await send(parent.id, channel);
      onInvited?.(made);
      if (channel === 'EMAIL') {
        toast.success(`Invite emailed to ${parent.email}.`);
        onClose();
        return;
      }
      setResult(made);
      // Hand straight over to the channel, while the office is looking at it.
      const text = made.message?.text ?? '';
      if (channel === 'WHATSAPP') {
        const url = whatsappUrl(made.phone ?? parent.phone, text);
        if (url) window.open(url, '_blank', 'noopener');
      } else if (channel === 'SMS') {
        const url = smsUrl(made.phone ?? parent.phone, text);
        if (url) window.location.assign(url);
      } else if (channel === 'COPY') {
        await navigator.clipboard.writeText(text).then(
          () => toast.success('Invite copied. Paste it to this family only.'),
          () => toast.error('Could not copy. Select the text below instead.'),
        );
      } else if (channel === 'PRINT') {
        if (!printInviteLetters([made])) toast.error('The browser blocked the print window. Allow pop-ups and try again.');
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not make the invite.'));
    } finally {
      setBusy(null);
    }
  };

  const option = (channel: InviteChannel, label: string, hint: string, Icon: typeof Mail, disabled = false) => (
    <button
      type="button"
      key={channel}
      onClick={() => void make(channel)}
      disabled={disabled || busy !== null}
      className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon size={18} className="mt-0.5 shrink-0 text-slate-600" aria-hidden />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{busy === channel ? 'Making the invite…' : label}</span>
        <span className="block text-xs text-slate-600">{hint}</span>
      </span>
    </button>
  );

  return (
    <Dialog title={`Invite ${parent.name}`} onClose={onClose} busy={busy !== null} size="md" dismissible={!busy}>
      {!result ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            The family gets the app link, their sign-in email (<span className="font-semibold">{parent.email}</span>) and a
            one-time code. Sending again replaces any earlier code.
          </p>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {option('EMAIL', 'Email it', emailConfigured === false ? 'Email is not set up on the server yet.' : 'Sent by Voltava. You will see if it fails.', Mail, emailConfigured === false)}
          {option('WHATSAPP', 'WhatsApp', hasPhone ? `Opens WhatsApp to ${parent.phone}.` : 'No phone number on file.', MessageCircle, !hasPhone)}
          {option('SMS', 'SMS', hasPhone ? `Opens your SMS app to ${parent.phone}.` : 'No phone number on file.', MessageSquare, !hasPhone)}
          {option('PRINT', 'Print a letter', 'One page, to send home in the school diary.', Printer)}
          {option('COPY', 'Copy the message', 'Paste it into any app yourself.', Copy)}
        </div>
      ) : (
        <div className="space-y-3">
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <Send size={14} className="mr-1 inline" aria-hidden />
            Code made. It works until {inviteDay(result.expiresAt)}.
            This is the only time it is shown; if it goes astray, send a new invite.
          </p>
          <label className="block text-xs font-semibold text-slate-600" htmlFor="invite-text">Message for this family only</label>
          <textarea
            id="invite-text"
            readOnly
            rows={12}
            value={result.message?.text ?? ''}
            onFocus={event => event.currentTarget.select()}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800"
          />
          <p className="text-xs text-slate-500">
            WhatsApp and SMS only prove the message was opened on your side. The family shows as signed in once they use the code.
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">Done</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
