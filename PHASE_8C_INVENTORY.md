# 📦 PHASE 8C — Inventory & Asset Management
# Education ERP · Full Inventory & Asset Module Prompt for Claude Code
#
# WHEN TO RUN: After Phase 8B (Accounts) is complete
# DEPENDS ON:  Phase 8B (purchases auto-create journal entries)
# INTEGRATES:  Accounts Module (Phase 8B), Settings, HR Module

---

## PHASE PLACEMENT

```
Phase 8   → Fee & Finance
Phase 8B  → Accounts (double-entry)
Phase 8C  → THIS FILE: Inventory & Assets
Phase 9   → Online Admission (continues as before)
```

---

## ══════════════════════════════════════════════
## CLAUDE CODE PROMPT — PHASE 8C (Paste This)
## ══════════════════════════════════════════════

```
Read CLAUDE.md fully. Check what exists. Tell me the status. Then proceed.

PHASE 8C GOAL: Build a complete Inventory and Asset Management system —
fixed asset registry with depreciation, consumable stock management,
purchase workflow (Requisition → PO → GRN → Payment), and
automatic journal entries to the Accounts module (Phase 8B).

This module has TWO parts:
  PART A — Fixed Assets (furniture, electronics, vehicles, equipment)
  PART B — Consumable Inventory (stationery, lab chemicals, supplies)
Both share a Purchase Management workflow.

────────────────────────────────────────────────
STEP 8C-1 — Prisma Schema Additions
Add to packages/db/prisma/schema.prisma
────────────────────────────────────────────────

═══ PART A — FIXED ASSETS ═══

model AssetCategory {
  id              String    @id @default(cuid())
  name            String
  name_bn         String?
  depreciation_method   DepreciationMethod  @default(STRAIGHT_LINE)
  depreciation_rate     Float               @default(10)  // % per year
  useful_life_years     Int                 @default(10)
  asset_account_id      String?   // linked Account (e.g. 1101 Furniture)
  accumulated_dep_account_id String?  // e.g. 1105 Accumulated Depreciation
  dep_expense_account_id String?   // e.g. 5018 Depreciation Expense
  created_at      DateTime  @default(now())
  assets          Asset[]
}

model Asset {
  id                    String          @id @default(cuid())
  asset_uid             String          @unique  // AST-2026-0001
  category_id           String
  category              AssetCategory   @relation(fields: [category_id], references: [id])
  name                  String
  name_bn               String?
  description           String?
  barcode               String?         @unique
  qr_code_url           String?
  purchase_date         DateTime        @db.Date
  purchase_price        Float
  supplier_id           String?
  supplier              Supplier?       @relation(fields: [supplier_id], references: [id])
  invoice_no            String?
  warranty_expiry       DateTime?       @db.Date
  current_location      String?         // room or building
  department_id         String?
  assigned_to_staff_id  String?
  condition             AssetCondition  @default(GOOD)
  status                AssetStatus     @default(ACTIVE)
  accumulated_dep       Float           @default(0)
  book_value            Float           // purchase_price - accumulated_dep
  photo_url             String?
  notes                 String?
  purchase_entry_id     String?         // link to InventoryPurchase
  disposed_at           DateTime?
  disposed_reason       String?
  disposed_value        Float?
  created_at            DateTime        @default(now())
  updated_at            DateTime        @updatedAt
  depreciation_entries  DepreciationEntry[]
  maintenance_logs      AssetMaintenance[]
  transfer_logs         AssetTransfer[]
  @@index([category_id])
  @@index([status])
}

model DepreciationEntry {
  id                  String    @id @default(cuid())
  asset_id            String
  asset               Asset     @relation(fields: [asset_id], references: [id])
  financial_year      String    // "2026-2027"
  period              String    // "July 2026", or "Annual 2026-2027"
  opening_value       Float
  dep_rate            Float
  dep_amount          Float
  closing_value       Float
  voucher_id          String?   // auto-journal created in Accounts module
  created_at          DateTime  @default(now())
  @@unique([asset_id, period])
}

model AssetMaintenance {
  id                String    @id @default(cuid())
  asset_id          String
  asset             Asset     @relation(fields: [asset_id], references: [id])
  maintenance_date  DateTime  @db.Date
  type              String    // "Repair", "Service", "Inspection"
  description       String
  cost              Float     @default(0)
  done_by           String?   // vendor or staff name
  next_due          DateTime? @db.Date
  voucher_id        String?   // link to expense voucher in accounts
  created_at        DateTime  @default(now())
}

model AssetTransfer {
  id                  String    @id @default(cuid())
  asset_id            String
  asset               Asset     @relation(fields: [asset_id], references: [id])
  from_location       String?
  to_location         String?
  from_department_id  String?
  to_department_id    String?
  transferred_at      DateTime  @default(now())
  transferred_by_id   String?
  reason              String?
}

═══ PART B — CONSUMABLE INVENTORY ═══

model ItemCategory {
  id        String    @id @default(cuid())
  name      String    // "Stationery", "Lab Chemicals", "Cleaning Supplies"
  name_bn   String?
  created_at DateTime @default(now())
  items     Item[]
}

model Item {
  id                    String        @id @default(cuid())
  item_code             String        @unique  // ITM-0001
  category_id           String
  category              ItemCategory  @relation(fields: [category_id], references: [id])
  name                  String
  name_bn               String?
  unit                  String        // "Pcs", "Ream", "Litre", "Kg", "Box"
  current_stock         Float         @default(0)
  minimum_stock         Float         @default(0)  // low stock alert threshold
  reorder_qty           Float         @default(0)
  expense_account_id    String?       // linked Account (e.g. 5009 Stationery)
  is_active             Boolean       @default(true)
  created_at            DateTime      @default(now())
  updated_at            DateTime      @updatedAt
  stock_transactions    StockTransaction[]
  purchase_items        PurchaseItem[]
  requisition_items     RequisitionItem[]
  @@index([category_id])
}

model StockTransaction {
  id              String            @id @default(cuid())
  item_id         String
  item            Item              @relation(fields: [item_id], references: [id])
  transaction_type StockTxnType    // IN | OUT | ADJUSTMENT
  quantity        Float
  unit_price      Float?
  total_value     Float?
  balance_after   Float             // running stock after this transaction
  reference_type  String?           // "PURCHASE", "ISSUE", "RETURN", "ADJUSTMENT"
  reference_id    String?
  department_id   String?           // issued to which department
  issued_to_id    String?           // issued to which staff
  notes           String?
  created_by_id   String?
  created_at      DateTime          @default(now())
  @@index([item_id, created_at])
}

═══ PURCHASE MANAGEMENT (SHARED by Assets + Consumables) ═══

model Supplier {
  id                String    @id @default(cuid())
  name              String
  name_bn           String?
  contact_person    String?
  phone             String?
  email             String?
  address           String?
  nid               String?
  tin               String?
  account_id        String?   // linked to Accounts Payable ledger
  is_active         Boolean   @default(true)
  created_at        DateTime  @default(now())
  purchase_orders   PurchaseOrder[]
  assets            Asset[]
}

model PurchaseRequisition {
  id                    String      @id @default(cuid())
  req_no                String      @unique  // REQ-2026-0001
  requested_by_id       String
  department_id         String?
  reason                String
  req_date              DateTime    @db.Date  @default(now())
  required_by           DateTime?   @db.Date
  status                ReqStatus   @default(PENDING)
  approved_by_id        String?
  approved_at           DateTime?
  rejected_reason       String?
  created_at            DateTime    @default(now())
  items                 RequisitionItem[]
  purchase_order        PurchaseOrder?
}

model RequisitionItem {
  id                    String                @id @default(cuid())
  requisition_id        String
  requisition           PurchaseRequisition   @relation(fields: [requisition_id], references: [id])
  item_id               String?               // for consumables
  item                  Item?                 @relation(fields: [item_id], references: [id])
  description           String                // for assets or custom items
  quantity              Float
  estimated_unit_price  Float?
  notes                 String?
}

model PurchaseOrder {
  id                    String                @id @default(cuid())
  po_no                 String                @unique  // PO-2026-0001
  requisition_id        String?               @unique
  requisition           PurchaseRequisition?  @relation(fields: [requisition_id], references: [id])
  supplier_id           String
  supplier              Supplier              @relation(fields: [supplier_id], references: [id])
  order_date            DateTime              @db.Date
  delivery_date         DateTime?             @db.Date
  delivery_address      String?
  terms                 String?
  total_amount          Float
  status                POStatus              @default(DRAFT)
  approved_by_id        String?
  approved_at           DateTime?
  created_at            DateTime              @default(now())
  items                 PurchaseItem[]
  grns                  GoodsReceivedNote[]
}

model PurchaseItem {
  id              String        @id @default(cuid())
  po_id           String
  po              PurchaseOrder @relation(fields: [po_id], references: [id])
  item_id         String?
  item            Item?         @relation(fields: [item_id], references: [id])
  description     String
  purchase_type   PurchaseType  // ASSET | CONSUMABLE
  quantity        Float
  unit            String?
  unit_price      Float
  total_price     Float
  asset_category_id String?     // if purchase_type=ASSET
  received_qty    Float         @default(0)
  @@index([po_id])
}

model GoodsReceivedNote {
  id              String        @id @default(cuid())
  grn_no          String        @unique  // GRN-2026-0001
  po_id           String
  po              PurchaseOrder @relation(fields: [po_id], references: [id])
  received_date   DateTime      @db.Date
  received_by_id  String
  supplier_invoice_no String?
  remarks         String?
  total_amount    Float
  voucher_id      String?       // auto-journal created in Accounts module
  created_at      DateTime      @default(now())
  items           GRNItem[]
}

model GRNItem {
  id              String            @id @default(cuid())
  grn_id          String
  grn             GoodsReceivedNote @relation(fields: [grn_id], references: [id])
  po_item_id      String
  description     String
  ordered_qty     Float
  received_qty    Float
  unit_price      Float
  total_price     Float
  asset_id        String?           // created asset (if ASSET type)
  @@index([grn_id])
}

--- ENUMS (add to schema) ---

enum DepreciationMethod { STRAIGHT_LINE WRITTEN_DOWN_VALUE }
enum AssetCondition { EXCELLENT GOOD FAIR POOR DAMAGED }
enum AssetStatus { ACTIVE UNDER_REPAIR DISPOSED LOST TRANSFERRED }
enum StockTxnType { IN OUT ADJUSTMENT RETURN }
enum ReqStatus { PENDING APPROVED REJECTED PO_CREATED }
enum POStatus { DRAFT APPROVED SENT_TO_SUPPLIER PARTIALLY_RECEIVED RECEIVED CANCELLED }
enum PurchaseType { ASSET CONSUMABLE }

After adding: run pnpm db:migrate --name "inventory_assets_module"

────────────────────────────────────────────────
STEP 8C-2 — Inventory API
server/api/src/modules/inventory/
────────────────────────────────────────────────

Create:
  asset.routes.ts / asset.controller.ts / asset.service.ts
  inventory.routes.ts / inventory.controller.ts / inventory.service.ts
  purchase.routes.ts / purchase.controller.ts / purchase.service.ts
  depreciation.service.ts
  supplier.routes.ts

--- Asset Category ---

GET  /api/inventory/asset-categories
POST /api/inventory/asset-categories
  Body: { name, name_bn, depreciation_method, depreciation_rate, useful_life_years,
          asset_account_id, accumulated_dep_account_id, dep_expense_account_id }
PUT  /api/inventory/asset-categories/:id
DELETE /api/inventory/asset-categories/:id → block if assets exist

--- Fixed Assets ---

GET  /api/inventory/assets
  Query: category_id, status, department_id, condition, search, page, limit
  Returns: paginated with book_value, depreciation info

GET  /api/inventory/assets/:id
  Returns: full asset detail + depreciation history + maintenance log + transfer history

POST /api/inventory/assets
  Body: all Asset fields
  Logic:
    1. Generate asset_uid: AST-{YEAR}-{sequential}
    2. Generate QR code image → upload to Blob → set qr_code_url
    3. Set book_value = purchase_price
    4. Create auto-journal entry in Accounts module:
       Dr [category.asset_account_id] → Cr 2001 Accounts Payable OR Cr 1001/1002 Cash
       (if paid immediately: use cash/bank; if on credit: use Accounts Payable)
  Returns: created asset with generated UID + QR code

PUT  /api/inventory/assets/:id
  Cannot change purchase_price, purchase_date, category_id after creation (affects depreciation)

POST /api/inventory/assets/:id/photo → upload photo

POST /api/inventory/assets/:id/transfer
  Body: { to_location, to_department_id, reason }
  Creates AssetTransfer record

POST /api/inventory/assets/:id/maintenance
  Body: { maintenance_date, type, description, cost, done_by, next_due }
  If cost > 0: create expense journal: Dr 5011 Repairs & Maintenance → Cr 1001/1002

POST /api/inventory/assets/:id/dispose
  Body: { disposed_reason, disposed_value, disposed_at }
  Logic:
    1. Status → DISPOSED
    2. If disposed_value > 0:
       Dr 1001/1002 (cash received) → Cr Asset Account (book value) → Dr/Cr Gain/Loss on Disposal
    3. If disposed_value = 0 (written off):
       Dr Accumulated Depreciation + Dr Loss on Disposal → Cr Asset Account

--- Depreciation ---

POST /api/inventory/depreciation/calculate
  Body: { period: "July 2026", financial_year: "2026-2027" }
  Authorized: ACCOUNTANT, ADMIN only

  Logic (Straight Line Method):
    For each ACTIVE asset:
      annual_dep = asset.purchase_price × (category.depreciation_rate / 100)
      monthly_dep = annual_dep / 12
      new_book_value = current book_value - monthly_dep
      if new_book_value <= 0: stop depreciating (fully depreciated)

  Batch create DepreciationEntry for all assets
  Create one consolidated journal entry for the period:
    Dr 5018 Depreciation Expense → Cr 1105 Accumulated Depreciation
    (single voucher, one entry per asset as journal lines)
  
  Returns: { processed: N, total_dep_amount: amount, voucher_id }

POST /api/inventory/depreciation/calculate-annual
  Body: { financial_year: "2026-2027" }
  Calculate full year depreciation at once (for institutions that don't do monthly)

GET  /api/inventory/depreciation/schedule
  Returns: depreciation schedule for all assets
  Columns: asset_uid, name, purchase_price, rate, annual_dep, monthly_dep, remaining_life, book_value

--- Item Catalog ---

GET  /api/inventory/items
  Query: category_id, low_stock=true, search, page, limit
  low_stock filter: current_stock <= minimum_stock

POST /api/inventory/items
  Body: { category_id, name, name_bn, unit, minimum_stock, reorder_qty, expense_account_id }
  Generate item_code: ITM-{sequential}

PUT  /api/inventory/items/:id
DELETE /api/inventory/items/:id → block if stock transactions exist

--- Stock Transactions ---

POST /api/inventory/stock/issue
  Body: { item_id, quantity, department_id, issued_to_id, notes }
  Validate: quantity <= current_stock (cannot issue more than available)
  Create StockTransaction (type=OUT)
  Update Item.current_stock -= quantity
  Create expense journal entry:
    Dr [item.expense_account_id] → Cr [Inventory Asset Account if tracked as asset, else skip]

POST /api/inventory/stock/adjust
  Body: { item_id, new_quantity, reason }
  Authorized: ADMIN, ACCOUNTANT only
  Create StockTransaction (type=ADJUSTMENT)
  Update current_stock to new_quantity

GET  /api/inventory/stock/:item_id/transactions
  Returns: full transaction history for an item (IN/OUT/ADJUSTMENT with dates)

GET  /api/inventory/stock/low-stock-report
  Returns: all items where current_stock <= minimum_stock
  Sort by: (current_stock / minimum_stock) ASC (most critical first)

--- Suppliers ---

GET  /api/inventory/suppliers
POST /api/inventory/suppliers
PUT  /api/inventory/suppliers/:id
DELETE /api/inventory/suppliers/:id

--- Purchase Requisition ---

POST /api/inventory/requisitions
  Body: { reason, required_by, items: [{ item_id?, description, quantity, estimated_unit_price }] }
  Generate req_no: REQ-{YEAR}-{seq}
  Status: PENDING

GET  /api/inventory/requisitions → list with filters
GET  /api/inventory/requisitions/:id → detail with items

PUT  /api/inventory/requisitions/:id/approve
  Authorized: ADMIN, PRINCIPAL, HOD
  Status: APPROVED
  Returns: approved requisition

PUT  /api/inventory/requisitions/:id/reject
  Body: { reason }
  Status: REJECTED

--- Purchase Order ---

POST /api/inventory/purchase-orders
  Body: { requisition_id?, supplier_id, order_date, delivery_date, items: [...] }
  If requisition_id: link them (status: REQ → PO_CREATED)
  Generate po_no: PO-{YEAR}-{seq}
  Status: DRAFT

GET  /api/inventory/purchase-orders → list
GET  /api/inventory/purchase-orders/:id → detail

PUT  /api/inventory/purchase-orders/:id/approve
  Status: APPROVED

POST /api/inventory/purchase-orders/:id/grn
  Body: { received_date, supplier_invoice_no, items: [{ po_item_id, received_qty, unit_price }] }
  Generate grn_no: GRN-{YEAR}-{seq}
  
  Logic per received item:
    If purchase_type=CONSUMABLE:
      Create StockTransaction (type=IN) for the item
      Update Item.current_stock += received_qty
    
    If purchase_type=ASSET:
      Create Asset record for each unit received
      Set: purchase_price=unit_price, category_id=po_item.asset_category_id
      Auto-generate asset_uid for each
      Set PO item: received_qty += received_qty
  
  Create auto-journal (via accounts auto-journal service):
    Dr [asset_account or expense_account] → Cr 2001 Accounts Payable
    (GRN creates a liability until payment is made)
  
  Update PO.status:
    If all items fully received: RECEIVED
    If partially: PARTIALLY_RECEIVED
  
  Returns: { grn, created_assets: [...], updated_stock: [...] }

GET /api/inventory/purchase-orders/:id/grns → all GRNs for a PO

--- Reports ---

GET /api/inventory/reports/asset-register
  Query: category_id?, status?, department_id?
  Returns: full asset list with current book value, depreciation to date
  Export: PDF or Excel

GET /api/inventory/reports/depreciation-schedule
  Returns: annual depreciation schedule for all active assets

GET /api/inventory/reports/stock-report
  Returns: all items with current stock level
  Highlight: low stock items in red

GET /api/inventory/reports/stock-movement
  Query: item_id, from_date, to_date
  Returns: stock IN/OUT history for a period

GET /api/inventory/reports/purchase-history
  Query: from_date, to_date, supplier_id?
  Returns: all GRNs with amounts

────────────────────────────────────────────────
STEP 8C-3 — Inventory Admin UI
apps/admin/app/(dashboard)/inventory/
────────────────────────────────────────────────

Left sub-navigation:
  📊 Dashboard           /inventory
  🏢 Fixed Assets        /inventory/assets
  📦 Stock & Items       /inventory/stock
  🛒 Purchases           /inventory/purchases
  🏭 Suppliers           /inventory/suppliers
  📈 Reports             /inventory/reports
  ⚙️  Categories          /inventory/categories

─── PAGE: /inventory (Dashboard) ───

Row 1 — Stat cards:
  🏢 Total Assets | Book Value: ৳X,XX,XXX | Active: N
  📦 Total Items | In Stock | Low Stock Alert: N (red badge)
  🛒 Pending POs | Total PO Value this year
  ⚠️  Maintenance Due | N assets need service

Row 2:
  Asset Category Breakdown — pie chart (count per category)
  Stock Status Chart — bar chart (current stock vs minimum per category)

Row 3:
  Recent Purchases (last 5 GRNs)
  Upcoming Maintenance (assets with next_due within 30 days)

─── PAGE: /inventory/assets ───

View toggle: List view | Card view

Filter bar: Category | Status | Department | Condition | Search (name, UID, barcode)

LIST VIEW — Table:
  Asset UID (monospace) | Photo (thumbnail) | Name | Category | Department | 
  Purchase Price | Book Value | Condition badge | Status badge | Actions

CARD VIEW — Grid (3-4 per row):
  Asset photo (large) | Name | UID | Book Value | Condition chip | Status chip

"Add Asset" → /inventory/assets/new
Row click → /inventory/assets/:id

─── PAGE: /inventory/assets/new ───

Multi-section form:

Section 1 — Basic Info:
  Name (EN + BN) | Category (select — shows depreciation rate auto-filled)
  Description | Condition (radio: Excellent/Good/Fair/Poor/Damaged)
  Photo upload

Section 2 — Purchase Details:
  Purchase Date | Purchase Price (৳) | Supplier (combobox)
  Invoice No | Warranty Expiry date

Section 3 — Location:
  Current Location (text: "Library Room 2", "Science Lab")
  Department (select) | Assigned To (staff combobox — optional)

Section 4 — Notes:
  Additional notes textarea

LIVE PREVIEW PANEL (right side):
  Shows asset tag preview:
    [QR Code placeholder]
    Asset UID: AST-26-0001 (auto)
    [Name], [Category]
    Purchase Date | Price

"Save Asset" → creates record + generates QR code

─── PAGE: /inventory/assets/:id ───

HEADER:
  Asset photo (large) | Asset UID (styled badge) | Name
  Status badge | Condition badge | Category
  Quick actions: Edit | Transfer | Log Maintenance | Dispose | Print Asset Tag

TABS:

TAB — Details
  Two-column info grid:
  Left: Purchase Date | Price | Supplier | Invoice | Warranty
  Right: Location | Department | Assigned to | QR Code (scannable)
  
  Depreciation Summary card:
    Purchase Price: ৳50,000
    Accumulated Depreciation: ৳15,000
    Current Book Value: ৳35,000
    Annual Rate: 10%
    Remaining Life: ~7 years

TAB — Depreciation History
  Table: Period | Opening Value | Dep Rate | Dep Amount | Closing Value | Voucher Link
  "Run Depreciation" quick button (admin only)

TAB — Maintenance Log
  Timeline of maintenance events
  Each: Date | Type | Cost | Done By | Next Due
  "Add Maintenance" button → dialog

TAB — Transfer History
  Timeline: From → To (department/location), By whom, When, Reason

TAB — Documents
  Upload invoices, warranty cards, manuals

─── PAGE: /inventory/stock ───

View: Summary Cards | Table View

SUMMARY CARDS (grid of item categories):
  Per category: Name | Total Items | In Stock | Low Stock Count (red badge)

TABLE VIEW:
  Item Code | Name | Category | Unit | Current Stock | Min Stock | Status
  Status: Normal (green) | Low (orange) | Out of Stock (red)

Click row → /inventory/stock/:id (item detail)
  Stock transaction history (IN/OUT/ADJUSTMENT with dates and parties)
  "Issue Stock" button → dialog: quantity + issued to (department/staff)
  "Adjust Stock" button (admin only) → set correct quantity + reason

─── PAGE: /inventory/purchases ───

TABS: Requisitions | Purchase Orders | Received (GRNs)

TAB — Requisitions:
  Table: REQ No | Date | Requested by | Reason | Items | Status badge | Actions
  "New Requisition" → form: reason + add items (item picker + quantity per row)
  ADMIN: Approve/Reject buttons per pending request

TAB — Purchase Orders:
  Table: PO No | Date | Supplier | Total Amount | Status badge | Items | Actions
  "Create PO" → form: select supplier + items + prices
    Option: "Create from Requisition" → select approved REQ → auto-populate items
  
  PO Detail page:
    Items table: description | qty | unit price | total | received qty (progress)
    "Mark as Received (GRN)" button → opens GRN form

TAB — Received (GRNs):
  Table: GRN No | Date | PO No | Supplier | Amount | Items Received | Voucher Link
  GRN Detail: per-item received quantities

─── PAGE: /inventory/reports ───

Report cards:

📋 Asset Register
  Filters: Category | Status | Department
  Columns: UID | Name | Purchase Date | Purchase Price | Accumulated Dep | Book Value
  Download: PDF (formal register) | Excel

📊 Depreciation Schedule
  Financial Year selector
  Table: Asset | Category | Purchase Price | Rate | Annual Dep | Monthly Dep | Accumulated Dep | Book Value
  Total row at bottom
  Download: PDF | Excel

📦 Stock Report
  Current stock snapshot of all items
  Highlight: Low Stock in orange, Out of Stock in red
  Download: PDF | Excel

📈 Stock Movement Report
  Item selector + Date range
  Shows: opening stock → all IN/OUT transactions → closing stock

🛒 Purchase History Report
  Date range + Supplier filter
  All GRNs with amounts and linked vouchers
  Download: PDF | Excel

⚠️ Assets Needing Maintenance
  List of assets where next_due maintenance is within 30 days or overdue
  Download: list for maintenance scheduling
```

