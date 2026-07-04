-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('DEBIT_NORMAL', 'CREDIT_NORMAL');

-- CreateEnum
CREATE TYPE "BalanceType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('RECEIPT', 'PAYMENT', 'JOURNAL', 'CONTRA', 'DEBIT_NOTE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('DRAFT', 'APPROVED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ReconcileStatus" AS ENUM ('PENDING', 'RECONCILED');

-- CreateEnum
CREATE TYPE "ReconcileItemType" AS ENUM ('IN_BOOK_NOT_BANK', 'IN_BANK_NOT_BOOK');

-- CreateEnum
CREATE TYPE "ChequeType" AS ENUM ('ISSUED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('TDS', 'VAT');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'WRITTEN_DOWN_VALUE');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'UNDER_REPAIR', 'DISPOSED', 'LOST', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "StockTxnType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "ReqStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PO_CREATED');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT_TO_SUPPLIER', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('ASSET', 'CONSUMABLE');

-- CreateTable
CREATE TABLE "AccountGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "account_group_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "account_nature" "AccountNature" NOT NULL,
    "is_bank_account" BOOLEAN NOT NULL DEFAULT false,
    "is_cash_account" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "opening_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opening_balance_type" "BalanceType" NOT NULL DEFAULT 'DEBIT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch_name" TEXT,
    "account_number" TEXT NOT NULL,
    "account_title" TEXT NOT NULL,
    "current_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "voucher_no" TEXT NOT NULL,
    "voucher_type" "VoucherType" NOT NULL,
    "financial_year_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "narration" TEXT NOT NULL,
    "narration_bn" TEXT,
    "reference_no" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "is_auto" BOOLEAN NOT NULL DEFAULT false,
    "attachment_url" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "voucher_id" TEXT NOT NULL,
    "debit_account_id" TEXT,
    "credit_account_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "narration" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "financial_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "statement_balance" DOUBLE PRECISION NOT NULL,
    "book_balance" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "status" "ReconcileStatus" NOT NULL DEFAULT 'PENDING',
    "reconciled_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationItem" (
    "id" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "voucher_id" TEXT,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "item_type" "ReconcileItemType" NOT NULL,
    "is_reconciled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReconciliationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChequeEntry" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "voucher_id" TEXT,
    "cheque_no" TEXT NOT NULL,
    "cheque_date" DATE NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "cheque_type" "ChequeType" NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'PENDING',
    "cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChequeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxEntry" (
    "id" TEXT NOT NULL,
    "voucher_id" TEXT NOT NULL,
    "tax_type" "TaxType" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "base_amount" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL,
    "payee" TEXT,
    "period" TEXT,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "challan_no" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAccountMapping" (
    "id" TEXT NOT NULL,
    "category" "FeeCategory" NOT NULL,
    "account_id" TEXT NOT NULL,

    CONSTRAINT "FeeAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "depreciation_method" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "depreciation_rate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "useful_life_years" INTEGER NOT NULL DEFAULT 10,
    "asset_account_id" TEXT,
    "accumulated_dep_account_id" TEXT,
    "dep_expense_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "asset_uid" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "description" TEXT,
    "barcode" TEXT,
    "qr_code_url" TEXT,
    "purchase_date" DATE NOT NULL,
    "purchase_price" DOUBLE PRECISION NOT NULL,
    "supplier_id" TEXT,
    "invoice_no" TEXT,
    "warranty_expiry" DATE,
    "current_location" TEXT,
    "department_id" TEXT,
    "assigned_to_staff_id" TEXT,
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "accumulated_dep" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "book_value" DOUBLE PRECISION NOT NULL,
    "photo_url" TEXT,
    "notes" TEXT,
    "purchase_grn_item_id" TEXT,
    "disposed_at" TIMESTAMP(3),
    "disposed_reason" TEXT,
    "disposed_value" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationEntry" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "opening_value" DOUBLE PRECISION NOT NULL,
    "dep_rate" DOUBLE PRECISION NOT NULL,
    "dep_amount" DOUBLE PRECISION NOT NULL,
    "closing_value" DOUBLE PRECISION NOT NULL,
    "voucher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepreciationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMaintenance" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "maintenance_date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "done_by" TEXT,
    "next_due" DATE,
    "voucher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTransfer" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "from_location" TEXT,
    "to_location" TEXT,
    "from_department_id" TEXT,
    "to_department_id" TEXT,
    "transferred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferred_by_id" TEXT,
    "reason" TEXT,

    CONSTRAINT "AssetTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "unit" TEXT NOT NULL,
    "current_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimum_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorder_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expense_account_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "transaction_type" "StockTxnType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION,
    "total_value" DOUBLE PRECISION,
    "balance_after" DOUBLE PRECISION NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "department_id" TEXT,
    "issued_to_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "nid" TEXT,
    "tin" TEXT,
    "account_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisition" (
    "id" TEXT NOT NULL,
    "req_no" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "department_id" TEXT,
    "reason" TEXT NOT NULL,
    "req_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "required_by" DATE,
    "status" "ReqStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionItem" (
    "id" TEXT NOT NULL,
    "requisition_id" TEXT NOT NULL,
    "item_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "estimated_unit_price" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "RequisitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "po_no" TEXT NOT NULL,
    "requisition_id" TEXT,
    "supplier_id" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "delivery_date" DATE,
    "delivery_address" TEXT,
    "terms" TEXT,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "item_id" TEXT,
    "description" TEXT NOT NULL,
    "purchase_type" "PurchaseType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,
    "asset_category_id" TEXT,
    "received_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceivedNote" (
    "id" TEXT NOT NULL,
    "grn_no" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "received_date" DATE NOT NULL,
    "received_by_id" TEXT NOT NULL,
    "supplier_invoice_no" TEXT,
    "remarks" TEXT,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "voucher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceivedNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GRNItem" (
    "id" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "po_item_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ordered_qty" DOUBLE PRECISION NOT NULL,
    "received_qty" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,
    "asset_id" TEXT,

    CONSTRAINT "GRNItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_account_group_id_idx" ON "Account"("account_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_account_id_key" ON "BankAccount"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_voucher_no_key" ON "Voucher"("voucher_no");

-- CreateIndex
CREATE INDEX "Voucher_date_idx" ON "Voucher"("date");

-- CreateIndex
CREATE INDEX "Voucher_voucher_type_idx" ON "Voucher"("voucher_type");

-- CreateIndex
CREATE INDEX "Voucher_financial_year_id_idx" ON "Voucher"("financial_year_id");

-- CreateIndex
CREATE INDEX "Voucher_reference_type_reference_id_idx" ON "Voucher"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "JournalEntry_voucher_id_idx" ON "JournalEntry"("voucher_id");

-- CreateIndex
CREATE INDEX "JournalEntry_debit_account_id_idx" ON "JournalEntry"("debit_account_id");

-- CreateIndex
CREATE INDEX "JournalEntry_credit_account_id_idx" ON "JournalEntry"("credit_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialYear_label_key" ON "FinancialYear"("label");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_budget_id_account_id_key" ON "BudgetLine"("budget_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_bank_account_id_month_year_key" ON "BankReconciliation"("bank_account_id", "month", "year");

-- CreateIndex
CREATE INDEX "TaxEntry_voucher_id_idx" ON "TaxEntry"("voucher_id");

-- CreateIndex
CREATE UNIQUE INDEX "FeeAccountMapping_category_key" ON "FeeAccountMapping"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_asset_uid_key" ON "Asset"("asset_uid");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_barcode_key" ON "Asset"("barcode");

-- CreateIndex
CREATE INDEX "Asset_category_id_idx" ON "Asset"("category_id");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationEntry_asset_id_period_key" ON "DepreciationEntry"("asset_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Item_item_code_key" ON "Item"("item_code");

-- CreateIndex
CREATE INDEX "Item_category_id_idx" ON "Item"("category_id");

-- CreateIndex
CREATE INDEX "StockTransaction_item_id_created_at_idx" ON "StockTransaction"("item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_req_no_key" ON "PurchaseRequisition"("req_no");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_po_no_key" ON "PurchaseOrder"("po_no");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_requisition_id_key" ON "PurchaseOrder"("requisition_id");

-- CreateIndex
CREATE INDEX "PurchaseItem_po_id_idx" ON "PurchaseItem"("po_id");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceivedNote_grn_no_key" ON "GoodsReceivedNote"("grn_no");

-- CreateIndex
CREATE INDEX "GRNItem_grn_id_idx" ON "GRNItem"("grn_id");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_account_group_id_fkey" FOREIGN KEY ("account_group_id") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_financial_year_id_fkey" FOREIGN KEY ("financial_year_id") REFERENCES "FinancialYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_financial_year_id_fkey" FOREIGN KEY ("financial_year_id") REFERENCES "FinancialYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "BankReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeEntry" ADD CONSTRAINT "ChequeEntry_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_accumulated_dep_account_id_fkey" FOREIGN KEY ("accumulated_dep_account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_dep_expense_account_id_fkey" FOREIGN KEY ("dep_expense_account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assigned_to_staff_id_fkey" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationEntry" ADD CONSTRAINT "DepreciationEntry_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenance" ADD CONSTRAINT "AssetMaintenance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ItemCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionItem" ADD CONSTRAINT "RequisitionItem_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "PurchaseRequisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionItem" ADD CONSTRAINT "RequisitionItem_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "PurchaseRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNItem" ADD CONSTRAINT "GRNItem_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "GoodsReceivedNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

