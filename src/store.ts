import { useSyncExternalStore } from 'react';
import { COLLECTIONS, type BaseRecord, type CollectionName, type DB } from './types';

// Local-first store. All data lives in localStorage so the app works offline;
// sync.ts mirrors it to Supabase when the user is signed in.

const DB_KEY = 'km.db.v1';
const DIRTY_KEY = 'km.dirty.v1';

export const emptyDB = (): DB => ({
  materials: [], products: [], purchases: [], productions: [], sales: [], expenses: [], adjustments: [], settings: [],
});

function load(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return { ...emptyDB(), ...JSON.parse(raw) };
  } catch {
    /* corrupted or unavailable storage: start empty */
  }
  return emptyDB();
}

function loadDirty(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

let db: DB = load();
let dirty: Set<string> = loadDirty(); // "collection/id" keys awaiting upload
const listeners = new Set<() => void>();
let onLocalChange: (() => void) | null = null;

function persist() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...dirty]));
  } catch (e) {
    console.error('Could not save to local storage', e);
    alert('Could not save locally — storage may be full. Try removing large product photos.');
  }
}

function emit() {
  for (const l of listeners) l();
}

export const getDB = () => db;
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useDB = () => useSyncExternalStore(subscribe, getDB);

/** Called by the sync engine to be told about local edits. */
export const setLocalChangeHandler = (fn: (() => void) | null) => {
  onLocalChange = fn;
};

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Monotonic ISO timestamp so two edits in the same millisecond still order. */
let lastStamp = 0;
function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

export function save<C extends CollectionName>(collection: C, record: DB[C][number]) {
  const rec = { ...record, updatedAt: stamp() } as DB[C][number];
  const list = db[collection] as BaseRecord[];
  const idx = list.findIndex((r) => r.id === rec.id);
  const next = idx >= 0 ? list.map((r, i) => (i === idx ? rec : r)) : [...list, rec];
  db = { ...db, [collection]: next };
  dirty.add(`${collection}/${rec.id}`);
  persist();
  emit();
  onLocalChange?.();
  return rec;
}

export function saveMany(items: { collection: CollectionName; record: BaseRecord }[]) {
  for (const { collection, record } of items) save(collection, record as never);
}

export function remove(collection: CollectionName, id: string) {
  const rec = (db[collection] as BaseRecord[]).find((r) => r.id === id);
  if (rec) save(collection, { ...rec, deleted: true } as never);
}

// ---------- Sync support ----------

export function dirtyRecords(): { collection: CollectionName; record: BaseRecord }[] {
  const out: { collection: CollectionName; record: BaseRecord }[] = [];
  for (const key of dirty) {
    const [collection, id] = key.split('/') as [CollectionName, string];
    const record = (db[collection] as BaseRecord[] | undefined)?.find((r) => r.id === id);
    if (record) out.push({ collection, record });
    else dirty.delete(key);
  }
  return out;
}

/** Clear dirty flags for records that haven't been edited again since upload. */
export function markClean(pushed: { collection: CollectionName; record: BaseRecord }[]) {
  for (const { collection, record } of pushed) {
    const cur = (db[collection] as BaseRecord[]).find((r) => r.id === record.id);
    if (cur && cur.updatedAt === record.updatedAt) dirty.delete(`${collection}/${record.id}`);
  }
  persist();
}

export const pendingCount = () => dirty.size;

/** Merge records from the server, last-write-wins on updatedAt. */
export function applyRemote(rows: { collection: string; record: BaseRecord }[]) {
  if (!rows.length) return;
  const next = { ...db };
  const touched = new Set<CollectionName>();
  for (const { collection, record } of rows) {
    if (!COLLECTIONS.includes(collection as CollectionName)) continue;
    const c = collection as CollectionName;
    if (!touched.has(c)) {
      (next as unknown as Record<string, BaseRecord[]>)[c] = [...(next[c] as BaseRecord[])];
      touched.add(c);
    }
    const list = next[c] as BaseRecord[];
    const idx = list.findIndex((r) => r.id === record.id);
    if (idx < 0) list.push(record);
    else if (record.updatedAt > list[idx].updatedAt) {
      list[idx] = record;
      dirty.delete(`${c}/${record.id}`);
    }
  }
  db = next;
  persist();
  emit();
}

/** Replace everything (used by backup restore and sign-out). */
export function replaceAll(next: DB, markAllDirty: boolean) {
  db = { ...emptyDB(), ...next };
  dirty = new Set();
  if (markAllDirty) {
    // Re-stamp so restored records win over newer copies already in the cloud.
    for (const c of COLLECTIONS) {
      (db as unknown as Record<string, BaseRecord[]>)[c] = (db[c] as BaseRecord[]).map((r) => ({ ...r, updatedAt: stamp() }));
      for (const r of db[c] as BaseRecord[]) dirty.add(`${c}/${r.id}`);
    }
  }
  persist();
  emit();
  if (markAllDirty) onLocalChange?.();
}
