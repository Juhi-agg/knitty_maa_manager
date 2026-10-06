import { useMemo, useState } from 'react';
import { useDB } from '../store';
import { download, Kpi } from '../components/ui';
import { GroupedBars, HBars } from '../components/charts';
import {
  costProduct, getSettings, inventoryValue, lastNMonths, live, money0, monthKey, monthlySummary, monthLabel, qtyFmt, saleTotal, toCSV, today,
} from '../logic';

export default function Reports() {
  const db = useDB();
  const [range, setRange] = useState(12);
  const months = lastNMonths(range);
  const inRange = (d: string) => monthKey(d) >= months[0] && monthKey(d) <= months[months.length - 1];
  const summary = useMemo(() => monthlySummary(db), [db]);
  const rows = months.map((m) => summary.get(m) ?? { month: m, income: 0, materialSpend: 0, otherExpenses: 0, expenses: 0, profit: 0, unitsSold: 0 });
  const tot = rows.reduce(
    (a, r) => ({ income: a.income + r.income, expenses: a.expenses + r.expenses, profit: a.profit + r.profit, units: a.units + r.unitsSold }),
    { income: 0, expenses: 0, profit: 0, units: 0 },
  );
  const settings = getSettings(db);
  const inv = inventoryValue(db);

  const spendByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of live(db.purchases)) if (inRange(p.date)) {
      const cat = db.materials.find((x) => x.id === p.materialId)?.category ?? 'Materials';
      m.set(`Materials: ${cat}`, (m.get(`Materials: ${cat}`) ?? 0) + p.totalCost);
    }
    for (const e of live(db.expenses)) if (inRange(e.date)) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [db, range]);

  const productPerf = useMemo(() => {
    const mats = live(db.materials);
    const m = new Map<string, { label: string; revenue: number; units: number; profit: number }>();
    for (const s of live(db.sales)) if (inRange(s.date)) {
      const p = db.products.find((x) => x.id === s.productId);
      const key = p?.id ?? `custom:${s.description ?? 'Custom'}`;
      const row = m.get(key) ?? { label: p?.name ?? `${s.description ?? 'Custom item'} (custom)`, revenue: 0, units: 0, profit: 0 };
      const rev = s.qty * s.unitPrice - (s.discount || 0);
      row.revenue += rev;
      row.units += s.qty;
      row.profit += p ? rev - s.qty * costProduct(p, mats, settings).total : 0;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [db, range]);

  const channels = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of live(db.sales)) if (inRange(s.date)) m.set(s.channel, (m.get(s.channel) ?? 0) + saleTotal(s));
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [db, range]);

  const exportCSV = (what: string) => {
    const pname = (id?: string) => db.products.find((p) => p.id === id)?.name ?? '';
    const mname = (id: string) => db.materials.find((m) => m.id === id)?.name ?? '';
    const data: Record<string, Record<string, unknown>[]> = {
      monthly: rows.map((r) => ({ month: r.month, income: r.income, material_spend: r.materialSpend, other_expenses: r.otherExpenses, profit: r.profit, units_sold: r.unitsSold })),
      sales: live(db.sales).map((s) => ({ date: s.date, product: pname(s.productId) || s.description, qty: s.qty, unit_price: s.unitPrice, shipping: s.shippingCharged, discount: s.discount, total: saleTotal(s), customer: s.customer, channel: s.channel, notes: s.notes })),
      expenses: [
        ...live(db.purchases).map((p) => ({ date: p.date, type: 'Material purchase', category: db.materials.find((m) => m.id === p.materialId)?.category, description: `${mname(p.materialId)} × ${p.qty}`, amount: p.totalCost, supplier: p.supplier })),
        ...live(db.expenses).map((e) => ({ date: e.date, type: 'Expense', category: e.category, description: e.description, amount: e.amount, supplier: '' })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    };
    download(`knitty-maa-${what}-${today()}.csv`, toCSV(data[what]));
  };

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <select value={range} onChange={(e) => setRange(Number(e.target.value))} style={{ width: 'auto' }}>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
      </div>

      <div className="grid kpis">
        <Kpi label="Income" value={money0(tot.income)} sub={`${qtyFmt(tot.units)} pieces sold`} />
        <Kpi label="Spending" value={money0(tot.expenses)} />
        <Kpi label="Profit" value={money0(tot.profit)} tone={tot.profit >= 0 ? 'pos' : 'neg'} sub={tot.income ? `${((tot.profit / tot.income) * 100).toFixed(0)}% of income` : undefined} />
        <Kpi label="Stock on hand" value={money0(inv.materials + inv.products)} sub={`Materials ${money0(inv.materials)} · finished ${money0(inv.products)}`} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Money in vs out</h2>
          <button className="btn small" onClick={() => exportCSV('monthly')}>⬇ CSV</button>
        </div>
        <GroupedBars
          labels={months.map((m) => monthLabel(m))}
          series={[
            { name: 'Income', color: 'var(--series-1)', values: rows.map((r) => r.income) },
            { name: 'Spending', color: 'var(--series-2)', values: rows.map((r) => r.expenses) },
          ]}
        />
        <details style={{ marginTop: 10 }}>
          <summary className="small muted" style={{ cursor: 'pointer' }}>Show as table</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th><th className="num">Income</th><th className="num">Materials</th><th className="num">Other</th><th className="num">Profit</th><th className="num">Sold</th></tr></thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.month}>
                    <td>{monthLabel(r.month, true)}</td>
                    <td className="num">{money0(r.income)}</td>
                    <td className="num">{money0(r.materialSpend)}</td>
                    <td className="num">{money0(r.otherExpenses)}</td>
                    <td className={`num ${r.profit < 0 ? 'neg' : ''}`}>{money0(r.profit)}</td>
                    <td className="num">{qtyFmt(r.unitsSold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head"><h2>Best sellers</h2><button className="btn small" onClick={() => exportCSV('sales')}>⬇ Sales CSV</button></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th className="num">Sold</th><th className="num">Revenue</th><th className="num" title="Revenue minus materials and your time">Profit</th></tr></thead>
              <tbody>
                {productPerf.slice(0, 10).map((p) => (
                  <tr key={p.label}>
                    <td>{p.label}</td>
                    <td className="num">{qtyFmt(p.units)}</td>
                    <td className="num">{money0(p.revenue)}</td>
                    <td className={`num ${p.profit < 0 ? 'neg' : ''}`}>{p.label.endsWith('(custom)') ? '—' : money0(p.profit)}</td>
                  </tr>
                ))}
                {!productPerf.length && <tr><td colSpan={4} className="empty">No sales in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Where the money goes</h2><button className="btn small" onClick={() => exportCSV('expenses')}>⬇ Spending CSV</button></div>
          <HBars rows={spendByCat} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Sales by channel</h2></div>
          <HBars rows={channels} />
        </div>
      </div>
    </>
  );
}
