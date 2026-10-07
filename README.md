# Knitty Maa Manager 🧶

A small business manager for a crochet shop: **catalogue, finished-goods inventory, raw materials, and finances**, with cloud sync between phone and laptop. Prices are in ₹ INR.

## What it does

| Area | Features |
|---|---|
| **Catalogue** | Products with photo, category, price and SKU. Each product has a *recipe* (materials for one piece) and the hours it takes to make. The app shows its true cost (materials + consumables % + your time), the profit and margin, and a suggested price for your target margin. |
| **Finished inventory** | “Record finished items” adds pieces to stock and **automatically uses up the materials** in the recipe, with a warning if you're short. Sales reduce stock. Stock can be adjusted for counts, damage or gifts. |
| **Raw materials** | Yarn, eyes, stuffing, packaging and more, in any unit (g, skein, ball, m, piece, pair, pack). Recording a purchase adds stock, counts as an expense, and updates the material's current cost. Purchase history is kept. |
| **Low-stock alerts** | Set an alert level on any material or product. Low items show on the Home screen and as a badge in the menu. |
| **Sales & money** | Record sales (catalogue or custom items, shipping, discount, customer @handle, Instagram/WhatsApp/in person) and other expenses (shipping, packaging, marketing…). Monthly money in, money out and profit. |
| **Reports** | Income vs spending chart, best sellers with real profit, where the money goes, sales by channel, stock value. CSV export for your accountant or a spreadsheet. |
| **Sync & backup** | Works offline. Signs in to your own free Supabase project to sync across devices. You can also download or restore a JSON backup. |

### How stock is calculated
Stock is never typed in directly. It is **calculated from history**:

- material stock = purchases − materials used in batches ± adjustments
- product stock = batches made − sales ± adjustments

So deleting or editing a sale or batch automatically corrects stock, and two devices syncing can't overwrite each other's counts.

## Using it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build in dist/
```

Recommended first steps in the app:
1. **Settings**: set your hourly rate, consumables % and target margin.
2. **Materials**: add each yarn and supply with the stock you have now.
3. **Catalogue**: add products and their recipe for one piece.
4. As you work: **Finished items** when you finish pieces, **+ Sale** when you sell, **Bought materials** when you shop.

On your phone, open the site and use “Add to Home screen” to get an app icon.

## Setting up cloud sync (one-time, ~5 minutes, free)

1. Create a free account and project at [supabase.com](https://supabase.com).
2. In the project, open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Project Settings → API Keys** and copy the **publishable** key (older projects call it **anon public**). This project's URL, `https://hppsgfcfrhmlclxqgdol.supabase.co`, is already built in via `.env.production`. Paste the key there too, and no device will need to enter anything.
4. In the app, go to **Settings → Cloud sync**, paste both, click **Connect**, then **Create account** (and confirm the email Supabase sends).
5. On your other devices, open the app, paste the same URL and key, and **Sign in**.

The anon key is safe to use in the browser. Row-level security means each login can only read and write its own data. To skip pasting the keys on each device, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). For GitHub Pages, add them as repository *variables*.

Sync behaviour: changes save instantly on the device and upload a moment later. The app syncs on open, on focus, every minute, and when you come back online. If the same record is edited on two devices, the most recent edit wins.

## Hosting on GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`. Turn it on once in **Settings → Pages → Build and deployment → Source: GitHub Actions**. The app will be at `https://<your-username>.github.io/knitty_maa_manager/`.

## Tech

React + TypeScript + Vite. The data lives in `localStorage` and syncs to one Supabase table (`records`), with one row per record stored as JSON. Charts are plain SVG with no chart library. Main files:

- `src/types.ts`: data model
- `src/logic.ts`: stock ledger, costing, finance maths (unit-tested in `logic.test.ts`)
- `src/store.ts`: local store and change tracking
- `src/sync.ts`: Supabase auth, pull and push
- `src/pages/*`: screens
