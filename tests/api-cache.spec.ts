import { test, expect } from '@playwright/test';
import { cachedGet, clearApiCache, CACHE_TTL_MS, __setClock } from '../lib/apiCache';

// This cache decides whether the dashboard shows fresh data. Getting it wrong is silent
// in both directions: too eager and an admin acts on stale numbers, too lazy and the
// navigation slowness it exists to fix comes back.

test.beforeEach(() => {
  clearApiCache();
  __setClock(() => Date.now());
});

test('repeat visits inside the window make one request', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { n: calls }; };

  await cachedGet('/buses', fetcher);
  await cachedGet('/buses', fetcher);
  await cachedGet('/buses', fetcher);

  expect(calls).toBe(1); // three page mounts, one round trip
});

test('parallel callers share one in-flight request', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    await new Promise(r => setTimeout(r, 20));
    return { n: calls };
  };

  const results = await Promise.all([
    cachedGet('/notifications', fetcher),
    cachedGet('/notifications', fetcher),
    cachedGet('/notifications', fetcher),
  ]);

  expect(calls).toBe(1);
  expect(results[0]).toEqual(results[2]); // all three got the same answer
});

test('past the TTL it refetches rather than serving something old', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { n: calls }; };

  let now = 1_000_000;
  __setClock(() => now);

  await cachedGet('/stats', fetcher);
  now += CACHE_TTL_MS + 1;
  await cachedGet('/stats', fetcher);

  expect(calls).toBe(2);
});

test('clearing drops everything, so a write is never followed by a stale read', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return { n: calls }; };

  await cachedGet('/drivers', fetcher);
  await cachedGet('/buses', fetcher);
  expect(calls).toBe(2);

  clearApiCache(); // what api() does after any POST/PUT/DELETE

  await cachedGet('/drivers', fetcher);
  await cachedGet('/buses', fetcher);
  expect(calls).toBe(4);
});

test('a failed request is not cached', async () => {
  let calls = 0;
  const failing = async () => { calls++; throw new Error('network down'); };

  await expect(cachedGet('/leaves', failing)).rejects.toThrow('network down');
  await expect(cachedGet('/leaves', failing)).rejects.toThrow('network down');

  expect(calls).toBe(2); // retried, not a cached failure
});
