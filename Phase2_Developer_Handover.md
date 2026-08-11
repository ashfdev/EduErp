# Phase 2 Expansion: Developer Handover Report

This document outlines the architectural updates and API requirements for the 8 new modules being introduced to EduERP. The database schema (`packages/db/prisma/schema.prisma`) has already been updated with all necessary models and relationships. Your task is to implement the backend APIs and frontend UIs for these modules.

---

## 1. HR: Staff Advance Management
**Purpose**: Track salary advances (loans) given to staff and automatically deduct EMIs from their monthly payroll.

### Database Updates (Already Complete)
- `StaffAdvance` model added (fields: `amount`, `amount_cleared`, `monthly_emi`, `status`).
- `AdvanceStatus` enum (`PENDING`, `PARTIAL`, `CLEARED`).

### Backend Tasks
- **CRUD APIs (`server/api/src/modules/hr/advance.routes.ts`)**:
  - `POST /` - Apply for advance.
  - `GET /` - List all advances (filter by staff, status).
  - `PATCH /:id` - Approve/Update advance details (EMI amount).
- **Payroll Integration (`server/api/src/modules/hr/payroll.routes.ts`)**:
  - **`POST /calculate`**: Calculate pending advances for the processed staff and return a warning flag `has_pending_advance` if `pendingAdvanceCount > 0`.
  - **`POST /finalize`**: Inside the transaction, if `record.advance_deducted > 0`, query the staff's earliest uncleared `StaffAdvance` and add `advance_deducted` to `amount_cleared`. If `amount_cleared >= amount`, flip status to `CLEARED`.

### Frontend Tasks
- **UI**: Create "Advance/Loan" tab in HR module for admins to approve loans and set EMI.
- **Payslip UI**: Show warning if a staff has uncleared advances during the Draft calculation phase.

---

## 2. HR: Provident Fund (PF) Management
**Purpose**: Track staff PF balances and individual monthly contributions.

### Database Updates (Already Complete)
- `ProvidentFund` model added (linked to `Staff`).
- `PFTransaction` model added (linked to `ProvidentFund` and optionally `PayrollRecord`).
- `PFTransactionType` enum (`CONTRIBUTION`, `WITHDRAWAL`).

### Backend Tasks
- **CRUD APIs (`server/api/src/modules/hr/pf.routes.ts`)**:
  - `GET /:staff_id` - Get total PF balance and transaction history.
  - `POST /withdraw` - Process a manual withdrawal.
- **Payroll Integration (`server/api/src/modules/hr/payroll.routes.ts`)**:
  - **`POST /finalize`**: If `record.provident_fund > 0` (deducted from salary), automatically create a `PFTransaction` (`type = CONTRIBUTION`) linked to this `PayrollRecord` and increment `ProvidentFund.total_balance`.

---

## 3. HR: Tax (TDS) Deduction
**Purpose**: Track monthly tax deductions from staff payroll.

### Database Updates (Already Complete)
- `TaxDeduction` model added (links `Staff` and `PayrollRecord`).

### Backend Tasks
- **Payroll Integration**: In `POST /finalize`, if `record.tax > 0`, insert a row into `TaxDeduction`.

---

## 4. HR: Salary Increment History
**Purpose**: Keep an audit log of when a staff's salary was increased.

### Database Updates (Already Complete)
- `SalaryIncrement` model added.

### Backend Tasks
- **API (`server/api/src/modules/hr/staff.routes.ts`)**:
  - When updating a `Staff` member's `basic` or `salary_structure_id` (resulting in a higher gross salary), intercept the change and create a `SalaryIncrement` record logging the old vs new amount and effective date.

---

## 5. HR: Leave Encashment
**Purpose**: Payout for unused paid leaves at the end of the year.

### Database Updates (Already Complete)
- `LeaveEncashment` model added.

### Backend Tasks
- **API (`server/api/src/modules/hr/leave.routes.ts`)**:
  - `POST /encash`: Calculate total unused allowed leaves for a staff member for the given year. Multiply by per-day salary rate, create a `LeaveEncashment` record, and (optionally) generate an Accounting `Voucher` for the payout.

---

## 6. Academic: Sibling Management & Auto Waivers
**Purpose**: Group siblings together and apply automatic fee discounts.

### Database Updates (Already Complete)
- `SiblingGroup` model added (`auto_waiver_percentage`).
- `Student.sibling_group_id` foreign key added.

### Backend Tasks
- **CRUD APIs (`server/api/src/modules/admission/sibling.routes.ts`)**:
  - API to link two or more `Student` IDs into a `SiblingGroup` and define the discount percentage.
- **Fee Generation Integration (`server/api/src/modules/fees/invoice-helpers.ts`)**:
  - In `createMonthlyInvoiceIfMissing`, check if the student belongs to a `SiblingGroup` with `auto_waiver_percentage > 0`. If yes, automatically create a `StudentWaiver` (or apply the discount directly to the generated `Invoice` line items).

---

## 7. Academic: Alumni Directory
**Purpose**: Track graduated students.

### Database Updates (Already Complete)
- `AlumniProfile` model added (linked to `Student`).

### Backend Tasks
- **API**:
  - When a student's `status` changes to `GRADUATED`, prompt the admin to fill out the `AlumniProfile` (graduation year, profession, etc).
  - `GET /alumni` - Public or admin-facing directory endpoint.

---

## 8. Inventory: Reorder Alerts
**Purpose**: Warn admins when stock is critically low.

### Database Updates (Already Complete)
- `reorder_level` integer added to existing `Item` model.

### Backend Tasks
- **API (`server/api/src/modules/inventory/inventory.routes.ts`)**:
  - `GET /alerts`: Query `Item` where current computed stock (Total GRN minus Total Issue) is `<= reorder_level`.
- **Frontend UI**: Show a notification badge on the Inventory dashboard based on the `/alerts` count.
