# Iced-Out Cougs ERP

A working mini-ERP for a fictional BYU-fan jewelry company (manufacturing + retail). Built for the GSCM 401 ERP Project.

- **Front end:** plain HTML, CSS and JavaScript (no build step).
- **Database:** Supabase (PostgreSQL). All business logic runs in database functions, one transaction per action.
- **Hosting:** GitHub Pages (or any static host).
- **AI tool:** Claude (Anthropic). Edit the "AI coding tools used" line in *Settings & About* if your team also used other tools.

## What is in this folder

| File | What it is |
|---|---|
| `index.html`, `css/`, `js/`, `vendor/` | The web app. `vendor/` holds the three libraries it uses, so there are no outside downloads at demo time. |
| `js/config.js` | **The only file you edit**: your Supabase URL and anon key. |
| `database.sql` | Run once in Supabase. Creates the tables and logic, then generates the starting data. |

## Setup (about 15 minutes)

### 1. Create the database
1. Go to supabase.com, create a free account and a **new project**. Wait for it to finish starting.
2. Open **SQL Editor → New query**. Paste in the entire contents of `database.sql` and click **Run**. Supabase will warn that the script drops tables; that is expected, confirm it. It finishes with a line like `Starting data ready: 34 items, 3,000+ sales …`.
3. Open **Authentication → Sign In / Providers → Email** and turn **off "Confirm email"**, then save. (Otherwise every new login must click an emailed link, and the free tier only sends a few emails per hour.)

### 2. Connect the app
1. In Supabase open **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. Paste both into `js/config.js`. The anon key is designed to be public. Never use the `service_role` key.

### 3. Publish
1. Create a **public** GitHub repository and upload everything in this folder (keep the folder structure).
2. In the repository: **Settings → Pages → Deploy from a branch → main → / (root) → Save**.
3. After a minute or two the app is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

To try it on your own computer first, run `python3 -m http.server` in this folder and open `http://localhost:8000`. (Camera scanning needs `https` or `localhost`.)

### 4. Create logins
On the sign-in screen choose **Create account**.
- **Staff:** account type *Staff*, access code **`COUGS401`** (change it in *Settings & About*). Make one per teammate.
- **Customer:** account type *Customer*. If you sign up with a starting customer's email, for example `emma.sorensen@example.com`, the login is linked to that customer and their order history. Any other email creates a new customer.

### 5. Before the demo
- **Refresh the data** so the six months of history ends yesterday and the open orders fall in the next four weeks: *Settings & About → Reset to fresh starting data*, or run `select core.seed_demo();` in the SQL Editor. This erases anything you entered while testing; logins are kept.
- **Print the barcodes:** *Items, BOMs & Barcodes → Barcode labels → Print labels*. Cut them out and attach them to physical items.
- **Test scanning on the real devices.** A USB scanner works anywhere in the app (it types the number and presses Enter). For a phone or laptop camera click **Use camera** and allow camera access.
- **Test with two people signed in on two computers.** A sale on one should change inventory on the other within a few seconds.
- Every teammate should run the checklist below at least once.

## Test checklist: the 12 required capabilities

| # | Capability | Where | Do this | Check this |
|---|---|---|---|---|
| 1 | Point of Sale | Point of Sale | Scan or tap two different items, set a line or order discount, complete the sale | Receipt shows lines, discount, 7.25% tax. *Inventory* at that location dropped. *Financial Reporting* revenue and COGS for today rose. |
| 2 | Inventory Management | Inventory | Transfer an item between locations. Adjust an item with "counted quantity" and a reason code | Quantities by location change. *Recent stock movements* shows the reason code. Backordered and Est. available columns are filled for short items. |
| 3 | Barcode Support | POS, Inventory, PO receiving | Scan in POS (adds to cart). Scan in Inventory (opens count/adjust/transfer/receive). Scan inside a PO receipt (adds 1 to that line) | Each scan finds the right item. |
| 4 | Sales Orders | Sales Orders | New sales order → Fulfill → Close. Cancel a different open order | Status moves Order Placed → Fulfilled → Closed. Fulfilling lowers inventory and records revenue. |
| 5 | Returns and Exchanges | Returns & Exchanges | Find a sale by receipt number. Return one item as "Wrong size" (passed inspection) and one as "Defective" (quality failure: choose "return to workshop for repair" or "write off"). Add an exchange item | Passed item is back in sellable stock; a repairable failure is back in workshop inventory; a write-off is received and removed. Each line keeps its reason code. Refund, revenue and COGS reversal are shown; write-offs appear on the P&L. |
| 6 | Production Orders | Production Orders | New order for a parent item → Issue components → Complete with some scrap and a reason code | Components dropped by BOM × quantity. Good units were received at the rolled-up cost. The *Production & quality report* shows yield, scrap, rework, cycle time and on-time %. |
| 7 | Purchase Orders and Suppliers | Purchase Orders, Suppliers & Scorecards, Ordering Rules | Create and send a PO, receive part, receive the rest, record payment, close. Change ordering cost in *Ordering Rules* | Expected date = sent date + supplier lead time. Status moves Order Sent → Received → Closed. Scorecard and payables update. EOQ and reorder points recalculate. |
| 8 | MRP | MRP | Place a new sales order for a parent item, then open MRP | Gross requirements rise in the right week. Component requirements = ordered parent quantity × BOM quantity, minus component on-hand and open POs. Suggested orders show quantity and order-by date. Switch *Planning method* to standard netting and explain the difference. |
| 9 | Financial Reporting | Financial Reporting | Open P&L, Inventory valuation, Inventory turnover; then post a sale or a PO receipt and look again | All three change without any manual entry. |
| 10 | Reporting | Reports | Open each tab | Sales by day/week, top sellers, low stock with suggested quantity and order-by date, inventory by location, supplier performance. |
| 11 | Customer-Facing ERP | Sign in as a customer | Pick a pickup location, add items, place the order | Availability by location is shown. The order appears for staff in *Sales Orders* tagged "customer portal". |
| 12 | Multi-user logins | Two browsers | Make a sale in one | The other updates on its own within a few seconds. |

