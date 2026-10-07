import { useState } from 'react';
import { getDB, replaceAll, save, useDB, emptyDB } from '../store';
import { fullResync, getConfig, saveConfig, signIn, signOut, signUp, syncNow, useSync } from '../sync';
import { download, Field, NumInput, n } from '../components/ui';
import { getSettings, today } from '../logic';
import { COLLECTIONS, type DB } from '../types';

function BusinessSettings() {
  const db = useDB();
  const s = getSettings(db);
  const [f, setF] = useState({
    businessName: s.businessName,
    hourlyRate: s.hourlyRate as number | '',
    overheadPercent: s.overheadPercent as number | '',
    targetMarginPercent: s.targetMarginPercent as number | '',
  });
  const [saved, setSaved] = useState(false);
  return (
    <div className="card">
      <div className="card-head"><h2>Business & pricing</h2></div>
      <div className="form">
        <Field label="Business name" full><input value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></Field>
        <Field label="Your hourly rate (₹)" hint="What your time is worth; used in product cost"><NumInput value={f.hourlyRate} onChange={(v) => setF({ ...f, hourlyRate: v })} /></Field>
        <Field label="Consumables (% of materials)" hint="Thread, glue, stitch markers you don't track"><NumInput value={f.overheadPercent} onChange={(v) => setF({ ...f, overheadPercent: v })} /></Field>
        <Field label="Target profit margin (%)" hint="Used for suggested prices"><NumInput value={f.targetMarginPercent} onChange={(v) => setF({ ...f, targetMarginPercent: Math.min(95, n(v)) })} /></Field>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn primary"
          onClick={() => {
            save('settings', { ...s, id: 'settings', businessName: f.businessName || 'Knitty Maa', hourlyRate: n(f.hourlyRate), overheadPercent: n(f.overheadPercent), targetMarginPercent: n(f.targetMarginPercent) });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        >Save</button>
        {saved && <span className="pos small">✓ Saved</span>}
      </div>
    </div>
  );
}

function CloudSync() {
  const sync = useSync();
  const cfg = getConfig();
  const [url, setUrl] = useState(cfg?.url ?? ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || ''));
  const [key, setKey] = useState(cfg?.anonKey ?? '');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editCfg, setEditCfg] = useState(!cfg);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const statusText = {
    off: 'Not set up',
    idle: sync.lastSync ? `Synced ${new Date(sync.lastSync).toLocaleTimeString()}` : 'Ready',
    syncing: 'Syncing…',
    error: `Error: ${sync.error}`,
    offline: 'Offline — will sync when back online',
  }[sync.status];

  return (
    <div className="card">
      <div className="card-head">
        <h2>Cloud sync</h2>
        <span className={`badge ${sync.status === 'error' ? 'bad' : sync.session ? 'good' : ''}`}>{sync.session ? statusText : sync.configured ? 'Signed out' : 'Not set up'}</span>
      </div>

      {editCfg ? (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            Sync uses a free Supabase project. Create one at supabase.com, run <code>supabase/schema.sql</code> from this app's repository in its SQL editor,
            then paste the Project URL and the publishable key (Project Settings → API Keys; older projects call it the “anon public” key).
          </p>
          <div className="form">
            <Field label="Project URL" full><input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://xxxx.supabase.co" /></Field>
            <Field label="Publishable / anon key" full><input value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="sb_publishable_… or eyJhbGciOi…" /></Field>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!url || !key} onClick={() => { saveConfig({ url, anonKey: key }); setEditCfg(false); }}>Connect</button>
            {cfg && <button className="btn" onClick={() => setEditCfg(false)}>Cancel</button>}
          </div>
        </>
      ) : !sync.session ? (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>Sign in with the same account on every device. Anything already on this device will be uploaded.</p>
          <div className="form">
            <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={busy || !email || !pw} onClick={() => run(() => signIn(email, pw))}>Sign in</button>
            <button
              className="btn"
              disabled={busy || !email || pw.length < 6}
              onClick={() => run(async () => {
                const r = await signUp(email, pw);
                setMsg(r.needsConfirmation ? 'Account created. Check your email to confirm, then sign in.' : 'Account created.');
              })}
            >Create account</button>
            <span className="spacer" />
            <button className="btn ghost small" onClick={() => setEditCfg(true)}>Change project</button>
          </div>
        </>
      ) : (
        <>
          <p className="small" style={{ marginTop: 0 }}>Signed in as <strong>{sync.session.user.email}</strong>. Changes sync automatically.{sync.pending > 0 && ` ${sync.pending} change(s) waiting to upload.`}</p>
          <div className="row">
            <button className="btn" disabled={sync.status === 'syncing'} onClick={() => syncNow()}>↻ Sync now</button>
            <button className="btn" disabled={sync.status === 'syncing'} onClick={() => fullResync()}>Re-download all</button>
            <span className="spacer" />
            <button
              className="btn danger"
              onClick={() => {
                if (sync.pending > 0 && !confirm(`${sync.pending} change(s) haven't uploaded yet and will be lost. Sign out anyway?`)) return;
                const clear = confirm('Also remove the data from this device? (Recommended on shared devices. It stays safe in the cloud.)');
                run(() => signOut(clear));
              }}
            >Sign out</button>
          </div>
        </>
      )}
      {msg && <p className="small" style={{ color: 'var(--warn)' }}>{msg}</p>}
    </div>
  );
}

function Backup() {
  return (
    <div className="card">
      <div className="card-head"><h2>Backup</h2></div>
      <p className="small muted" style={{ marginTop: 0 }}>Download everything as one file. Keep it somewhere safe, like Google Drive.</p>
      <div className="row">
        <button className="btn" onClick={() => download(`knitty-maa-backup-${today()}.json`, JSON.stringify(getDB()), 'application/json')}>⬇ Download backup</button>
        <label className="btn">
          ⬆ Restore from backup
          <input
            type="file" accept="application/json,.json" hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const data = JSON.parse(await file.text()) as Partial<DB>;
                if (!COLLECTIONS.some((c) => Array.isArray(data[c]))) throw new Error('Not a Knitty Maa backup file');
                if (!confirm('Restore this backup? It replaces the data on this device, and if you are signed in, its records overwrite the cloud copies.')) return;
                replaceAll({ ...emptyDB(), ...data } as DB, true);
                alert('Backup restored.');
              } catch (err) {
                alert(`Could not restore: ${(err as Error).message}`);
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <BusinessSettings />
      <CloudSync />
      <Backup />
    </>
  );
}