---

## ══════════════════════════════════════════════
## PHASE 8C TEST PROMPTS
## ══════════════════════════════════════════════

```
Read CLAUDE.md. Run Phase 8C inventory and asset audit. Fix all issues.

════ ASSET TESTS ════

1. ASSET UID GENERATION
   POST /api/inventory/assets (create 3 assets in rapid succession)
   Expected UIDs: AST-2026-0001, AST-2026-0002, AST-2026-0003
   No duplicates (test concurrent creation with Promise.all)

2. QR CODE GENERATION
   POST /api/inventory/assets
   Expected: asset.qr_code_url is populated (not null)
   Open the URL → QR code image renders
   Scan QR code → should link to asset detail page or institution website

3. BOOK VALUE CALCULATION
   Create asset: purchase_price = 50000
   GET asset → book_value = 50000 (initially equals purchase price)
   
   Run depreciation for one year (rate=10%):
   POST /api/inventory/depreciation/calculate for 12 months
   GET asset → book_value = 45000 (50000 - 10% = 5000 annual dep)
   accumulated_dep = 5000

4. DEPRECIATION MATH VERIFICATION (Straight Line Method)
   Asset: purchase_price = ৳1,00,000, useful_life = 10 years
   Annual dep = 1,00,000 / 10 = ৳10,000/year
   Monthly dep = 10,000 / 12 = ৳833.33/month
   
   After Year 1: book_value = ৳90,000
   After Year 5: book_value = ৳50,000
   After Year 10: book_value = ৳0 (fully depreciated, stop depreciating)
   
   Run annual depreciation for 10 years and verify each year's book_value ✅
   Verify: never goes below 0 ✅

5. DEPRECIATION AUTO-JOURNAL
   After running depreciation:
   GET /api/accounts/ledger/5018_id (Depreciation Expense account)
   Expected: debit entry for the total depreciation amount ✅
   
   GET /api/accounts/ledger/1105_id (Accumulated Depreciation)
   Expected: credit entry for the same amount ✅
   
   Both entries in the same voucher ✅

6. DISPOSAL JOURNAL
   Create asset: purchase_price=50000, accumulated_dep=20000, book_value=30000
   Dispose with disposed_value=25000 (sold for ৳25,000 but book value was ৳30,000 = loss)
   
   Expected journal:
   Dr 1001 Cash (25000) — proceeds received
   Dr 5xxx Loss on Disposal (5000) — loss = book_value - sale_price
   Dr 1105 Accumulated Depreciation (20000) — removing accumulated dep
   Cr 1101/1102 Asset Account (50000) — removing the asset at cost
   
   Verify all 4 entries in the auto-created voucher ✅

7. ASSET STATUS AFTER DISPOSAL
   GET /api/inventory/assets/{id} → status = DISPOSED ✅
   Asset NOT shown in active asset count
   Asset NOT included in future depreciation runs ✅

════ INVENTORY/STOCK TESTS ════

8. STOCK TRACKING
   Create item: current_stock=0
   POST /api/inventory/purchase-orders/:id/grn with received_qty=100
   GET /api/inventory/items/:id → current_stock = 100 ✅
   
   POST /api/inventory/stock/issue → quantity=30
   GET /api/inventory/items/:id → current_stock = 70 ✅

9. OVER-ISSUE PREVENTION
   current_stock = 10
   POST /api/inventory/stock/issue with quantity=15
   Expected: 400 error "Insufficient stock. Available: 10, Requested: 15"

10. LOW STOCK ALERT
    Set item minimum_stock=20, current_stock=15 (below minimum)
    GET /api/inventory/stock/low-stock-report
    Expected: this item appears in the report ✅
    
    GET /api/inventory/dashboard
    Expected: "Low Stock Alert: 1" badge shows in stats ✅

11. STOCK TRANSACTION HISTORY
    GET /api/inventory/stock/:item_id/transactions
    Expected: shows IN (from GRN), OUT (from issue), each with running balance
    
    Opening: 0
    After GRN: 100 (balance_after = 100)
    After Issue: 70 (balance_after = 70)
    ✅

════ PURCHASE WORKFLOW TESTS ════

12. FULL PURCHASE FLOW
    REQ-001 → PO-001 → GRN-001
    
    Step 1: Create Requisition (status=PENDING)
    Step 2: Approve Requisition (status=APPROVED)
    Step 3: Create PO from Requisition (status=DRAFT, REQ status=PO_CREATED)
    Step 4: Approve PO (status=APPROVED)
    Step 5: Create GRN (items received)
    
    After GRN: stock incremented ✅
    After GRN: auto-journal created in Accounts module ✅
    After GRN: PO status=RECEIVED (if all qty received) ✅

13. PARTIAL RECEIPT
    PO has 3 items, qty 100 each
    GRN 1: receive 50 of item 1, 50 of item 2
    Expected: PO status=PARTIALLY_RECEIVED ✅
    GRN 2: receive remaining items
    Expected: PO status=RECEIVED ✅

14. PURCHASE → ACCOUNTS JOURNAL
    Create GRN for ৳5,000 worth of stationery
    Expected: auto-journal in Accounts module:
    Dr 5009 Stationery & Office Supplies ৳5,000 → Cr 2001 Accounts Payable ৳5,000
    Check: Accounts Payable account has ৳5,000 credit entry ✅

════ UI TESTS ════

15. ASSET CARD VIEW (/inventory/assets)
    - [ ] Toggle between List/Card view works
    - [ ] Card: photo shown (or placeholder icon if no photo)
    - [ ] Book value formatted correctly: ৳35,000 (with ৳ symbol and commas)
    - [ ] Condition badge colors: Excellent=green, Good=blue, Fair=yellow, Poor=orange, Damaged=red
    - [ ] Status badge: Active=green, Under Repair=orange, Disposed=gray

16. ASSET DETAIL PAGE — DEPRECIATION TAB
    - [ ] Table shows each depreciation period
    - [ ] Book value decreasing correctly
    - [ ] Voucher link: click opens the accounting voucher in Accounts module
    - [ ] "Fully Depreciated" notice when book_value reaches 0

17. STOCK ITEM STATUS COLORS
    - [ ] current_stock > minimum_stock: green "Normal" badge
    - [ ] current_stock <= minimum_stock but > 0: orange "Low Stock" badge
    - [ ] current_stock = 0: red "Out of Stock" badge
    - [ ] Dashboard: Low Stock count shown in red alert badge

18. PURCHASE REQUISITION FORM
    - [ ] Item picker: search by name/code, shows unit and current stock
    - [ ] Quantity input shows unit next to it (e.g. "Ream")
    - [ ] Estimated price input (optional)
    - [ ] Add/remove item rows dynamically
    - [ ] Submit → "Pending Approval" state with timeline shown

19. ASSET REPORT — DEPRECIATION SCHEDULE PDF
    - [ ] Download PDF → opens/downloads correctly
    - [ ] Institution header in PDF
    - [ ] Financial year shown
    - [ ] All assets listed with correct values
    - [ ] Total row at bottom with correct sum
    - [ ] Print-ready formatting (no layout breaks mid-row)

20. RESPONSIVE CHECK
    At 375px (mobile):
    - [ ] Asset list: scrolls horizontally within table (not whole page scroll)
    - [ ] Stat cards: 2×2 grid (not 4 in one row)
    - [ ] Purchase form: single column, item rows stacked

Fix all failures. Report what was fixed.
```

