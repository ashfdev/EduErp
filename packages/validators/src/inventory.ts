import { z } from "zod";

export const assetCategorySchema = z.object({
  name: z.string().min(1),
  name_bn: z.string().optional(),
  depreciation_method: z.enum(["STRAIGHT_LINE", "WRITTEN_DOWN_VALUE"]).default("STRAIGHT_LINE"),
  depreciation_rate: z.number().min(0).max(100).default(10),
  useful_life_years: z.number().int().positive().default(10),
  asset_account_id: z.string().optional().nullable(),
  accumulated_dep_account_id: z.string().optional().nullable(),
  dep_expense_account_id: z.string().optional().nullable(),
});

export const assetSchema = z.object({
  category_id: z.string().min(1),
  name: z.string().min(1),
  name_bn: z.string().optional(),
  description: z.string().optional(),
  barcode: z.string().optional().nullable(),
  purchase_date: z.coerce.date(),
  purchase_price: z.number().positive(),
  supplier_id: z.string().optional().nullable(),
  invoice_no: z.string().optional(),
  warranty_expiry: z.coerce.date().optional().nullable(),
  current_location: z.string().optional(),
  department_id: z.string().optional().nullable(),
  assigned_to_staff_id: z.string().optional().nullable(),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"]).default("GOOD"),
  notes: z.string().optional(),
  paid_immediately: z.boolean().default(true),
});

export const assetTransferSchema = z.object({
  to_location: z.string().optional(),
  to_department_id: z.string().optional().nullable(),
  reason: z.string().optional(),
});

export const assetMaintenanceSchema = z.object({
  maintenance_date: z.coerce.date(),
  type: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().min(0).default(0),
  done_by: z.string().optional(),
  next_due: z.coerce.date().optional().nullable(),
});

export const assetDisposeSchema = z.object({
  disposed_reason: z.string().min(1),
  disposed_value: z.number().min(0).default(0),
});

export const depreciationRunSchema = z.object({
  period: z.string().min(1),
  financial_year: z.string().min(1),
});

export const itemCategorySchema = z.object({
  name: z.string().min(1),
  name_bn: z.string().optional(),
});

export const itemSchema = z.object({
  category_id: z.string().min(1),
  name: z.string().min(1),
  name_bn: z.string().optional(),
  unit: z.string().min(1),
  minimum_stock: z.number().min(0).default(0),
  reorder_qty: z.number().min(0).default(0),
  expense_account_id: z.string().optional().nullable(),
});

export const stockIssueSchema = z.object({
  item_id: z.string().min(1),
  quantity: z.number().positive(),
  department_id: z.string().optional().nullable(),
  issued_to_id: z.string().optional().nullable(),
  notes: z.string().optional(),
});

export const stockAdjustSchema = z.object({
  item_id: z.string().min(1),
  new_quantity: z.number().min(0),
  reason: z.string().min(1),
});

export const supplierSchema = z.object({
  name: z.string().min(1),
  name_bn: z.string().optional(),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  nid: z.string().optional(),
  tin: z.string().optional(),
});

export const requisitionSchema = z.object({
  department_id: z.string().optional().nullable(),
  reason: z.string().min(1),
  required_by: z.coerce.date().optional().nullable(),
  items: z
    .array(
      z.object({
        item_id: z.string().optional().nullable(),
        description: z.string().min(1),
        quantity: z.number().positive(),
        estimated_unit_price: z.number().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

export const requisitionRejectSchema = z.object({
  reason: z.string().min(1),
});

export const purchaseOrderSchema = z.object({
  requisition_id: z.string().optional().nullable(),
  supplier_id: z.string().min(1),
  order_date: z.coerce.date(),
  delivery_date: z.coerce.date().optional().nullable(),
  delivery_address: z.string().optional(),
  terms: z.string().optional(),
  items: z
    .array(
      z.object({
        item_id: z.string().optional().nullable(),
        description: z.string().min(1),
        purchase_type: z.enum(["ASSET", "CONSUMABLE"]),
        quantity: z.number().positive(),
        unit: z.string().optional(),
        unit_price: z.number().min(0),
        asset_category_id: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

export const grnSchema = z.object({
  received_date: z.coerce.date(),
  supplier_invoice_no: z.string().optional(),
  remarks: z.string().optional(),
  items: z
    .array(
      z.object({
        po_item_id: z.string().min(1),
        received_qty: z.number().positive(),
        unit_price: z.number().min(0).optional(),
      }),
    )
    .min(1),
});
