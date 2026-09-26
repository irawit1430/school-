import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() }, default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchParentActivation: vi.fn(),
  sendParentInvite: vi.fn(),
  sendParentInvites: vi.fn(),
  revokeParentInvite: vi.fn(),
}));

import * as api from '@/lib/api';
import { ParentActivation } from '../components/views/ParentActivation';
import { InviteDialog } from '../components/views/parents/InviteDialog';
import { ReadinessPanel } from '../components/views/overview/ReadinessPanel';
import { PlatformHealthBanner } from '../components/layout/PlatformHealthBanner';
import { inviteDetail, phoneForLinks, whatsappUrl, inviteLettersHtml } from '../lib/invites';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const render = async (ui: React.ReactNode) => { await act(async () => { root.render(ui); await Promise.resolve(); await Promise.resolve(); }); };
const button = (text: string | RegExp) => {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => typeof text === 'string' ? node.textContent?.trim() === text : text.test(node.textContent ?? ''));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
};

const parent = (over: Partial<api.ActivationParent>): api.ActivationParent => ({
  id: 'p1', name: 'Sunita Devi', email: 'sunita@mail.com', phone: '9876543210', stage: 'NOT_INVITED',
  children: [{ id: 's1', name: 'Asha', grade: '5B', hasStop: true }],
  invite: { sentAt: null, expiresAt: null, channel: null }, signedInAt: null, passwordChosen: false,
  push: { state: 'NONE', devices: [] }, lastSeenAt: null, ...over,
});

const activation = (): api.ParentActivation => ({
  totals: {
    students: 4, studentsWithoutParent: 1, studentsWithoutStop: 1, parents: 3,
    stages: { NOT_INVITED: 1, INVITE_SENT: 1, ACTIVATED: 1 }, push: { DELIVERING: 1 },
  },
  parents: [
    parent({}),
    parent({ id: 'p2', name: 'Ravi Kumar', email: 'ravi@mail.com', stage: 'INVITE_SENT', invite: { sentAt: '2026-09-25T04:00:00Z', expiresAt: '2026-10-02T04:00:00Z', channel: 'WHATSAPP' }, children: [{ id: 's2', name: 'Arun', grade: '3A', hasStop: false }] }),
    parent({ id: 'p3', name: 'Meena', email: 'meena@mail.com', stage: 'ACTIVATED', passwordChosen: true, push: { state: 'DELIVERING', devices: [] }, lastSeenAt: '2026-09-26T04:00:00Z' }),
  ],
  studentsWithoutParent: [{ id: 's9', name: 'Orphan Child', grade: '2', rfidTag: 'R9', guardianPhone: null }],
  emailConfigured: false, iphonePushConfigured: false, appLinks: { android: null, ios: null }, inviteDays: 7,
});