---

## ACCOUNTS + INVENTORY INTEGRATION TEST

```
Read CLAUDE.md. Run the complete Accounts + Inventory integration test.

SCENARIO: One full financial cycle

1. SETUP
   Ensure Phase 8B and 8C are both complete
   Active FinancialYear: 2026-2027
   Chart of Accounts: all default accounts seeded

2. INCOME CYCLE
   Student pays ৳5,000 tuition via bKash
   → Fee module: Invoice marked PAID
   → Auto-journal: Dr 1002 Bank ৳5,000 → Cr 4001 Tuition Income ৳5,000
   
   Check /accounts/ledger/4001 → shows ৳5,000 credit ✅
   Check /accounts/ledger/1002 → shows ৳5,000 debit ✅

3. PURCHASE CYCLE
   Create stationery purchase PO → approve → GRN
   → Inventory: stock increases
   → Auto-journal: Dr 5009 Stationery ৳2,000 → Cr 2001 Accounts Payable ৳2,000
   
   Create manual payment voucher (pay the supplier):
   Dr 2001 Accounts Payable ৳2,000 → Cr 1001 Cash ৳2,000
   Post the voucher
   
   Check /accounts/ledger/2001 → Accounts Payable balance = 0 (Cr 2000 then Dr 2000) ✅

4. PAYROLL CYCLE
   Process payroll for one staff: gross=30,000, TDS=1,500, net=28,500
   Mark payroll as PAID
   → Auto-journal: Dr 5001 Salary Expense 30,000
                   Cr 2002 TDS Payable 1,500
                   Cr 1001/1002 Cash/Bank 28,500
   
   Check /accounts/ledger/5001 → Salary Expense 30,000 debit ✅
   Check /accounts/ledger/2002 → TDS Payable 1,500 credit ✅

5. DEPRECIATION CYCLE
   Run monthly depreciation for one asset
   → Auto-journal: Dr 5018 Depreciation Expense → Cr 1105 Accumulated Depreciation
   
   Check asset.book_value decreased ✅
   Check /accounts/ledger/5018 → depreciation debit entry ✅

6. FINANCIAL STATEMENTS
   GET /api/accounts/reports/trial-balance
   → Total Debits == Total Credits ✅ (if fails: there is a bug)
   
   GET /api/accounts/reports/income-expenditure
   Income: ৳5,000 (tuition fee)
   Expenses: ৳2,000 (stationery) + ৳30,000 (salary) + ৳X (depreciation)
   Surplus/Deficit: 5,000 - 32,000 - X = deficit ✅ (correct for a test scenario)
   
   GET /api/accounts/reports/balance-sheet
   → Total Assets == Total Liabilities + Equity ✅ (fundamental equation — must hold)

PASS criteria:
  ✅ Trial balance balanced
  ✅ Balance sheet equation holds
  ✅ All auto-journals created correctly
  ✅ Ledger entries match manual calculations

If any check fails: there is a bug in the auto-journal logic. Fix it before proceeding.
```

