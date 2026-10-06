import { useState } from 'react';
import { useDB } from '../store';
import { useSync } from '../sync';
import { Kpi, StockBadge } from '../components/ui';
import { ExpenseModal, ProduceModal, PurchaseModal, SaleModal } from '../components/forms';
import { GroupedBars } from '../components/charts';
import { getSettings, inventoryValue, lastNMonths, live, lowStock, money0, monthKey, monthlySummary, monthLabel, today } from '../logic';
import type { Page } from '../App';

export default function Dashboard({ go }: { go: (p: Page) => void }) {
  const db = useDB();
  const sync = useSync();
  const settings = getSettings(db);
  const [modal, setModal] = useState<'sale' | 'make' | 'buy' | 'expense' | null>(null);

  const summary = monthlySummary(db);
  const thisMonth = monthKey(today());
  const cur = summary.get(thisMonth);
  const months = lastNMonths(6);
  const prev = summary.get(months[months.length - 2]);
  const inv = inventoryValue(db);
  const low = lowStock(db);
  const isEmpty = !live(db.materials).length && !live(db.products).length;

  return (
    <>
      <div className="page-head">
        <h1>Hello, {settings.businessName} 🧶</h1>
      </div>

      {isEmpty && (
        <div className="banner">
          <p><strong>Getting started:</strong> 1) add your raw materials with the stock you have, 2) add products and list the materials each one uses, 3) record finished pieces and sales as they happen.</p>
          <button className="btn primary" onClick={() => go('materials')}>Add materials</button>
        </div>
      )}
      {!sync.configured && !isEmpty && (
        <div className="banner">
          <p>Your data is only saved on this device. Turn on cloud sync so it's backed up and available on your phone and laptop.</p>
          <button className="btn" onClick={() => go('settings')}>Set up sync</button>
        </div>
      )}

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn primary" onClick={() => setModal('sale')}>+ Sale</button>
        <button className="btn" onClick={() => setModal('make')}>🧶 Finished items</button>
        <button className="btn" onClick={() => setModal('buy')}>🛒 Bought materials</button>
        <button className="btn" onClick={() => setModal('expense')}>− Expense</button>
      </div>

      <div className="grid kpis">
        <Kpi label={`Sales · ${monthLabel(thisMonth, true)}`} value={money0(cur?.income ?? 0)} sub={prev ? `Last month ${money0(prev.income)}` : `${cur?.unitsSold ?? 0} pieces`} />
        <Kpi label="Spent this month" value={money0(cur?.expenses ?? 0)} sub={`Materials ${money0(cur?.materialSpend ?? 0)}`} />
        <Kpi label="Profit this month" value={money0(cur?.profit ?? 0)} tone={(cur?.profit ?? 0) >= 0 ? 'pos' : 'neg'} />
        <Kpi label="Finished stock" value={money0(inv.retail)} sub={`at selling price · cost ${money0(inv.products)}`} />
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head">
            <h2>Needs attention</h2>
            {(low.materials.length + low.products.length > 0) && <span className="badge bad">{low.materials.length + low.products.length}</span>}
          </div>
          {low.materials.length + low.products.length === 0 ? (
            <p className="muted small">✓ Everything is above its alert level.</p>
          ) : (
            <ul className="alert-list">
              {low.materials.map(({ item, stock }) => (
                <li key={item.id}>
                  <span>🧵</span>
                  <span style={{ flex: 1 }}>{item.name}{item.color ? ` (${item.color})` : ''}<div className="muted small">Reorder at {item.reorderLevel} {item.unit}{item.supplier ? ` · ${item.supplier}` : ''}</div></span>
                  <StockBadge stock={stock} reorder={item.reorderLevel} unit={item.unit} />
                </li>
              ))}
              {low.products.map(({ item, stock }) => (
                <li key={item.id}>
                  <span>🧸</span>
                  <span style={{ flex: 1 }}>{item.name}<div className="muted small">Make more · alert at {item.reorderLevel}</div></span>
                  <StockBadge stock={stock} reorder={item.reorderLevel} unit="pcs" />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Last 6 months</h2>
            <button className="btn small ghost" onClick={() => go('reports')}>Reports →</button>
          </div>
          <GroupedBars
            height={200}
            labels={months.map((m) => monthLabel(m))}
            series={[
              { name: 'Income', color: 'var(--series-1)', values: months.map((m) => summary.get(m)?.income ?? 0) },
              { name: 'Spending', color: 'var(--series-2)', values: months.map((m) => summary.get(m)?.expenses ?? 0) },
            ]}
          />
        </div>
      </div>

      {modal === 'sale' && <SaleModal onClose={() => setModal(null)} />}
      {modal === 'make' && <ProduceModal onClose={() => setModal(null)} />}
      {modal === 'buy' && <PurchaseModal onClose={() => setModal(null)} />}
      {modal === 'expense' && <ExpenseModal onClose={() => setModal(null)} />}
    </>
  );
}
