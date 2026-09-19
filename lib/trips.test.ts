// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { routeDeleteBlock } from './trips';

const refusal = (data: Record<string, unknown>) => ({ status: 409, data });

describe('why a route would not delete', () => {
  it('reports active trips as the fixable kind, so the caller can offer a way out', () => {
    const block = routeDeleteBlock(refusal({ code: 'ROUTE_HAS_TRIPS', tripCount: 5, activeTripCount: 2 }));
    expect(block?.kind).toBe('active');
    expect(block?.activeTripCount).toBe(2);
    expect(block?.message).toContain('2 active trips');
  });

  it('reports a finished route as historical, and never suggests cancelling', () => {
    const block = routeDeleteBlock(refusal({ code: 'ROUTE_HAS_TRIPS', tripCount: 5, activeTripCount: 0 }));
    expect(block?.kind).toBe('historical');
    // The whole point of the split: retrying is futile here, and the UI keys the
    // "cancel these trips" affordance off `kind`, so a wrong kind would offer a dead end.
    expect(block?.message).not.toMatch(/cancel/i);
    expect(block?.message).toContain('already run 5 trips');
    expect(block?.message).toContain('no longer be deleted');
  });

  it('counts one trip as a trip, not "1 trips"', () => {
    expect(routeDeleteBlock(refusal({ code: 'ROUTE_HAS_TRIPS', tripCount: 1, activeTripCount: 1 }))?.message)
      .toContain('1 active trip.');
    expect(routeDeleteBlock(refusal({ code: 'ROUTE_HAS_TRIPS', tripCount: 1, activeTripCount: 0 }))?.message)
      .toContain('already run 1 trip,');
  });

  it('defers to the server for any other refusal', () => {
    expect(routeDeleteBlock(refusal({ code: 'SOMETHING_ELSE' }))).toBeNull();
    expect(routeDeleteBlock({ status: 400, data: { code: 'ROUTE_HAS_TRIPS' } })).toBeNull();
    expect(routeDeleteBlock({ status: 500 })).toBeNull();
    expect(routeDeleteBlock(new Error('Network request failed'))).toBeNull();
    expect(routeDeleteBlock(null)).toBeNull();
  });

  it('falls back rather than inventing a reason when the counts are missing', () => {
    expect(routeDeleteBlock(refusal({ code: 'ROUTE_HAS_TRIPS' }))).toBeNull();
  });
});
