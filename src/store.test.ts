import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal localStorage for the node test environment.
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});

const store = await import('./store');
const exp = (id: string, amount: number) => ({ id, updatedAt: '', date: '2026-10-01', category: 'Other', amount, description: '' });

describe('local store + sync bookkeeping', () => {
  beforeEach(() => store.replaceAll(store.emptyDB(), false));

  it('marks saved records dirty until pushed', () => {
    const rec = store.save('expenses', exp('e1', 10));
    expect(store.pendingCount()).toBe(1);
    store.markClean([{ collection: 'expenses', record: rec }]);
    expect(store.pendingCount()).toBe(0);
  });

  it('keeps a record dirty if it was edited again during upload', () => {
    const first = store.save('expenses', exp('e1', 10));
    store.save('expenses', { ...first, amount: 20 });
    store.markClean([{ collection: 'expenses', record: first }]);
    expect(store.pendingCount()).toBe(1);
  });

  it('remote merge is last-write-wins', () => {
    const local = store.save('expenses', exp('e1', 10));
    store.applyRemote([{ collection: 'expenses', record: { ...local, amount: 99, updatedAt: '2000-01-01T00:00:00.000Z' } as never }]);
    expect(store.getDB().expenses[0].amount).toBe(10); // older remote ignored
    store.applyRemote([{ collection: 'expenses', record: { ...local, amount: 99, updatedAt: '2999-01-01T00:00:00.000Z' } as never }]);
    expect(store.getDB().expenses[0].amount).toBe(99); // newer remote wins
    expect(store.pendingCount()).toBe(0);
  });

  it('delete is a synced tombstone', () => {
    store.save('expenses', exp('e1', 10));
    store.remove('expenses', 'e1');
    expect(store.getDB().expenses[0].deleted).toBe(true);
    expect(store.dirtyRecords()).toHaveLength(1);
  });

  it('ignores unknown collections from the server', () => {
    store.applyRemote([{ collection: 'nope', record: { id: 'x', updatedAt: 'z' } }]);
    expect(store.getDB()).not.toHaveProperty('nope');
  });

  it('persists to localStorage', () => {
    store.save('expenses', exp('e1', 10));
    expect(JSON.parse(mem.get('km.db.v1')!).expenses).toHaveLength(1);
  });
});