describe('the Parents page', () => {
  it('shows each step of activation and where every family is', async () => {
    vi.mocked(api.fetchParentActivation).mockResolvedValue(activation());
    await render(<ParentActivation />);

    const steps = [...host.querySelectorAll('ol[aria-label="Activation steps"] li')].map(li => li.textContent);
    expect(steps[0]).toContain('3 / 4');
    expect(steps[1]).toMatch(/2 \/ 3.*Families invited/);
    expect(steps[3]).toMatch(/1 \/ 3.*Chose their own password/);
    expect(host.textContent).toContain('Not invited');
    expect(host.textContent).toContain('Code given for WhatsApp');
    expect(host.textContent).toContain('· no stop');
    expect(host.textContent).toContain('Alerts reaching phone');
    expect(host.textContent).toContain('Orphan Child');
    // The server has no email: the page says so before anyone tries.
    expect(host.textContent).toContain('Email invites are not set up on the server');
    expect(button(/Email invites/).disabled).toBe(true);
  });

  it('never lets an active family be selected for an invite', async () => {
    vi.mocked(api.fetchParentActivation).mockResolvedValue(activation());
    await render(<ParentActivation />);
    const box = host.querySelector<HTMLInputElement>('input[aria-label="Select Meena"]')!;
    expect(box.disabled).toBe(true);
  });

  it('prints letters for the selected families in one go', async () => {
    vi.mocked(api.fetchParentActivation).mockResolvedValue(activation());
    vi.mocked(api.sendParentInvites).mockResolvedValue({ channel: 'PRINT', sent: 2, failed: [], skipped: [], letters: [
      { parentId: 'p1', channel: 'PRINT', sent: null, expiresAt: '2026-10-04T00:00:00Z', code: 'Ab3dEf7hJk', message: { subject: 's', text: 'Namaste' } },
    ] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const opened = { document: doc, focus: vi.fn(), print: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(opened as unknown as Window);
    await render(<ParentActivation />);

    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="Select every family that can be invited"]')!.click());
    await act(async () => { button(/Print letters \(2\)/).click(); await Promise.resolve(); await Promise.resolve(); });

    expect(api.sendParentInvites).toHaveBeenCalledWith(['p1', 'p2'], 'PRINT');
    expect(doc.write.mock.calls[0][0]).toContain('Ab3dEf7hJk');
    expect(opened.print).toHaveBeenCalled();
  });

  it('says so when the list cannot load, instead of an empty page', async () => {
    vi.mocked(api.fetchParentActivation).mockRejectedValue(new api.ApiError('Gateway timeout', 504));
    await render(<ParentActivation />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Gateway timeout');
  });
});

describe('an invite by WhatsApp', () => {
  test('opens WhatsApp to the family with the message, and shows the code once', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const send = vi.fn().mockResolvedValue({
      parentId: 'p1', channel: 'WHATSAPP', sent: null, expiresAt: '2026-10-04T00:00:00Z', code: 'Ab3dEf7hJk', phone: '9876543210',
      message: { subject: 's', text: 'Namaste Sunita\nOne-time code: Ab3dEf7hJk' },
    });
    const onInvited = vi.fn();
    await render(<InviteDialog parent={{ id: 'p1', name: 'Sunita', email: 'sunita@mail.com', phone: '9876543210' }} emailConfigured={false} onClose={vi.fn()} onInvited={onInvited} send={send} />);
    expect(button(/Email it/).disabled).toBe(true);
    await act(async () => { button(/WhatsApp/).click(); await Promise.resolve(); });

    expect(send).toHaveBeenCalledWith('p1', 'WHATSAPP');
    expect(open.mock.calls[0][0]).toBe('https://wa.me/919876543210?text=' + encodeURIComponent('Namaste Sunita\nOne-time code: Ab3dEf7hJk'));
    expect(host.querySelector('textarea')!.value).toContain('Ab3dEf7hJk');
    expect(host.textContent).toContain('This is the only time it is shown');
    expect(onInvited).toHaveBeenCalled();
  });

  test('a family with no phone cannot be sent WhatsApp or SMS', async () => {
    await render(<InviteDialog parent={{ id: 'p1', name: 'Sunita', email: 'sunita@mail.com', phone: null }} emailConfigured onClose={vi.fn()} send={vi.fn()} />);
    expect(button(/WhatsApp/).disabled).toBe(true);
    expect(button(/SMS/).disabled).toBe(true);
    expect(button(/Email it/).disabled).toBe(false);
  });
});

describe('the office exception queue', () => {
  const readiness = (over: Partial<api.Readiness> = {}): api.Readiness => ({
    generatedAt: '', platform: { degraded: false, alarms: [] }, counts: { students: 0, parents: 0, stages: {} },
    setup: { androidPush: true, iphonePush: false, email: false, appLinks: { android: null, ios: null } },
    items: [
      { key: 'TRIP_UNTRACKED', severity: 'critical', count: 1, title: 'Trip running with no GPS', detail: 'BR01 1111 (Route 1)', href: '/map' },
      { key: 'PARENT_NOT_INVITED', severity: 'warning', count: 48, title: 'Parents not invited', detail: '48 families', href: '/parents?stage=NOT_INVITED' },
    ],
    ...over,
  });

  test('lists what is waiting with where to fix it', async () => {
    await render(<ReadinessPanel load={vi.fn().mockResolvedValue(readiness())} />);
    expect(host.textContent).toContain('Critical: Trip running with no GPS (1)');
    expect(host.querySelector<HTMLAnchorElement>('a[href="/parents?stage=NOT_INVITED"]')).not.toBeNull();
  });

  test('a failed load is never an all-clear', async () => {
    await render(<ReadinessPanel load={vi.fn().mockRejectedValue(new Error('offline'))} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Unavailable');
    expect(host.textContent).not.toContain('Nothing is waiting');
  });

  test('the platform banner shows only a real platform alarm', async () => {
    await render(<PlatformHealthBanner load={vi.fn().mockResolvedValue(readiness())} />);
    expect(host.textContent).toBe('');
    await render(<PlatformHealthBanner key="down" load={vi.fn().mockResolvedValue(readiness({ platform: { degraded: true, alarms: [{ check: 'GPS_INTAKE', since: '2026-09-27T02:00:00Z', message: 'Voltava is not receiving bus positions from any school right now.' }] } }))} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Voltava is not receiving bus positions');
  });
});

describe('invite helpers', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['09876543210', '919876543210'],
    ['+91 98765 43210', '919876543210'],
    ['12345', null],
  ])('reads %s as %s for WhatsApp and SMS', (input, expected) => {
    expect(phoneForLinks(input)).toBe(expected);
  });

  it('never makes a link without a real number', () => {
    expect(whatsappUrl(null, 'x')).toBeNull();
  });

  it('describes a sent invite by how it went and until when it works', () => {
    expect(inviteDetail({ stage: 'INVITE_SENT', invite: { sentAt: '2026-09-25T04:00:00Z', expiresAt: '2026-10-02T04:00:00Z', channel: 'PRINT' }, signedInAt: null, lastSeenAt: null }))
      .toBe('Code printed as a letter 25 Sept · works until 2 Oct');
  });

  it('escapes family names in printed letters', () => {
    const html = inviteLettersHtml([{ parentId: 'p', channel: 'PRINT', sent: null, expiresAt: '', code: 'X', name: '<script>', message: { subject: '', text: '<b>hi</b>' } }]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>hi</b>');
  });
});
