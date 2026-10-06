import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { applyRemote, dirtyRecords, markClean, pendingCount, setLocalChangeHandler, replaceAll, emptyDB } from './store';
import type { BaseRecord } from './types';

// Mirrors the local store to a Supabase table `records` (see supabase/schema.sql).
// Each row is one record of one collection, stored as JSON. Pull uses the
// server-assigned `synced_at` as a cursor so device clock skew can't hide rows.

const CONFIG_KEY = 'km.supabase.v1';
const CURSOR_KEY = 'km.cursor.v1';

export interface SyncConfig {
  url: string;
  anonKey: string;
}

export interface SyncState {
  configured: boolean;
  session: Session | null;
  status: 'off' | 'idle' | 'syncing' | 'error' | 'offline';
  lastSync: string | null;
  error: string | null;
  pending: number;
}

let state: SyncState = { configured: false, session: null, status: 'off', lastSync: null, error: null, pending: pendingCount() };
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch, pending: pendingCount() };
  for (const l of listeners) l();
};
export const useSync = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

export function getConfig(): SyncConfig | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
    if (saved?.url && saved?.anonKey) return saved;
  } catch {
    /* ignore */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

let client: SupabaseClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;

export function initSync() {
  const cfg = getConfig();
  if (!cfg) {
    client = null;
    set({ configured: false, session: null, status: 'off' });
    return;
  }
  try {
    client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, storageKey: 'km.auth' } });
  } catch (e) {
    client = null;
    set({ configured: false, status: 'error', error: (e as Error).message });
    return;
  }
  set({ configured: true, status: 'idle', error: null });
  client.auth.getSession().then(({ data }) => {
    set({ session: data.session });
    if (data.session) syncNow();
  });
  client.auth.onAuthStateChange((_evt, session) => {
    const wasSignedIn = !!state.session;
    set({ session });
    if (session && !wasSignedIn) syncNow();
  });
  setLocalChangeHandler(() => {
    set({});
    scheduleSync();
  });
}

export function saveConfig(cfg: SyncConfig | null) {
  if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(CURSOR_KEY);
  initSync();
}

function scheduleSync(delay = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function syncNow(): Promise<void> {
  if (!client || !state.session) return;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      set({ status: 'offline' });
      return;
    }
    set({ status: 'syncing', error: null });
    try {
      await pull();
      await push();
      set({ status: 'idle', lastSync: new Date().toISOString() });
    } catch (e) {
      set({ status: 'error', error: (e as Error).message ?? String(e) });
    }
  })();
  try {
    await running;
  } finally {
    running = null;
    if (again) {
      again = false;
      scheduleSync(200);
    }
  }
}

async function pull() {
  const c = client!;
  const saved = localStorage.getItem(CURSOR_KEY);
  // Re-read a short window behind the cursor on the first page: a write that
  // was stamped earlier but committed later would otherwise be skipped.
  // Re-applying rows is harmless (last-write-wins).
  let cursor = saved ? new Date(new Date(saved).getTime() - 30_000).toISOString() : '1970-01-01T00:00:00Z';
  for (;;) {
    const { data, error } = await c
      .from('records')
      .select('id, collection, data, updated_at, deleted, synced_at')
      .gt('synced_at', cursor)
      .order('synced_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    if (!data?.length) break;
    applyRemote(
      data.map((r) => ({
        collection: r.collection,
        record: { ...(r.data as BaseRecord), id: r.id, updatedAt: r.updated_at, deleted: r.deleted },
      })),
    );
    cursor = data[data.length - 1].synced_at;
    localStorage.setItem(CURSOR_KEY, cursor);
    if (data.length < 500) break;
  }
}

async function push() {
  const c = client!;
  const items = dirtyRecords();
  const userId = state.session!.user.id;
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    const rows = chunk.map(({ collection, record }) => ({
      user_id: userId,
      id: record.id,
      collection,
      data: record,
      updated_at: record.updatedAt,
      deleted: !!record.deleted,
    }));
    const { error } = await c.from('records').upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
    markClean(chunk);
  }
}

// ---------- Auth ----------

export async function signIn(email: string, password: string) {
  if (!client) throw new Error('Cloud sync is not set up yet.');
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  if (!client) throw new Error('Cloud sync is not set up yet.');
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

/** Signs out. If `clearLocal`, wipes this device's copy (it's safe in the cloud). */
export async function signOut(clearLocal: boolean) {
  if (!client) return;
  await client.auth.signOut();
  localStorage.removeItem(CURSOR_KEY);
  if (clearLocal) replaceAll(emptyDB(), false);
  set({ session: null, lastSync: null });
}

/** Forget the cursor and re-download everything (repairs a device that drifted). */
export async function fullResync() {
  localStorage.removeItem(CURSOR_KEY);
  await syncNow();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncNow());
  window.addEventListener('focus', () => syncNow());
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, 60_000);
}
