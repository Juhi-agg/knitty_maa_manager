import { useMemo, useState } from 'react';
import { getDB, newId, remove, save, useDB } from '../store';
import {
  CHANNELS, EXPENSE_CATEGORIES,
  type Adjustment, type Expense, type Material, type Product, type Production, type Purchase, type Sale,
} from '../types';
import { live, materialStock, money, productStock, qtyFmt, saleTotal, shortages, today } from '../logic';
import { Field, Modal, NumInput, n } from './ui';

const stamp = { updatedAt: '' };

function DeleteBtn({ onDelete, what }: { onDelete: () => void; what: string }) {
  return (
    <button className="btn danger" onClick={() => confirm(`Delete this ${what}? Stock and totals will be recalculated.`) && onDelete()}>
      Delete
    </button>
  );
}

// ---------- Material purchase ----------

export function PurchaseModal({ purchase, materialId, onClose }: { purchase?: Purchase; materialId?: string; onClose: () => void }) {
  const db = useDB();
  const materials = live(db.materials);
  const [f, setF] = useState({
    date: purchase?.date ?? today(),
    materialId: purchase?.materialId ?? materialId ?? materials[0]?.id ?? '',
    qty: (purchase?.qty ?? '') as number | '',
    totalCost: (purchase?.totalCost ?? '') as number | '',
    supplier: purchase?.supplier ?? materials.find((m) => m.id === (materialId ?? ''))?.supplier ?? '',
    notes: purchase?.notes ?? '',
    updatePrice: true,
  });
  const mat = materials.find((m) => m.id === f.materialId);
  const unitPrice = n(f.qty) > 0 ? n(f.totalCost) / n(f.qty) : 0;

  const submit = () => {
    if (!mat || n(f.qty) <= 0) return alert('Pick a material and enter a quantity.');
    save('purchases', {
      ...stamp, id: purchase?.id ?? newId(), date: f.date, materialId: f.materialId, qty: n(f.qty),
      totalCost: n(f.totalCost), supplier: f.supplier || undefined, notes: f.notes || undefined,
    });
    if (f.updatePrice && unitPrice > 0) save('materials', { ...mat, unitCost: unitPrice, supplier: f.supplier || mat.supplier });
    onClose();
  };

  if (!materials.length) {
    return (
      <Modal title="Record purchase" onClose={onClose}>
        <p>Add a raw material first (Materials → Add material).</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={purchase ? 'Edit purchase' : 'Record material purchase'}
      onClose={onClose}
      footer={
        <>
          {purchase && <DeleteBtn what="purchase" onDelete={() => { remove('purchases', purchase.id); onClose(); }} />}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save</button>
        </>
      }
    >
      <div className="form">
        <Field label="Material" full>
          <select value={f.materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}{m.color ? ` (${m.color})` : ''}</option>)}
          </select>
        </Field>
        <Field label={`Quantity${mat ? ` (${mat.unit})` : ''}`}>
          <NumInput value={f.qty} onChange={(v) => setF({ ...f, qty: v })} autoFocus />
        </Field>
        <Field label="Total paid (₹)" hint={unitPrice ? `${money(unitPrice)} per ${mat?.unit}` : 'Include delivery charges'}>
          <NumInput value={f.totalCost} onChange={(v) => setF({ ...f, totalCost: v })} />
        </Field>
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Supplier"><input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
        <Field label="Notes" full><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <label className="row full small">
          <input type="checkbox" style={{ width: 'auto' }} checked={f.updatePrice} onChange={(e) => setF({ ...f, updatePrice: e.target.checked })} />
          Use this price as the material's current cost (updates product costing)
        </label>
      </div>
    </Modal>
  );
}

// ---------- Stock adjustment ----------

