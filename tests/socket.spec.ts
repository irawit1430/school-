import { test, expect } from '@playwright/test';
import { openSocket, closeSharedSocket, __setSocketFactory } from '../lib/socket';

/**
 * The dashboard layout mounts two listeners and the page under it mounts a third, so
 * "one connection per caller" meant three WebSockets, three auth round trips and three
 * copies of every telemetry packet for a single admin. These tests pin the sharing down,
 * because the symptom of losing it is invisible in the UI — everything still works, it
 * just costs three times as much.
 */

// A fake socket that records what was attached to it, so a test can count connections
// and check that listeners are really removed.
function fakeSocket() {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  return {
    connected: false,
    disconnected: 0,
    removedAll: 0,
    on(event: string, fn: (...a: any[]) => void) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(fn);
    },
    off(event: string, fn: (...a: any[]) => void) {
      const list = handlers.get(event) ?? [];
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    removeAllListeners() {
      this.removedAll++;
      handlers.clear();
    },
    disconnect() {
      this.disconnected++;
    },
    emit(event: string, payload?: any) {
      for (const fn of [...(handlers.get(event) ?? [])]) fn(payload);
    },
    count(event: string) {
      return (handlers.get(event) ?? []).length;
    },
  };
}

type Fake = ReturnType<typeof fakeSocket>;

function install() {
  const created: Fake[] = [];
  __setSocketFactory(async () => {
    const s = fakeSocket();
    created.push(s);
    return s as any;
  });
  return created;
}

const opts = { url: 'wss://example.test', getToken: () => 'tok', onUnauthorized: () => {} };

test.afterEach(() => {
  closeSharedSocket();
  __setSocketFactory(null);
});

test('three callers on one page share a single connection', async () => {
  const created = install();

  const header = openSocket(opts);
  const banner = openSocket(opts);
  const page = openSocket(opts);
  header.on('notification', () => {});
  banner.on('emergency_alert', () => {});
  page.on('location_update', () => {});

  await new Promise(r => setTimeout(r, 0));

  expect(created).toHaveLength(1);
  expect(created[0].count('notification')).toBe(1);
  expect(created[0].count('emergency_alert')).toBe(1);
  expect(created[0].count('location_update')).toBe(1);
});

test('the connection closes only when the last caller lets go', async () => {
  const created = install();

  const a = openSocket(opts);
  const b = openSocket(opts);
  a.on('x', () => {});
  b.on('x', () => {});
  await new Promise(r => setTimeout(r, 0));

  a.disconnect();
  expect(created[0].disconnected).toBe(0);
  // A released caller must stop hearing packets even while the socket stays open.
  expect(created[0].count('x')).toBe(1);

  b.disconnect();
  expect(created[0].disconnected).toBe(1);
});

test('a caller that attaches after connect still sees connect', async () => {
  const created = install();

  const first = openSocket(opts);
  first.on('connect', () => {});
  await new Promise(r => setTimeout(r, 0));
  created[0].connected = true;

  // Header distinguishes a reconnect from the first connect by whether it has seen one.
  // A late caller that never got 'connect' would mistake the next reconnect for a first
  // connect and skip the refetch that keeps its list from going stale.
  let seen = 0;
  const late = openSocket(opts);
  late.on('connect', () => { seen++; });
  await new Promise(r => setTimeout(r, 0));

  expect(seen).toBe(1);
  expect(created).toHaveLength(1);
});

test('a socket that arrives after its last caller left is not left open', async () => {
  const created: Fake[] = [];
  let release!: (s: any) => void;
  __setSocketFactory(() => new Promise(res => {
    release = (s) => { created.push(s); res(s); };
  }));

  // React Strict Mode mounts, unmounts and remounts an effect: the first handle is gone
  // before the client chunk has even finished loading.
  const handle = openSocket(opts);
  handle.disconnect();

  const s = fakeSocket();
  release(s as any);
  await new Promise(r => setTimeout(r, 0));

  expect(s.disconnected).toBe(1);
});

test('off detaches the handler from the shared socket', async () => {
  const created = install();
  const handle = openSocket(opts);
  const fn = () => {};
  handle.on('location_update', fn);
  await new Promise(r => setTimeout(r, 0));
  expect(created[0].count('location_update')).toBe(1);

  handle.off('location_update', fn);
  expect(created[0].count('location_update')).toBe(0);
});
