import type { ActivationParent, InviteResult, ParentPushState, ParentStage } from './api';

/**
 * Where each family stands, in the office's words, and how to reach them.
 *
 * A staff channel (WhatsApp, SMS, print, copy) only ever proves the code was made for
 * that channel. Whether the family got it is known when they sign in, and the labels
 * say so rather than calling an unopened WhatsApp tab "delivered".
 */
export const STAGE_META: Record<ParentStage, { label: string; tone: 'slate' | 'amber' | 'red' | 'blue' | 'green'; order: number }> = {
  NOT_INVITED: { label: 'Not invited', tone: 'slate', order: 0 },
  EMAIL_FAILED: { label: 'Invite email failed', tone: 'red', order: 1 },
  INVITE_EXPIRED: { label: 'Invite expired', tone: 'red', order: 2 },
  INVITE_SENT: { label: 'Invited, not signed in', tone: 'amber', order: 3 },
  SIGNED_IN: { label: 'Signed in, password not chosen', tone: 'blue', order: 4 },
  ACTIVATED: { label: 'Using the app', tone: 'green', order: 5 },
};

export const PUSH_META: Record<ParentPushState, { label: string; tone: 'slate' | 'amber' | 'red' | 'green' }> = {
  DELIVERING: { label: 'Alerts reaching phone', tone: 'green' },
  REGISTERED: { label: 'Alerts on, none sent yet', tone: 'slate' },
  NONE: { label: 'Alerts not allowed', tone: 'amber' },
  FAILING: { label: 'Phone refusing alerts', tone: 'red' },
  IPHONE_NOT_SENDING: { label: 'iPhone: alerts not switched on yet', tone: 'amber' },
};

const CHANNEL_WORDS: Record<string, string> = {
  EMAIL: 'emailed',
  WHATSAPP: 'given for WhatsApp',
  SMS: 'given for SMS',
  PRINT: 'printed as a letter',
  COPY: 'copied by staff',
};

// School days are Indian days: a code made at 1 am IST expires on the IST date the invite
// letter printed, whatever timezone the office computer is set to.
export const inviteDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const day = inviteDay;

/** One line under the stage: how and when the invite went, and until when it works. */
export function inviteDetail(p: Pick<ActivationParent, 'stage' | 'invite' | 'signedInAt' | 'lastSeenAt'>): string {
  const { sentAt, expiresAt, channel } = p.invite;
  switch (p.stage) {
    case 'ACTIVATED':
      return p.lastSeenAt ? `Last opened the app ${day(p.lastSeenAt)}` : 'Chose their own password';
    case 'SIGNED_IN':
      return p.signedInAt ? `Signed in ${day(p.signedInAt)}; has not finished` : 'Signed in; has not finished';
    case 'INVITE_SENT':
      return `Code ${CHANNEL_WORDS[channel ?? ''] ?? 'made'}${sentAt ? ` ${day(sentAt)}` : ''}${expiresAt ? ` · works until ${day(expiresAt)}` : ''}`;
    case 'INVITE_EXPIRED':
      return `Code ran out${expiresAt ? ` ${day(expiresAt)}` : ''}. Send a new one.`;
    case 'EMAIL_FAILED':
      return 'The invite email did not send. Check the address or send it another way.';
    default:
      return 'No invite sent yet';
  }
}

/** Digits only, with India's 91 in front of a bare 10-digit mobile. */
export function phoneForLinks(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export const whatsappUrl = (phone: string | null | undefined, text: string) => {
  const to = phoneForLinks(phone);
  return to ? `https://wa.me/${to}?text=${encodeURIComponent(text)}` : null;
};

export const smsUrl = (phone: string | null | undefined, text: string) => {
  const to = phoneForLinks(phone);
  return to ? `sms:+${to}?body=${encodeURIComponent(text)}` : null;
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * Printable invite letters, one family per page. Opened in a new window and printed from
 * there, so nothing from the dashboard (and no other family's code) is on the page.
 */
export function inviteLettersHtml(letters: InviteResult[], schoolName?: string): string {
  const pages = letters.map(l => `
<section class="letter">
  <p class="school">${escapeHtml(schoolName || 'School transport office')}</p>
  <pre>${escapeHtml(l.message?.text ?? '')}</pre>
  <p class="code">One-time code: <b>${escapeHtml(l.code ?? '')}</b></p>
  <p class="for">For: ${escapeHtml((l.childNames ?? []).join(', ') || l.name || '')} · ${escapeHtml(l.email ?? '')}</p>
</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Parent app invites</title>
<style>
  body { font-family: Arial, sans-serif; color: #1f2937; margin: 0; }
  .letter { padding: 18mm 16mm; page-break-after: always; }
  .letter:last-child { page-break-after: auto; }
  .school { font-weight: bold; font-size: 14pt; color: #463A6B; margin: 0 0 8mm; }
  pre { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; white-space: pre-wrap; margin: 0; }
  .code { margin-top: 8mm; font-size: 16pt; border: 2px dashed #463A6B; padding: 4mm; display: inline-block; }
  .code b { letter-spacing: 2px; font-family: monospace; }
  .for { margin-top: 6mm; color: #6b7280; font-size: 10pt; }
</style></head><body>${pages}</body></html>`;
}

/** Print letters. Returns false when the browser blocked the new window. */
export function printInviteLetters(letters: InviteResult[], schoolName?: string): boolean {
  if (typeof window === 'undefined' || letters.length === 0) return false;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(inviteLettersHtml(letters, schoolName));
  w.document.close();
  w.focus();
  w.print();
  return true;
}
