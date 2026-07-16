-- Real seat-plan PDF document type (Phase 80) — replaces the ad-hoc
-- renderSimpleReport() path with the standard, admin-customizable
-- template pipeline (same one every other DocumentType already uses).
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SEAT_PLAN';
