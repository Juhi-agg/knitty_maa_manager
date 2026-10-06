import { useMemo, useState } from 'react';
import { newId, remove, save, useDB } from '../store';
import type { Product, RecipeLine } from '../types';
import { fmtDate, Field, Modal, NumInput, n, resizeImage, StockBadge, Tabs } from '../components/ui';
import { AdjustModal, ProduceModal, SaleModal } from '../components/forms';
import { costProduct, getSettings, live, money, productStock, qtyFmt } from '../logic';

const CATEGORY_SUGGESTIONS = ['Amigurumi', 'Keychains', 'Bags', 'Wearables', 'Home decor', 'Baby', 'Accessories', 'Flowers', 'Gift sets'];

function ProductModal({ product, onClose }: { product?: Product; onClose: () => void }) {
  const db = useDB();
  const settings = getSettings(db);
  const materials = live(db.materials).sort((a, b) => a.name.localeCompare(b.name));
  const [f, setF] = useState({
    name: product?.name ?? '',
    category: product?.category ?? '',
    sku: product?.sku ?? '',
    price: (product?.price ?? '') as number | '',
    labourHours: (product?.labourHours ?? '') as number | '',
    reorderLevel: (product?.reorderLevel ?? '') as number | '',
    description: product?.description ?? '',
    photo: product?.photo,
    active: product?.active ?? true,
  });
  const [recipe, setRecipe] = useState<(Omit<RecipeLine, 'qty'> & { qty: number | '' })[]>(product?.recipe ?? []);
  const cleanRecipe = recipe.filter((l) => l.materialId && n(l.qty) > 0).map((l) => ({ materialId: l.materialId, qty: n(l.qty) }));
  const cost = costProduct({ recipe: cleanRecipe, labourHours: n(f.labourHours), price: n(f.price) }, materials, settings);
  const categories = [...new Set([...CATEGORY_SUGGESTIONS, ...live(db.products).map((p) => p.category).filter(Boolean)])];

  const submit = () => {
    if (!f.name.trim()) return alert('Give the product a name.');
    save('products', {
      id: product?.id ?? newId(), updatedAt: '', name: f.name.trim(), category: f.category.trim(), sku: f.sku || undefined,
      price: n(f.price), labourHours: n(f.labourHours), recipe: cleanRecipe, reorderLevel: n(f.reorderLevel),
      description: f.description || undefined, photo: f.photo, active: f.active,
    });
    onClose();
  };

  return (
    <Modal
      wide
      title={product ? 'Edit product' : 'New product'}
      onClose={onClose}
      footer={
        <>
          {product && (
            <button className="btn danger" onClick={() => confirm('Delete this product? Its sales history stays in your finances.') && (remove('products', product.id), onClose())}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save</button>
        </>
      }
    >
      <div className="form">
        <div className="full row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          {f.photo ? <img className="thumb" src={f.photo} alt="" /> : <div className="thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🧶</div>}
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <Field label="Product name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Bunny amigurumi (small)" autoFocus={!product} /></Field>
            <div className="row">
              <label className="btn small">
                📷 {f.photo ? 'Change photo' : 'Add photo'}
                <input
                  type="file" accept="image/*" hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setF({ ...f, photo: await resizeImage(file) });
                  }}
                />
              </label>
              {f.photo && <button className="btn small ghost" onClick={() => setF({ ...f, photo: undefined })}>Remove</button>}
            </div>
          </div>
        </div>
        <Field label="Category">
          <input list="cat-list" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <datalist id="cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Code / SKU (optional)"><input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Field>
        <Field label="Selling price (₹)"><NumInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
        <Field label="Hours to make one" hint={`Labour charged at ${money(settings.hourlyRate)}/hr (Settings)`}>
          <NumInput value={f.labourHours} onChange={(v) => setF({ ...f, labourHours: v })} />
        </Field>
        <Field label="Alert when finished stock ≤" hint="0 = made to order, no alert"><NumInput value={f.reorderLevel} step="1" onChange={(v) => setF({ ...f, reorderLevel: v })} /></Field>
        <label className="row small" style={{ alignSelf: 'end', paddingBottom: 10 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          Currently selling (uncheck to archive)
        </label>
        <Field label="Description" full><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Size, colours, care instructions…" /></Field>
      </div>

      <h3 style={{ margin: '18px 0 8px' }}>Materials for ONE piece</h3>
      {!materials.length && <p className="small muted">Add raw materials first to build a recipe.</p>}
      {recipe.map((l, i) => {
        const m = materials.find((x) => x.id === l.materialId);
        return (
          <div className="recipe-line" key={i}>
            <select value={l.materialId} onChange={(e) => setRecipe(recipe.map((r, j) => (j === i ? { ...r, materialId: e.target.value } : r)))}>
              <option value="">Choose material…</option>
              {materials.map((mm) => <option key={mm.id} value={mm.id}>{mm.name}{mm.color ? ` (${mm.color})` : ''} — {money(mm.unitCost)}/{mm.unit}</option>)}
            </select>
            <div style={{ position: 'relative' }}>
              <NumInput value={l.qty} placeholder={m?.unit ?? 'qty'} onChange={(v) => setRecipe(recipe.map((r, j) => (j === i ? { ...r, qty: v } : r)))} />
            </div>
            <span className="num small muted rl-cost">{m ? `${m.unit} · ${money(m.unitCost * n(l.qty))}` : ''}</span>
            <button className="btn small ghost" aria-label="Remove line" onClick={() => setRecipe(recipe.filter((_, j) => j !== i))}>✕</button>
          </div>
        );
      })}
      {materials.length > 0 && <button className="btn small" onClick={() => setRecipe([...recipe, { materialId: '', qty: '' }])}>+ Add material</button>}

      <div className="cost-box" style={{ marginTop: 16 }}>
        <div className="line"><span>Materials</span><span>{money(cost.materials)}</span></div>
        <div className="line"><span>Small consumables ({settings.overheadPercent}%)</span><span>{money(cost.overhead)}</span></div>
        <div className="line"><span>Your time ({qtyFmt(n(f.labourHours))} hr × {money(settings.hourlyRate)})</span><span>{money(cost.labour)}</span></div>
        <div className="line total"><span>Total cost per piece</span><span>{money(cost.total)}</span></div>
        <div className="line"><span>Profit at {money(n(f.price))}</span><span className={cost.profit >= 0 ? 'pos' : 'neg'}>{money(cost.profit)} ({cost.marginPercent.toFixed(0)}%)</span></div>
        <div className="line">
          <span>Suggested price for {settings.targetMarginPercent}% margin</span>
          <span>
            {money(cost.suggestedPrice)}{' '}
            {cost.suggestedPrice > 0 && n(f.price) !== cost.suggestedPrice && (
              <button className="btn small ghost" onClick={() => setF({ ...f, price: cost.suggestedPrice })}>Use</button>
            )}
          </span>
        </div>
      </div>
    </Modal>
  );
}

export default function Catalogue() {
  const db = useDB();
  const settings = getSettings(db);
  const [tab, setTab] = useState<'products' | 'batches'>('products');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const [make, setMake] = useState<{ productId?: string; productionId?: string } | null>(null);
  const [sell, setSell] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Product | null>(null);

  const stock = productStock(db);
  const mats = live(db.materials);
  const products = useMemo(
    () =>
      live(db.products)
        .filter((p) => (showArchived || p.active) && `${p.name} ${p.category} ${p.sku ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [db.products, q, showArchived],
  );
  const batches = live(db.productions).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <div className="page-head">
        <h1>Catalogue</h1>
        <button className="btn" onClick={() => setMake({})}>🧶 Record finished items</button>
        <button className="btn primary" onClick={() => setEdit('new')}>+ New product</button>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} options={[{ value: 'products', label: 'Products' }, { value: 'batches', label: 'Production log' }]} />
        <span className="spacer" />
        {tab === 'products' && (
          <>
            <label className="row small muted"><input type="checkbox" style={{ width: 'auto' }} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label>
            <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </>
        )}
      </div>

      {tab === 'products' ? (
        products.length ? (
          <div className="product-grid">
            {products.map((p) => {
              const c = costProduct(p, mats, settings);
              const s = stock.get(p.id) ?? 0;
              return (
                <div className="product-card" key={p.id} onClick={() => setEdit(p)}>
                  <div className="photo">{p.photo ? <img src={p.photo} alt="" /> : '🧸'}</div>
                  <div className="body">
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <span className="title" style={{ flex: 1 }}>{p.name}</span>
                      {!p.active && <span className="badge">Archived</span>}
                    </div>
                    <div className="muted small">{p.category || 'Uncategorised'}</div>
                    <div className="row small">
                      <strong style={{ fontSize: 16 }}>{money(p.price)}</strong>
                      <span className="spacer" />
                      <span className={c.marginPercent >= settings.targetMarginPercent ? 'pos' : c.profit < 0 ? 'neg' : ''} title="Profit per piece after materials and your time">
                        {c.profit >= 0 ? '+' : ''}{money(c.profit)} · {c.marginPercent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="muted small">Cost {money(c.total)} (materials {money(c.materials + c.overhead)})</div>
                    <div className="row" onClick={(e) => e.stopPropagation()}>
                      <StockBadge stock={s} reorder={p.reorderLevel} unit="in stock" />
                      <span className="spacer" />
                      <button className="btn small" onClick={() => setMake({ productId: p.id })} title="Record pieces made">+ Make</button>
                      <button className="btn small" onClick={() => setSell(p.id)}>Sell</button>
                      <button className="btn small ghost" onClick={() => setAdjust(p)} title="Adjust stock">⋯</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card empty">{q ? 'No matches.' : 'Your catalogue is empty. Add your first product, then list the materials it uses to see its true cost.'}</div>
        )
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Product</th><th className="num">Made</th><th className="num">Material cost</th><th>Notes</th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => setMake({ productionId: b.id })}>
                    <td>{fmtDate(b.date)}</td>
                    <td>{db.products.find((p) => p.id === b.productId)?.name ?? 'Deleted product'}</td>
                    <td className="num">{b.qty}</td>
                    <td className="num">{money(b.consumed.reduce((a, c) => a + c.qty * c.unitCost, 0))}</td>
                    <td className="muted">{b.notes}</td>
                  </tr>
                ))}
                {!batches.length && <tr><td colSpan={5} className="empty">No batches recorded yet. Use “Record finished items” when you finish pieces.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {edit && <ProductModal product={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {make && (
        <ProduceModal
          productId={make.productId}
          production={make.productionId ? db.productions.find((p) => p.id === make.productionId) : undefined}
          onClose={() => setMake(null)}
        />
      )}
      {sell && <SaleModal productId={sell} onClose={() => setSell(null)} />}
      {adjust && <AdjustModal kind="product" item={adjust} onClose={() => setAdjust(null)} />}
    </>
  );
}
