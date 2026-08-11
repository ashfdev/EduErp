import type { Prisma } from "@education-erp/db";
import { prisma } from "./prisma";
import { documentQueue, DEFAULT_JOB_OPTS } from "./queues";

// Shared dispatch for the large-batch background-job system (Plan Twenty,
// built via Plan Twenty-Six Phase C; generalized here to cover every
// batch-shaped export/document route, not just the original 7 batch-PDF
// kinds). A "kind" is a plain string (e.g. "ID_CARDS_CLASS",
// "STUDENTS_EXPORT") -- any module that owns a batch-exportable resource
// registers its own kind(s) here, once, as a side effect of that module
// being imported. This keeps dispatch decentralized: no module needs to
// import another module's internals just to be reachable from the shared
// worker, and the worker process only needs to import each contributing
// module once (see jobs/document-batch.job.ts) for every kind to resolve.
//
// mimeType defaults to "application/pdf" when omitted, preserving the
// exact behavior of every kind registered before this field existed.
export interface BatchJobResult {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}

export type BatchJobBuilder = (params: Record<string, unknown>) => Promise<BatchJobResult>;

// The one shared row-count threshold every Excel/CSV bulk-export route
// checks before deciding sync vs. async -- deliberately much higher than
// documents.routes.ts's own BATCH_JOB_THRESHOLD (100), which is calibrated
// to Puppeteer's per-page render cost. Building a workbook in memory scales
// very differently (thousands of ExcelJS rows is still fast); this number
// is a documented starting point, not a measured ceiling -- tune it against
// real timing on this codebase's actual data volumes (its largest class is
// ~4,400 students; several reports join across the whole institution) if a
// sync export ever gets close to it in practice.
export const EXCEL_EXPORT_BATCH_THRESHOLD = 1000;

interface BatchJobRegistration {
  build: BatchJobBuilder;
  docType: string;
}

const registry = new Map<string, BatchJobRegistration>();

export function registerBatchJobKind(kind: string, docType: string, build: BatchJobBuilder): void {
  if (registry.has(kind)) {
    throw new Error(`Batch job kind "${kind}" is already registered -- pick a distinct kind string`);
  }
  registry.set(kind, { build, docType });
}

export function getBatchJobBuilder(kind: string): BatchJobBuilder {
  const entry = registry.get(kind);
  if (!entry) throw new Error(`No batch job builder registered for kind "${kind}"`);
  return entry.build;
}

function getDocType(kind: string): string {
  return registry.get(kind)?.docType ?? kind;
}

// `params` is typed as the permissive `object` (not Record<string, unknown>)
// deliberately -- callers pass an already-typed named interface (e.g.
// StudentsExportParams), and TypeScript requires a source type to carry its
// own index signature to satisfy Record<string, unknown> as a call argument
// (unlike a plain assignment, which is lenient) -- `object` has no such
// requirement, so every caller's own params type flows through unchanged,
// with no per-call-site cast needed.
export async function enqueueBatchJob(kind: string, params: object, requestedById: string) {
  const job = await prisma.documentBatchJob.create({
    // Cast, not a real risk -- `undefined` values (e.g. an omitted
    // group_id/section_id) are simply dropped by JSON serialization, same
    // as every other Json-column write in this codebase that starts from a
    // plain params object (e.g. staff.routes.ts's `publications` field).
    data: { job_kind: kind, doc_type: getDocType(kind), params: params as Prisma.InputJsonValue, requested_by_id: requestedById },
  });
  await documentQueue.add("render", { job_id: job.id }, DEFAULT_JOB_OPTS);
  return job;
}