Also required and included: starting data (34 items with barcodes, 8 parent items with bills of material, 3 locations, 6 suppliers, 10 customers, 6+ months of sales history), and documentation of the tools used (*Settings & About*).

## Wow factors

1. **Command Center.** The home page works out the exceptions a manager should act on today (backorders, late purchase orders, MRP orders past their order-by date, overdue supplier invoices, suppliers rated "Replace") and links straight to the screen that fixes each one.
2. **Promise dates.** When an item is short, staff and customers see an estimated available date: the next open purchase or production order, or, for an item you make, the date the short components arrive plus the build lead time.
3. **Demand surge what-if in MRP.** A slider inflates confirmed demand (a big game-day or holiday rush) and instantly shows the extra builds and purchases needed, without saving anything.
4. **One-click ordering.** MRP suggestions, the reorder list and the periodic review all turn into draft purchase orders grouped by supplier, and MRP build suggestions into production orders.
5. **Assemble to order.** Selling a parent item with no finished stock builds it on the spot from components at that location, creating the production order automatically.
6. **Full stock ledger and ABC classes.** Click any item in Inventory to see every movement with who, why and at what cost.

## How the numbers are calculated

Know these before the demo. Dr. Wright may change an input and ask you to re-show a result.

- **Weighted average cost (WAC):** on every PO receipt or production completion, new cost = (quantity on hand × current cost + quantity received × receipt cost) ÷ new quantity. Sales record COGS at the WAC at that moment.
- **Finished item cost:** total cost of components issued ÷ good units completed (scrap is absorbed by the good units).
- **Average daily usage (d) and σ:** from the last 182 days of sales. Parent sales are multiplied through the bill of material to get component usage.
- **Reorder point:** d × L + z × σ × √L, where L is the lead time and z comes from the service level setting (95% → 1.64).
- **Periodic review order-up-to level:** d × (P + L) + z × σ × √(P + L). Order quantity = level − (on hand + on order).
- **EOQ:** √(2 × D × S ÷ H). D = d × 365, S = ordering cost setting, H = holding cost % setting × unit cost.
- **MRP planning method:** the default follows the assignment: every parent unit on a confirmed sales order is multiplied through the BOM, then component on-hand and open purchase orders are subtracted. The *Planning method* switch changes to standard MRP netting, where finished stock and open production orders cover parent orders first and only the remaining builds are exploded. Be ready to explain why standard netting suggests less.
- **MRP record:** projected on hand = prior on hand + scheduled receipts + planned order receipts − gross requirements. Net requirement = gross − scheduled receipts − prior on hand (never below zero). Planned order release = planned receipt moved earlier by the lead time. Lot-for-lot orders exactly the net; FOQ rounds up to the fixed quantity.
- **Supplier rating:** 45% on-time delivery + 30% fill rate + 25% lead-time adherence (quoted ÷ actual). Keep ≥ 88, Watch 75–87, Replace < 75.
- **Payables:** amount owed = quantity received × PO unit cost; due date = first receipt date + payment terms.
- **Inventory turnover:** COGS for the period, annualized, ÷ average daily inventory value in the period.

## Design choices worth knowing

- Bills of material are single level (a component cannot itself be a parent).
- MRP plans in weekly buckets starting today and uses total on-hand across all three locations.
- Labor is not costed; finished cost is material only.
- Fulfilling a sales order is blocked if stock is short at that location, unless the item can be assembled there from components.
- The starting history is random within realistic patterns (weekday and Saturday peaks, football-season lift for game-day items, late-November holiday lift, a few unreliable suppliers), so the exact numbers differ each time you reset.

## If something goes wrong

- **"The app is not connected to a database yet"**: `js/config.js` still has the placeholder values.
- **"Could not find the function …" right after running the SQL**: wait 30 seconds and reload; Supabase is refreshing its API.
- **Sign-up says to check your email**: "Confirm email" is still on (Setup step 1.3).
- **Camera will not open**: the page must be on `https` (GitHub Pages is) and the browser must be allowed to use the camera. Typing the barcode number into the scan box always works.
- **Screens do not update for the second user**: they refresh within about 6 seconds even if Supabase Realtime is unavailable; check that both users are signed in to the same deployed site.
