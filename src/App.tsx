import { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import Catalogue from './pages/Catalogue';
import Materials from './pages/Materials';
import Money from './pages/Money';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { useDB } from './store';
import { useSync } from './sync';
import { lowStock } from './logic';

export type Page = 'home' | 'catalogue' | 'materials' | 'money' | 'reports' | 'settings';

const NAV: { page: Page; label: string; ico: string }[] = [
  { page: 'home', label: 'Home', ico: '🏠' },
  { page: 'catalogue', label: 'Catalogue', ico: '🧸' },
  { page: 'materials', label: 'Materials', ico: '🧵' },
  { page: 'money', label: 'Sales & money', ico: '₹' },
  { page: 'reports', label: 'Reports', ico: '📊' },
  { page: 'settings', label: 'Settings', ico: '⚙️' },
];

const fromHash = (): Page => {
  const h = location.hash.slice(1) as Page;
  return NAV.some((n) => n.page === h) ? h : 'home';
};

export default function App() {
  const [page, setPage] = useState<Page>(fromHash);
  const db = useDB();
  const sync = useSync();
  const low = lowStock(db);
  const alertCount = low.materials.length;

  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (p: Page) => {
    location.hash = p;
    setPage(p);
    window.scrollTo(0, 0);
  };

  const syncLabel = !sync.configured
    ? 'Saved on this device only'
    : !sync.session
      ? 'Sync: signed out'
      : sync.status === 'syncing'
        ? '↻ Syncing…'
        : sync.status === 'error'
          ? '⚠ Sync error'
          : sync.status === 'offline'
            ? 'Offline'
            : sync.pending > 0
              ? `${sync.pending} change(s) to upload`
              : '☁ All synced';

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand"><img src="./icon.svg" alt="" />Knitty Maa</div>
        {NAV.map((n) => (
          <button key={n.page} className={`nav-btn${page === n.page ? ' active' : ''}`} onClick={() => go(n.page)}>
            <span className="ico">{n.ico}</span>
            {n.label}
            {n.page === 'materials' && alertCount > 0 && <span className="nav-badge" title="Materials running low">{alertCount}</span>}
          </button>
        ))}
        <button className="sync-pill btn ghost small" onClick={() => go('settings')}>{syncLabel}</button>
      </nav>

      <main>
        {page === 'home' && <Dashboard go={go} />}
        {page === 'catalogue' && <Catalogue />}
        {page === 'materials' && <Materials />}
        {page === 'money' && <Money />}
        {page === 'reports' && <Reports />}
        {page === 'settings' && <Settings />}
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((n) => (
          <button key={n.page} className={page === n.page ? 'active' : ''} onClick={() => go(n.page)}>
            <span className="ico">{n.ico}</span>
            {n.page === 'money' ? 'Money' : n.label}
            {n.page === 'materials' && alertCount > 0 && <span className="dot" />}
            {n.page === 'settings' && sync.status === 'error' && <span className="dot" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
