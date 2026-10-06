// Every stored record carries sync metadata. Records are never hard-deleted;
// `deleted` is a tombstone so deletions sync to other devices.
export interface BaseRecord {
  id: string;
  updatedAt: string; // ISO timestamp, last local edit
  deleted?: boolean;
}

export const MATERIAL_CATEGORIES = ['Yarn', 'Eyes & Noses', 'Stuffing', 'Hooks & Tools', 'Accessories', 'Packaging', 'Other'] as const;
export const UNITS = ['g', 'skein', 'ball', 'm', 'piece', 'pair', 'pack'] as const;
export const EXPENSE_CATEGORIES = ['Shipping', 'Packaging', 'Marketing', 'Tools & Equipment', 'Platform Fees', 'Photography', 'Other'] as const;
export const CHANNELS = ['Instagram', 'WhatsApp', 'In person', 'Other'] as const;

export interface Material extends BaseRecord {
  name: string;
  category: string;
  unit: string;
  unitCost: number; // ₹ per unit; updated to the latest purchase price
  reorderLevel: number; // alert when stock falls to/below this
  color?: string;
  supplier?: string;
  notes?: string;
}

export interface RecipeLine {
  materialId: string;
  qty: number;
}

export interface Product extends BaseRecord {
  name: string;
  category: string;
  sku?: string;
  price: number; // selling price ₹
  labourHours: number;
  recipe: RecipeLine[];
  reorderLevel: number; // finished-stock alert threshold
  photo?: string; // small JPEG data URL
  description?: string;
  active: boolean;
}

/** Bought raw material: adds stock, counts as an expense. */
export interface Purchase extends BaseRecord {
  date: string; // YYYY-MM-DD
  materialId: string;
  qty: number;
  totalCost: number;
  supplier?: string;
  notes?: string;
}

/** A batch of finished products made; consumes materials per recipe snapshot. */
export interface Production extends BaseRecord {
  date: string;
  productId: string;
  qty: number;
  consumed: { materialId: string; qty: number; unitCost: number }[];
  notes?: string;
}

export interface Sale extends BaseRecord {
  date: string;
  productId?: string; // empty for custom one-off items
  description?: string;
  qty: number;
  unitPrice: number;
  shippingCharged: number;
  discount: number;
  customer?: string;
  channel: string;
  notes?: string;
}

export interface Expense extends BaseRecord {
  date: string;
  category: string;
  amount: number;
  description: string;
}

/** Manual stock correction (counted stock, damage, opening stock, gifts). */
export interface Adjustment extends BaseRecord {
  date: string;
  kind: 'material' | 'product';
  itemId: string;
  delta: number;
  reason: string;
}

export interface Settings extends BaseRecord {
  businessName: string;
  hourlyRate: number; // ₹ per labour hour used in costing
  overheadPercent: number; // % added on top of materials for small consumables
  targetMarginPercent: number;
}

export interface DB {
  materials: Material[];
  products: Product[];
  purchases: Purchase[];
  productions: Production[];
  sales: Sale[];
  expenses: Expense[];
  adjustments: Adjustment[];
  settings: Settings[]; // single record with id 'settings'
}

export type CollectionName = keyof DB;
export const COLLECTIONS: CollectionName[] = [
  'materials', 'products', 'purchases', 'productions', 'sales', 'expenses', 'adjustments', 'settings',
];
