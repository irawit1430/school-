/**
 * One socket for the whole tab, loaded only when something actually listens.
 *
 * Two problems this solves, both of which cost every admin on every page:
 *
 * 1. `socket.io-client` was a static import in lib/api.ts, and lib/api.ts is imported by
 *    23 files including the login page — which has no socket. The login screen, the one
 *    page every user waits on before they can do anything, downloaded and parsed ~43 KB
 *    of transport code it never called. It is behind a dynamic import now, so it arrives
 *    only on a page that opens a connection.
 *
 * 2. Every caller used to get its own connection. The dashboard layout mounts Header and
 *    EmergencyAlertBanner, and the page underneath mounts a third listener, so opening
 *    Overview meant three WebSocket handshakes, three auth round trips, and the server
 *    fanning every telemetry packet out three times to one admin. They share one now.
 *
 * Handles are refcounted: `disconnect()` detaches that caller's listeners and the real
 * socket closes when the last one lets go. Callers keep the API they already used —
 * `on` / `off` / `disconnect` — so no call site had to learn about the sharing.
 */
import type { Socket } from 'socket.io-client';

type Handler = (...args: any[]) => void;

/**
 * What call sites actually use. Deliberately structural rather than socket.io's `Socket`:
 * it keeps the shared handle substitutable and lets tests pass a plain fake.
 */
export interface SocketHandle {
  on(event: string, handler: Handler): void;
  off(event: string, handler: Handler): void;
  disconnect(): void;
}

export interface SocketOptions {
  url: string;
  /** Read at connect time, not at import time — the token arrives after login. */
  getToken: () => string | null;
  onUnauthorized: () => void;
}

let shared: Socket | null = null;
let pending: Promise<Socket | null> | null = null;
let handles = 0;

/**
 * Test seam, in the spirit of apiCache's `__setClock`: lets a test supply a fake socket
 * instead of opening a real WebSocket. Production never sets this, so the default path
 * stays the dynamic import that keeps the client out of the login bundle.
 */
type SocketFactory = (opts: SocketOptions) => Promise<Socket>;

const defaultFactory: SocketFactory = async (opts) => {
  const { io } = await import('socket.io-client');
  return io(opts.url, {
    auth: { token: opts.getToken() }, // REQUIRED — server rejects without it
    transports: ['websocket'],
  });
};

let factory: SocketFactory = defaultFactory;
export const __setSocketFactory = (fn: SocketFactory | null) => {
  factory = fn ?? defaultFactory;
};

/**
 * Bumped by every teardown. A socket whose generation is stale was created by a load
 * that finished after its last listener had already gone — it is nobody's, so it is
 * closed on arrival rather than left open for the lifetime of the tab.
 */
let generation = 0;

function ensureSocket(opts: SocketOptions): Promise<Socket | null> {
  if (shared) return Promise.resolve(shared);

  if (!pending) {
    const gen = generation;
    pending = factory(opts)
      .then(socket => {
        if (gen !== generation) {
          socket.disconnect();
          return null;
        }

        socket.on('connect_error', (err: Error) => {
          if (err.message?.startsWith('Unauthorized') || err.message?.includes('invalid token')) {
            opts.onUnauthorized();
          }
        });

        shared = socket;
        return socket;
      })
      .catch(err => {
        // A failed chunk load must not take the page down with it: live telemetry stops,
        // the REST polling each screen already falls back to keeps working.
        console.warn('[socket] client failed to load; live updates are off', err);
        return null;
      })
      .finally(() => {
        if (gen === generation) pending = null;
      });
  }

  return pending;
}

/** Closes the shared connection and forgets it. Safe to call when nothing is open. */
export function closeSharedSocket() {
  generation++;
  pending = null;
  handles = 0;
  if (shared) {
    shared.removeAllListeners();
    shared.disconnect();
    shared = null;
  }
}

export function openSocket(opts: SocketOptions): SocketHandle {
  const mine: Array<[string, Handler]> = [];
  let live: Socket | null = null;
  let released = false;

  handles++;

  ensureSocket(opts).then(socket => {
    if (!socket || released) return;
    live = socket;
    for (const [event, handler] of mine) socket.on(event, handler);
    // A caller that attached after the connection was already up would otherwise never
    // see 'connect' — and Header reads that event to tell a reconnect from a first
    // connect. Replaying it keeps each handle's lifecycle identical to a private socket.
    if (socket.connected) {
      for (const [event, handler] of mine) if (event === 'connect') handler();
    }
  });

  return {
    on(event, handler) {
      if (released) return;
      mine.push([event, handler]);
      if (live) {
        live.on(event, handler);
        if (event === 'connect' && live.connected) handler();
      }
    },

    off(event, handler) {
      const i = mine.findIndex(([e, h]) => e === event && h === handler);
      if (i !== -1) mine.splice(i, 1);
      live?.off(event, handler);
    },

    /**
     * Releases this caller's claim. Named `disconnect` because that is what every call
     * site already had in its effect cleanup, and because from the caller's side it is
     * true — its listeners are gone. The underlying socket survives until the last one.
     */
    disconnect() {
      if (released) return;
      released = true;
      if (live) for (const [event, handler] of mine) live.off(event, handler);
      mine.length = 0;
      live = null;
      handles = Math.max(0, handles - 1);
      if (handles === 0) closeSharedSocket();
    },
  };
}
