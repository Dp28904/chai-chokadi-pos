import { CatalogCache } from './catalog-cache.service';

function fakePrisma() {
  const calls = { n: 0 };
  let release: () => void = () => {};
  const gate = { wait: false };
  const prisma = {
    item: {
      findMany: async () => {
        calls.n++;
        if (gate.wait) await new Promise<void>((r) => (release = r));
        return [{ id: 1, name: `v${calls.n}` }];
      },
    },
    combo: { findMany: () => Promise.resolve([]) },
    offer: { findMany: () => Promise.resolve([]) },
  };
  return { prisma, calls, gate, release: () => release() };
}

describe('CatalogCache', () => {
  it('loads once and serves from memory', async () => {
    const f = fakePrisma();
    const c = new CatalogCache(f.prisma as never);
    await c.get();
    await c.get();
    await c.get();
    expect(f.calls.n).toBe(1);
  });

  it('concurrent callers share one load', async () => {
    const f = fakePrisma();
    const c = new CatalogCache(f.prisma as never);
    await Promise.all([c.get(), c.get(), c.get()]);
    expect(f.calls.n).toBe(1);
  });

  it('invalidate forces a fresh load', async () => {
    const f = fakePrisma();
    const c = new CatalogCache(f.prisma as never);
    await c.get();
    c.invalidate();
    const s = await c.get();
    expect(f.calls.n).toBe(2);
    expect(s.items.get(1)?.name).toBe('v2');
  });

  it('a write during a load does not leave stale data cached', async () => {
    const f = fakePrisma();
    const c = new CatalogCache(f.prisma as never);
    f.gate.wait = true;
    const pending = c.get();
    await new Promise((r) => setImmediate(r));
    c.invalidate(); // menu edited while the load was in flight
    f.gate.wait = false;
    f.release();
    await pending;
    await c.get();
    expect(f.calls.n).toBe(2);
  });
});
