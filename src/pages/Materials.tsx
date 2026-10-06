import { useMemo, useState } from 'react';
import { newId, remove, save, useDB } from '../store';
import { MATERIAL_CATEGORIES, UNITS, type Material } from '../types';
import { fmtDate, Field, Modal, NumInput, n, StockBadge, Tabs } from '../components/ui';
import { AdjustModal, PurchaseModal } from '../components/forms';
import { live, materialStock, money, qtyFmt } from '../logic';

function MaterialModal({ material, onClose }: { material?: Material; onClose: () => void }) {
  const db = useDB();
  const [f, setF] = useState({
    name: material?.name ?? '',
    category: material?.category ?? 'Yarn',
    unit: material?.unit ?? 'g',
    unitCost: (material?.unitCost ?? '') as number | '',
    reorderLevel: (material?.reorderLevel ?? '') as number | '',
    color: material?.color ?? '',
    supplier: material?.supplier ?? '',
    notes: material?.notes ?? '',
    openingStock: '' as number | '',
  });
  const usedIn = material ? live(db.products).filter((p) => p.recipe.some((l) => l.materialId === material.id)) : [];

  const submit = () => {
    if (!f.name.trim()) return alert('Give the material a name.');
    const rec = save('materials', {
      id: material?.id ?? newId(), updatedAt: '', name: f.name.trim(), category: f.category, unit: f.unit,
      unitCost: n(f.unitCost), reorderLevel: n(f.reorderLevel), color: f.color || undefined,
      supplier: f.supplier || undefined, notes: f.notes || undefined,
    });
    if (!material && n(f.openingStock) > 0) {
      save('adjustments', { id: newId(), updatedAt: '', date: new Date().toISOString().slice(0, 10), kind: 'material', itemId: rec.id, delta: n(f.openingStock), reason: 'Opening stock' });
    }
    onClose();
  };

  return (
    <Modal
      title={material ? 'Edit material' : 'Add raw material'}
      onClose={onClose}
      footer={
        <>
          {material && (
            <button
              className="btn danger"
              onClick={() => {
                const msg = usedIn.length
                  ? `This material is used in: ${usedIn.map((p) => p.name).join(', ')}. Delete anyway? It will be removed from their costing.`
                  : 'Delete this material?';
                if (confirm(msg)) { remove('materials', material.id); onClose(); }
              }}
            >Delete</button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save</button>
        </>
      }
    >
      <div className="form">
        <Field label="Name" full><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Milk cotton yarn 8ply" autoFocus /></Field>
        <Field label="Category">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {MATERIAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Colour / variant"><input value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} placeholder="e.g. Baby pink" /></Field>
        <Field label="Unit you measure in" hint="Recipes use the same unit">
          <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label={`Cost per ${f.unit} (₹)`} hint="Updated automatically when you record a purchase">
          <NumInput value={f.unitCost} onChange={(v) => setF({ ...f, unitCost: v })} />
        </Field>
        <Field label={`Alert when stock ≤ (${f.unit})`} hint="0 = no alert"><NumInput value={f.reorderLevel} onChange={(v) => setF({ ...f, reorderLevel: v })} /></Field>
        {!material && <Field label={`Stock on hand now (${f.unit})`}><NumInput value={f.openingStock} onChange={(v) => setF({ ...f, openingStock: v })} /></Field>}
        <Field label="Supplier"><input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
        <Field label="Notes" full><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {usedIn.length > 0 && <p className="small muted">Used in: {usedIn.map((p) => p.name).join(', ')}</p>}
    </Modal>
  );
}

export default function Materials() {
  const db = useDB();
  const [tab, setTab] = useState<'stock' | 'purchases'>('stock');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState<Material | 'new' | null>(null);
  const [buy, setBuy] = useState<{ materialId?: string; purchaseId?: string } | null>(null);
  const [adjust, setAdjust] = useState<Material | null>(null);

  const stock = materialStock(db);
  const materials = useMemo(
    () =>
      live(db.materials)
        .filter((m) => (!cat || m.category === cat) && `${m.name} ${m.color ?? ''} ${m.supplier ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [db.materials, q, cat],
  );
  const purchases = live(db.purchases).sort((a, b) => b.date.localeCompare(a.date));
  const matName = (id: string) => {
    const m = db.materials.find((x) => x.id === id);
    return m ? `${m.name}${m.color ? ` (${m.color})` : ''}` : 'Deleted material';
  };
  const totalValue = live(db.materials).reduce((a, m) => a + Math.max(0, stock.get(m.id) ?? 0) * m.unitCost, 0);

  return (
    <>
      <div className="page-head">
        <h1>Raw materials</h1>
        <button className="btn" onClick={() => setBuy({})}>🛒 Record purchase</button>
        <button className="btn primary" onClick={() => setEdit('new')}>+ Add material</button>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} options={[{ value: 'stock', label: 'Stock' }, { value: 'purchases', label: 'Purchase history' }]} />
        <span className="spacer" />
        {tab === 'stock' && (
          <>
            <select className="search" value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 'auto' }}>
              <option value="">All categories</option>
              {MATERIAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </>
        )}
      </div>

      {tab === 'stock' ? (
        <div className="card">
          <div className="card-head">
            <h2>{materials.length} materials</h2>
            <span className="muted small">Stock value {money(totalValue)}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Material</th><th className="hide-sm">Category</th><th>In stock</th><th className="num">Cost / unit</th><th className="num">Value</th><th></th></tr>
              </thead>
              <tbody>
                {materials.map((m) => {
                  const s = stock.get(m.id) ?? 0;
                  return (
                    <tr key={m.id} className="clickable" onClick={() => setEdit(m)}>
                      <td><strong>{m.name}</strong>{m.color && <div className="muted small">{m.color}</div>}</td>
                      <td className="muted hide-sm">{m.category}</td>
                      <td><StockBadge stock={s} reorder={m.reorderLevel} unit={m.unit} /></td>
                      <td className="num">{money(m.unitCost)}<span className="muted small"> /{m.unit}</span></td>
                      <td className="num">{money(Math.max(0, s) * m.unitCost)}</td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="btn small" onClick={() => setBuy({ materialId: m.id })}>+ Buy</button>
                          <button className="btn small" onClick={() => setAdjust(m)}>Adjust</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!materials.length && (
                  <tr><td colSpan={6} className="empty">{q || cat ? 'No matches.' : 'No materials yet. Add your yarn, safety eyes, stuffing and packaging.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Material</th><th className="num">Qty</th><th className="num">Paid</th><th>Supplier</th></tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => setBuy({ purchaseId: p.id })}>
                    <td>{fmtDate(p.date)}</td>
                    <td>{matName(p.materialId)}</td>
                    <td className="num">{qtyFmt(p.qty)} {db.materials.find((m) => m.id === p.materialId)?.unit}</td>
                    <td className="num">{money(p.totalCost)}</td>
                    <td className="muted">{p.supplier}</td>
                  </tr>
                ))}
                {!purchases.length && <tr><td colSpan={5} className="empty">No purchases recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {edit && <MaterialModal material={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {buy && (
        <PurchaseModal
          materialId={buy.materialId}
          purchase={buy.purchaseId ? db.purchases.find((p) => p.id === buy.purchaseId) : undefined}
          onClose={() => setBuy(null)}
        />
      )}
      {adjust && <AdjustModal kind="material" item={adjust} onClose={() => setAdjust(null)} />}
    </>
  );
}
