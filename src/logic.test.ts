import { describe, expect, it } from 'vitest';
import { costProduct, DEFAULT_SETTINGS, lowStock, materialStock, monthlySummary, productStock, saleTotal, shortages, lastNMonths, toCSV } from './logic';
import type { DB, Material, Product } from './types';

const t = '2026-01-01T00:00:00.000Z';
const yarn: Material = { id: 'yarn', updatedAt: t, name: 'Milk cotton', category: 'Yarn', unit: 'g', unitCost: 2, reorderLevel: 100 };
const eyes: Material = { id: 'eyes', updatedAt: t, name: 'Safety eyes', category: 'Eyes & Noses', unit: 'pair', unitCost: 10, reorderLevel: 0 };
const bunny: Product = {
  id: 'bunny', updatedAt: t, name: 'Bunny', category: 'Amigurumi', price: 500, labourHours: 2, reorderLevel: 2, active: true,
  recipe: [{ materialId: 'yarn', qty: 50 }, { materialId: 'eyes', qty: 1 }],
};

function makeDB(): DB {
  return {
    materials: [yarn, eyes],
    products: [bunny],
    purchases: [
      { id: 'p1', updatedAt: t, date: '2026-09-05', materialId: 'yarn', qty: 200, totalCost: 400 },
      { id: 'p2', updatedAt: t, date: '2026-09-05', materialId: 'eyes', qty: 10, totalCost: 100 },
    ],
    productions: [
      { id: 'b1', updatedAt: t, date: '2026-09-10', productId: 'bunny', qty: 3, consumed: [{ materialId: 'yarn', qty: 150, unitCost: 2 }, { materialId: 'eyes', qty: 3, unitCost: 10 }] },
    ],
    sales: [
      { id: 's1', updatedAt: t, date: '2026-09-20', productId: 'bunny', qty: 2, unitPrice: 500, shippingCharged: 60, discount: 20, channel: 'Instagram' },
      { id: 's2', updatedAt: t, date: '2026-10-01', description: 'Custom keychain', qty: 1, unitPrice: 150, shippingCharged: 0, discount: 0, channel: 'WhatsApp' },
      { id: 's3', updatedAt: t, date: '2026-10-02', productId: 'bunny', qty: 5, unitPrice: 500, shippingCharged: 0, discount: 0, channel: 'WhatsApp', deleted: true },
    ],
    expenses: [{ id: 'e1', updatedAt: t, date: '2026-09-21', category: 'Shipping', amount: 70, description: 'Post' }],
    adjustments: [{ id: 'a1', updatedAt: t, date: '2026-09-11', kind: 'material', itemId: 'yarn', delta: -10, reason: 'Damaged / wasted' }],
    settings: [],
  };
}

describe('stock ledger', () => {
  it('derives material stock from purchases, production and adjustments', () => {
    const s = materialStock(makeDB());
    expect(s.get('yarn')).toBe(200 - 150 - 10);
    expect(s.get('eyes')).toBe(7);
  });
  it('derives product stock and ignores deleted sales', () => {
    expect(productStock(makeDB()).get('bunny')).toBe(1);
  });
  it('flags low stock against reorder levels', () => {
    const low = lowStock(makeDB());
    expect(low.materials.map((x) => x.item.id)).toEqual(['yarn']); // 40g <= 100g
    expect(low.products.map((x) => x.item.id)).toEqual(['bunny']); // 1 <= 2
  });
  it('reports material shortages for a planned batch', () => {
    const short = shortages(bunny, 1, makeDB());
    expect(short.map((s) => s.material?.id)).toEqual(['yarn']); // need 50g, have 40g
  });
});

describe('costing', () => {
  it('adds materials, overhead and labour', () => {
    const c = costProduct(bunny, [yarn, eyes], DEFAULT_SETTINGS);
    expect(c.materials).toBe(110);
    expect(c.overhead).toBe(5.5);
    expect(c.labour).toBe(200);
    expect(c.total).toBe(315.5);
    expect(c.profit).toBe(184.5);
    // 40% margin → 315.5 / 0.6 = 525.8, rounded up to the next ₹10
    expect(c.suggestedPrice).toBe(530);
  });
  it('handles a recipe pointing at a deleted material', () => {
    const c = costProduct({ ...bunny, recipe: [{ materialId: 'gone', qty: 5 }] }, [], DEFAULT_SETTINGS);
    expect(c.materials).toBe(0);
  });
});

describe('finance', () => {
  it('totals sales with shipping and discount', () => {
    expect(saleTotal({ qty: 2, unitPrice: 500, shippingCharged: 60, discount: 20 })).toBe(1040);
  });
  it('summarises income and spending by month', () => {
    const m = monthlySummary(makeDB());
    expect(m.get('2026-09')).toMatchObject({ income: 1040, materialSpend: 500, otherExpenses: 70, expenses: 570, profit: 470, unitsSold: 2 });
    expect(m.get('2026-10')).toMatchObject({ income: 150, profit: 150, unitsSold: 1 });
  });
  it('lists months across a year boundary', () => {
    expect(lastNMonths(3, '2026-02-15')).toEqual(['2025-12', '2026-01', '2026-02']);
  });
  it('escapes CSV values', () => {
    expect(toCSV([{ a: 'x,y', b: 'say "hi"' }])).toBe('a,b\n"x,y","say ""hi"""');
  });
});