---

## SUMMARY — WHERE THESE PHASES FIT

```
UPDATED PHASE ORDER:

Phase 8    → Fee & Finance (invoices, payment gateways)
             [DONE — already in PHASE_PROMPTS.md]

Phase 8B   → Accounts (double-entry: journals, ledger, trial balance,
             income+expenditure, balance sheet, bank reconciliation, TDS)
             [NEW — use PHASE_8B_ACCOUNTS.md]
             ADD TO CLAUDE.md phase tracker:
             [ ] PHASE 8B — Accounts (double-entry, financial statements)

Phase 8C   → Inventory & Assets (fixed assets, depreciation, consumable stock,
             purchase workflow: REQ→PO→GRN, supplier management)
             [NEW — use this file PHASE_8C_INVENTORY.md]
             ADD TO CLAUDE.md phase tracker:
             [ ] PHASE 8C — Inventory & Assets (depreciation, stock, purchase flow)

Phase 9    → Online Admission (continues as before from PHASE_PROMPTS_PART2.md)
...rest of phases continue as documented

IMPORTANT — Tell Claude Code:
After Phase 8 and before Phase 9, run:
"We are skipping ahead to build Phase 8B and Phase 8C before continuing.
Read PHASE_8B_ACCOUNTS.md and proceed."
Then: "Read PHASE_8C_INVENTORY.md and proceed."
Then continue with Phase 9 from PHASE_PROMPTS_PART2.md.
```

