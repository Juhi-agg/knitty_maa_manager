import type { DB, Material, Product, Settings, RecipeLine } from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  updatedAt: new Date(0).toISOString(),
  businessName: 'Knitty Maa',
  hourlyRate: 100,
  overheadPercent: 5,
  targetMarginPercent: 40,
};

export const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

export function getSettings(db: DB): Settings {
  return live(db.settings)[0] ?? DEFAULT_SETTINGS;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = (n: number) => inr.format(n || 0);
export const money0 = (n: number) => inr0.format(n || 0);
export const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const monthKey = (date: string) => date.slice(0, 7);

// ---------- Stock (derived from the ledger, never stored) ----------

export function materialStock(db: DB): Map<string, number> {
  const s = new Map<string, number>();
  const add = (id: string, n: number) => s.set(id, (s.get(id) ?? 0) + n);
  for (const p of live(db.purchases)) add(p.materialId, p.qty);
  for (const pr of live(db.productions)) for (const c of pr.consumed) add(c.materialId, -c.qty);
  for (const a of live(db.adjustments)) if (a.kind === 'material') add(a.itemId, a.delta);
  return s;
}

export function productStock(db: DB): Map<string, number> {
  const s = new Map<string, number>();
  const add = (id: string, n: number) => s.set(id, (s.get(id) ?? 0) + n);
  for (const pr of live(db.productions)) add(pr.productId, pr.qty);
  for (const sale of live(db.sales)) if (sale.productId) add(sale.productId, -sale.qty);
  for (const a of live(db.adjustments)) if (a.kind === 'product') add(a.itemId, a.delta);
  return s;
}

// ---------- Costing ----------

export interface CostBreakdown {
  materials: number;
  overhead: number;
  labour: number;
  total: number;
  profit: number;
  marginPercent: number; // profit / price
  suggestedPrice: number; // price that hits the target margin
  lines: { material?: Material; qty: number; cost: number }[];
}

export function costProduct(
  product: Pick<Product, 'recipe' | 'labourHours' | 'price'>,
  materials: Material[],
  settings: Settings,
): CostBreakdown {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const lines = product.recipe.map((l: RecipeLine) => {
    const material = byId.get(l.materialId);
    return { material, qty: l.qty, cost: (material?.unitCost ?? 0) * l.qty };
  });
  const mat = lines.reduce((a, l) => a + l.cost, 0);
  const overhead = (mat * settings.overheadPercent) / 100;
  const labour = product.labourHours * settings.hourlyRate;
  const total = mat + overhead + labour;
  const profit = product.price - total;
  const m = settings.targetMarginPercent / 100;
  return {
    materials: round2(mat),
    overhead: round2(overhead),
    labour: round2(labour),
    total: round2(total),
    profit: round2(profit),
    marginPercent: product.price > 0 ? (profit / product.price) * 100 : 0,
    suggestedPrice: m < 1 ? Math.ceil(total / (1 - m) / 10) * 10 : 0,
    lines,
  };
}

/** Which materials are short to make `qty` of a product right now. */
export function shortages(product: Product, qty: number, db: DB) {
  const stock = materialStock(db);
  const mats = new Map(db.materials.map((m) => [m.id, m]));
  return product.recipe
    .map((l) => ({ material: mats.get(l.materialId), need: l.qty * qty, have: stock.get(l.materialId) ?? 0 }))
    .filter((x) => x.need > x.have + 1e-9);
}

// ---------- Alerts ----------

export function lowStock(db: DB) {
  const ms = materialStock(db);
  const ps = productStock(db);
  const materials = live(db.materials)
    .map((m) => ({ item: m, stock: ms.get(m.id) ?? 0 }))
    .filter((x) => x.item.reorderLevel > 0 && x.stock <= x.item.reorderLevel)
    .sort((a, b) => a.stock / a.item.reorderLevel - b.stock / b.item.reorderLevel);
  const products = live(db.products)
    .filter((p) => p.active)
    .map((p) => ({ item: p, stock: ps.get(p.id) ?? 0 }))
    .filter((x) => x.item.reorderLevel > 0 && x.stock <= x.item.reorderLevel);
  return { materials, products };
}

// ---------- Finance ----------

export const saleTotal = (s: { qty: number; unitPrice: number; shippingCharged: number; discount: number }) =>
  s.qty * s.unitPrice + (s.shippingCharged || 0) - (s.discount || 0);

export interface MonthSummary {
  month: string;
  income: number;
  materialSpend: number;
  otherExpenses: number;
  expenses: number;
  profit: number;
  unitsSold: number;
}

export function monthlySummary(db: DB): Map<string, MonthSummary> {
  const out = new Map<string, MonthSummary>();
  const get = (date: string) => {
    const k = monthKey(date);
    let m = out.get(k);
    if (!m) {
      m = { month: k, income: 0, materialSpend: 0, otherExpenses: 0, expenses: 0, profit: 0, unitsSold: 0 };
      out.set(k, m);
    }
    return m;
  };
  for (const s of live(db.sales)) {
    const m = get(s.date);
    m.income += saleTotal(s);
    m.unitsSold += s.qty;
  }
  for (const p of live(db.purchases)) get(p.date).materialSpend += p.totalCost;
  for (const e of live(db.expenses)) get(e.date).otherExpenses += e.amount;
  for (const m of out.values()) {
    m.expenses = m.materialSpend + m.otherExpenses;
    m.profit = m.income - m.expenses;
  }
  return out;
}

export function lastNMonths(n: number, from = today()): string[] {
  const [y, mo] = from.split('-').map(Number);
  const res: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    res.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return res;
}

export const monthLabel = (k: string, long = false) => {
  const [y, m] = k.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', long ? { month: 'long', year: 'numeric' } : { month: 'short' });
};

/** Value of stock on hand: materials at unit cost, finished goods at full cost. */
export function inventoryValue(db: DB) {
  const settings = getSettings(db);
  const ms = materialStock(db);
  const ps = productStock(db);
  const mats = live(db.materials);
  const materials = mats.reduce((a, m) => a + Math.max(0, ms.get(m.id) ?? 0) * m.unitCost, 0);
  const products = live(db.products).reduce(
    (a, p) => a + Math.max(0, ps.get(p.id) ?? 0) * costProduct(p, mats, settings).total,
    0,
  );
  const retail = live(db.products).reduce((a, p) => a + Math.max(0, ps.get(p.id) ?? 0) * p.price, 0);
  return { materials, products, retail };
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
