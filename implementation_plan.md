# Phase 2 Expansion: Code Implementation Plan

Since the database schema is ready, the next step is to build the actual Backend APIs and integrate them with the existing modules (Payroll, Fees, etc.). Building 8 large modules all at once is risky and error-prone, so I have broken the implementation down into manageable sub-phases.

## Sub-Phase 2.1: HR Core (Staff Advance & Provident Fund)
**Goal:** Implement loan management and PF tracking, integrating them directly into the Payroll Finalization logic.

### 1. `Staff Advance` API
- **New Router:** `server/api/src/modules/hr/advance.routes.ts`
  - `POST /` - Apply for / register an advance loan.
  - `GET /` - List staff advances.
  - `PATCH /:id` - Update status/EMI amount.
- **Integration (`payroll.routes.ts`)**:
  - `POST /calculate`: Add warning if staff have uncleared (`PENDING`/`PARTIAL`) advances.
  - `POST /finalize`: Query uncleared advances. If `record.advance_deducted > 0`, update `amount_cleared` and flip `status` if fully paid.

### 2. `Provident Fund` API
- **New Router:** `server/api/src/modules/hr/pf.routes.ts`
  - `GET /:staff_id` - View total PF balance and transaction history.
  - `POST /withdraw` - Process a manual withdrawal (`PFTransaction` type `WITHDRAWAL`).
- **Integration (`payroll.routes.ts`)**:
  - `POST /finalize`: If `record.provident_fund > 0`, automatically create a `CONTRIBUTION` transaction and increment the `ProvidentFund.total_balance`.

## Future Sub-Phases
Once Sub-Phase 2.1 is approved, tested, and complete, we will move on to:
- **Sub-Phase 2.2**: HR (Tax Deduction, Salary Increments, Leave Encashment).
- **Sub-Phase 2.3**: Academic (Alumni Directory, Sibling Auto-Waivers).
- **Sub-Phase 2.4**: Inventory (Reorder Alerts).

## User Review Required
> [!IMPORTANT]
> To ensure code quality and prevent server crashes, I strongly recommend implementing these one sub-phase at a time. Do you approve starting with **Sub-Phase 2.1 (Staff Advance & PF)** right now?

## Verification Plan
- `npx tsc --noEmit` after building the routes.
- Manual verification of the Payroll calculation and finalize flows.