---

## ALSO: Update CLAUDE.md with These Rules

```
Tell Claude Code: "Add these rules to CLAUDE.md immediately:"

════ ACCOUNTS MODULE RULES (add to CLAUDE.md) ════

Every money movement in the system MUST create a journal entry:
  ✅ Fee payment collected → auto-journal via auto-journal.service.ts
  ✅ Payroll paid → auto-journal via auto-journal.service.ts
  ✅ Asset purchased → auto-journal via auto-journal.service.ts
  ✅ Inventory GRN received → auto-journal via auto-journal.service.ts
  ✅ Asset depreciation → auto-journal via depreciation.service.ts
  ✅ Asset disposed → auto-journal via asset.service.ts
  ❌ NEVER manually create vouchers from other modules
  ❌ NEVER bypass auto-journal.service.ts

Double-entry validation:
  Every Voucher's JournalEntries MUST balance: total_debit == total_credit
  This is enforced at API level (400 error if unbalanced)
  Frontend disables Save button if unbalanced

Account codes (system-reserved, never delete or change code):
  1001 = Cash in Hand
  1002 = Cash at Bank  
  2001 = Accounts Payable
  2002 = TDS Payable
  2004 = Salary Payable
  3004 = Surplus/Deficit
  4001 = Tuition Fee Income
  5001 = Salary Expense (Teaching)
  5018 = Depreciation Expense

════ INVENTORY MODULE RULES (add to CLAUDE.md) ════

Stock never goes negative:
  Always validate: quantity_to_issue <= current_stock
  Return 400 if insufficient stock

Asset depreciation:
  Method: Straight Line Method (SLM) by default
  Formula: Annual Dep = Purchase Price × Rate / 100
  Stop depreciating when book_value reaches 0

Purchase workflow:
  Requisition → PO → GRN (mandatory for audit trail)
  GRN is the trigger for: stock increment + auto-journal
  Never add stock without a GRN (except adjustment)

QR codes on assets:
  Every asset gets a QR code on creation
  QR code URL: links to /inventory/assets/{id} (admin) or public asset info page
  Print QR code on asset tag label
```

---
*AshDevs · Education ERP · Phase 8C Inventory & Assets · July 2026*