export function AdjustModal({ kind, item, onClose }: { kind: 'material' | 'product'; item: Material | Product; onClose: () => void }) {
  const db = useDB();
  const current = (kind === 'material' ? materialStock(db) : productStock(db)).get(item.id) ?? 0;
  const [mode, setMode] = useState<'set' | 'change'>('set');
  const [val, setVal] = useState<number | ''>('');
  const [reason, setReason] = useState('Stock count');
  const unit = kind === 'material' ? (item as Material).unit : 'pcs';
  const delta = mode === 'set' ? n(val) - current : n(val);

  const submit = () => {
    if (val === '' || delta === 0) return onClose();
    const adj: Adjustment = { ...stamp, id: newId(), date: today(), kind, itemId: item.id, delta, reason };
    save('adjustments', adj);
    onClose();
  };

  return (
    <Modal
      title={`Adjust stock · ${item.name}`}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Save</button></>}
    >
      <p className="muted small" style={{ marginTop: 0 }}>Currently {qtyFmt(current)} {unit}. Use this for opening stock, counts, damaged or gifted items.</p>
      <div className="form">
        <Field label="How">
          <select value={mode} onChange={(e) => setMode(e.target.value as 'set' | 'change')}>
            <option value="set">Set stock to (counted)</option>
            <option value="change">Add / remove (+ / −)</option>
          </select>
        </Field>
        <Field label={mode === 'set' ? `New stock (${unit})` : `Change (${unit}), negative to remove`}>
          <NumInput value={val} min={mode === 'set' ? 0 : -1e9} onChange={setVal} autoFocus />
        </Field>
        <Field label="Reason" full>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {['Stock count', 'Opening stock', 'Damaged / wasted', 'Gift / sample', 'Personal use', 'Other'].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
      </div>
      {val !== '' && <p className="small">Change: <strong>{delta > 0 ? '+' : ''}{qtyFmt(delta)} {unit}</strong> → {qtyFmt(current + delta)} {unit}</p>}
    </Modal>
  );
}

// ---------- Production (make a batch) ----------

