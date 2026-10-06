import { useMemo, useState } from 'react';
import { useDB } from '../store';
import { fmtDate, Kpi, Tabs } from '../components/ui';
import { ExpenseModal, PurchaseModal, SaleModal } from '../components/forms';
import { live, money, monthKey, monthLabel, qtyFmt, saleTotal, today } from '../logic';
import type { DB } from '../types';

type Tab = 'sales' | 'expenses' | 'ledger';
type Open = { kind: 'sale' | 'expense' | 'purchase'; id?: string } | null;

interface Entry {
  id: string;
  kind: 'sale' | 'expense' | 'purchase';
  date: string;
  title: string;
  detail: string;
  amount: number; // + income, − spend
}

function ledger(db: DB): Entry[] {
  const pname = (id?: string) => db.products.find((p) => p.id === id)?.name;
  const mname = (id: string) => db.materials.find((m) => m.id === id)?.name ?? 'Material';
  return [
    ...live(db.sales).map((s) => ({
      id: s.id, kind: 'sale' as const, date: s.date,
      title: `${s.qty} × ${pname(s.productId) ?? s.description ?? 'Item'}`,
      detail: [s.customer, s.channel].filter(Boolean).join(' · '),
      amount: saleTotal(s),
    })),
    ...live(db.purchases).map((p) => ({
      id: p.id, kind: 'purchase' as const, date: p.date,
      title: `${mname(p.materialId)} (${qtyFmt(p.qty)} ${db.materials.find((m) => m.id === p.materialId)?.unit ?? ''})`,
      detail: ['Materials', p.supplier].filter(Boolean).join(' · '),
      amount: -p.totalCost,
    })),
    ...live(db.expenses).map((e) => ({
      id: e.id, kind: 'expense' as const, date: e.date, title: e.description || e.category, detail: e.category, amount: -e.amount,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
}

export default function Money() {
  const db = useDB();
  const [tab, setTab] = useState<Tab>('sales');
  const [month, setMonth] = useState(monthKey(today()));
  const [open, setOpen] = useState<Open>(null);

  const all = useMemo(() => ledger(db), [db]);
  const months = useMemo(() => [...new Set([monthKey(today()), ...all.map((e) => monthKey(e.date))])].sort().reverse(), [all]);
  const entries = all.filter((e) => month === 'all' || monthKey(e.date) === month);
  const income = entries.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  const spend = -entries.filter((e) => e.amount < 0).reduce((a, e) => a + e.amount, 0);
  const shown = entries.filter((e) => (tab === 'sales' ? e.kind === 'sale' : tab === 'expenses' ? e.kind !== 'sale' : true));

  return (
    <>
      <div className="page-head">
        <h1>Sales & money</h1>
        <button className="btn" onClick={() => setOpen({ kind: 'expense' })}>− Add expense</button>
        <button className="btn primary" onClick={() => setOpen({ kind: 'sale' })}>+ Record sale</button>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
          <option value="all">All time</option>
        </select>
      </div>

      <div className="grid kpis">
        <Kpi label="Money in" value={money(income)} sub={`${entries.filter((e) => e.kind === 'sale').length} sales`} />
        <Kpi label="Money out" value={money(spend)} sub="Materials + expenses" />
        <Kpi label="Profit" value={money(income - spend)} tone={income - spend >= 0 ? 'pos' : 'neg'} />
      </div>

      <div className="card">
        <div className="card-head">
          <Tabs value={tab} onChange={setTab} options={[{ value: 'sales', label: 'Sales' }, { value: 'expenses', label: 'Spending' }, { value: 'ledger', label: 'All' }]} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>What</th><th>Details</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.kind + e.id} className="clickable" onClick={() => setOpen({ kind: e.kind, id: e.id })}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                  <td>{e.title}</td>
                  <td className="muted small">{e.detail}</td>
                  <td className={`num ${e.amount >= 0 ? 'pos' : ''}`}>{e.amount >= 0 ? '+' : '−'}{money(Math.abs(e.amount))}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={4} className="empty">Nothing recorded for this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open?.kind === 'sale' && <SaleModal sale={db.sales.find((s) => s.id === open.id)} onClose={() => setOpen(null)} />}
      {open?.kind === 'expense' && <ExpenseModal expense={db.expenses.find((s) => s.id === open.id)} onClose={() => setOpen(null)} />}
      {open?.kind === 'purchase' && <PurchaseModal purchase={db.purchases.find((s) => s.id === open.id)} onClose={() => setOpen(null)} />}
    </>
  );
}
