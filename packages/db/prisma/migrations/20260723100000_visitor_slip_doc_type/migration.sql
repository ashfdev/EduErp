-- Real, downloadable Visitor Slip PDF for Gate Pass (Plan Thirteen, Phase O)
-- — same standard renderDocument/DocumentType pipeline every other doc type
-- already uses, not a one-off report.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'VISITOR_SLIP';