export function ProduceModal({ production, productId, onClose }: { production?: Production; productId?: string; onClose: () => void }) {
  const db = useDB();
  const products = live(db.products).filter((p) => p.active || p.id === production?.productId);
  const [pid, setPid] = useState(production?.productId ?? productId ?? products[0]?.id ?? '');
  const [qty, setQty] = useState<number | ''>(production?.qty ?? 1);
  const [date, setDate] = useState(production?.date ?? today());
  const [notes, setNotes] = useState(production?.notes ?? '');
  const product = products.find((p) => p.id === pid);

  // When editing, exclude this batch's own consumption from the availability check.
  const short = useMemo(() => {
    if (!product) return [];
    const view = production ? { ...db, productions: db.productions.filter((p) => p.id !== production.id) } : db;
    return shortages(product, n(qty), view);
  }, [product, qty, db, production]);

  const submit = () => {
    if (!product || n(qty) <= 0) return alert('Pick a product and quantity.');
    if (short.length && !confirm('Some materials are short. Save anyway? Stock will go negative — fix it by recording the purchase.')) return;
    const mats = new Map(getDB().materials.map((m) => [m.id, m]));
    save('productions', {
      ...stamp, id: production?.id ?? newId(), date, productId: pid, qty: n(qty), notes: notes || undefined,
      consumed: product.recipe.map((l) => ({ materialId: l.materialId, qty: l.qty * n(qty), unitCost: mats.get(l.materialId)?.unitCost ?? 0 })),
    });
    onClose();
  };

  if (!products.length) return <Modal title="Make a batch" onClose={onClose}><p>Add a product to your catalogue first.</p></Modal>;

  return (
    <Modal
      title={production ? 'Edit batch' : 'Record finished items'}
      onClose={onClose}
      footer={
        <>
          {production && <DeleteBtn what="batch" onDelete={() => { remove('productions', production.id); onClose(); }} />}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save</button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>Adds finished pieces to inventory and uses up the materials in the product's recipe.</p>
      <div className="form">
        <Field label="Product" full>
          <select value={pid} onChange={(e) => setPid(e.target.value)}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="How many made"><NumInput value={qty} onChange={setQty} step="1" autoFocus /></Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Notes" full><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {product && product.recipe.length > 0 && (
        <div className="cost-box" style={{ marginTop: 14 }}>
          <strong>Materials used</strong>
          {product.recipe.map((l) => {
            const m = db.materials.find((x) => x.id === l.materialId);
            const s = short.find((x) => x.material?.id === l.materialId);
            return (
              <div className="line" key={l.materialId}>
                <span>{m?.name ?? 'Unknown material'}</span>
                <span className={s ? 'neg' : ''}>{qtyFmt(l.qty * n(qty))} {m?.unit}{s ? ` (have ${qtyFmt(s.have)})` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
      {product && !product.recipe.length && <p className="small muted">This product has no recipe, so no materials will be deducted.</p>}
    </Modal>
  );
}

// ---------- Sale ----------

export function SaleModal({ sale, productId, onClose }: { sale?: Sale; productId?: string; onClose: () => void }) {
  const db = useDB();
  const products = live(db.products);
  const stock = productStock(db);
  const first = products.find((p) => p.id === productId);
  const [f, setF] = useState({
    date: sale?.date ?? today(),
    productId: sale?.productId ?? productId ?? '',
    description: sale?.description ?? '',
    qty: (sale?.qty ?? 1) as number | '',
    unitPrice: (sale?.unitPrice ?? first?.price ?? '') as number | '',
    shippingCharged: (sale?.shippingCharged ?? '') as number | '',
    discount: (sale?.discount ?? '') as number | '',
    customer: sale?.customer ?? '',
    channel: sale?.channel ?? 'Instagram',
    notes: sale?.notes ?? '',
  });
  const prod = products.find((p) => p.id === f.productId);
  const available = (stock.get(f.productId) ?? 0) + (sale && sale.productId === f.productId ? sale.qty : 0);
  const total = saleTotal({ qty: n(f.qty), unitPrice: n(f.unitPrice), shippingCharged: n(f.shippingCharged), discount: n(f.discount) });

  const submit = () => {
    if (!f.productId && !f.description.trim()) return alert('Pick a product or describe the custom item.');
    if (n(f.qty) <= 0) return alert('Enter a quantity.');
    save('sales', {
      ...stamp, id: sale?.id ?? newId(), date: f.date, productId: f.productId || undefined,
      description: f.description || undefined, qty: n(f.qty), unitPrice: n(f.unitPrice),
      shippingCharged: n(f.shippingCharged), discount: n(f.discount), customer: f.customer || undefined,
      channel: f.channel, notes: f.notes || undefined,
    });
    onClose();
  };

  return (
    <Modal
      title={sale ? 'Edit sale' : 'Record sale'}
      onClose={onClose}
      footer={
        <>
          {sale && <DeleteBtn what="sale" onDelete={() => { remove('sales', sale.id); onClose(); }} />}
          <span className="spacer" />
          <strong style={{ marginRight: 8 }}>Total {money(total)}</strong>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save</button>
        </>
      }
    >
      <div className="form">
        <Field label="Product" full hint={prod ? `${qtyFmt(available)} in stock` : 'Leave as "Custom item" for one-off commissions'}>
          <select
            value={f.productId}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              setF({ ...f, productId: e.target.value, unitPrice: p ? p.price : f.unitPrice });
            }}
          >
            <option value="">Custom item (not in catalogue)</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {qtyFmt(stock.get(p.id) ?? 0)} in stock</option>)}
          </select>
        </Field>
        {!f.productId && (
          <Field label="Item description" full>
            <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Custom bunny keychain" />
          </Field>
        )}
        <Field label="Quantity"><NumInput value={f.qty} step="1" onChange={(v) => setF({ ...f, qty: v })} /></Field>
        <Field label="Price per piece (₹)"><NumInput value={f.unitPrice} onChange={(v) => setF({ ...f, unitPrice: v })} /></Field>
        <Field label="Shipping charged (₹)"><NumInput value={f.shippingCharged} onChange={(v) => setF({ ...f, shippingCharged: v })} /></Field>
        <Field label="Discount (₹)"><NumInput value={f.discount} onChange={(v) => setF({ ...f, discount: v })} /></Field>
        <Field label="Customer"><input value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} placeholder="Name or @handle" /></Field>
        <Field label="Channel">
          <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
            {CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {prod && n(f.qty) > available && (
        <p className="small" style={{ color: 'var(--warn)' }}>
          ⚠ Only {qtyFmt(available)} in stock. If you made more, record the batch under Catalogue → Make so materials are deducted.
        </p>
      )}
    </Modal>
  );
}

// ---------- Other expense ----------

export function ExpenseModal({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const [f, setF] = useState({
    date: expense?.date ?? today(),
    category: expense?.category ?? 'Shipping',
    amount: (expense?.amount ?? '') as number | '',
    description: expense?.description ?? '',
  });
  const submit = () => {
    if (n(f.amount) <= 0) return alert('Enter an amount.');
    save('expenses', { ...stamp, id: expense?.id ?? newId(), date: f.date, category: f.category, amount: n(f.amount), description: f.description });
    onClose();
  };
  return (
    <Modal
      title={expense ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      footer={
        <>
          {expense && <DeleteBtn what="expense" onDelete={() => { remove('expenses', expense.id); onClose(); }} />}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save</button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>For yarn and other raw materials, use “Record purchase” instead so stock goes up too.</p>
      <div className="form">
        <Field label="Amount (₹)"><NumInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} autoFocus /></Field>
        <Field label="Category">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. India Post, 3 parcels" /></Field>
      </div>
    </Modal>
  );
}
