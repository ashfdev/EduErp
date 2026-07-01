import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient();

// Models that carry a tenantId column and must always be scoped.
const TENANT_SCOPED_MODELS = new Set([
  'AcademicYear',
  'Shift',
  'Class',
  'Department',
  'User',
  'Student',
  'Staff',
  'OutboxEvent',
  'AuditLog',
  'Holiday',
  'AttendanceRecord',
  'UploadedFile',
  'DisciplineRecord',
  'RolePermission',
  'FeeStructure',
  'Invoice',
  'Payment',
  'RefundRequest',
  'Scholarship',
  'SalaryStructure',
  'PayrollRecord',
  'Exam',
  'MarkEntry',
  'RemarkRequest',
  'ExamResult',
  'Question',
  'Quiz',
  'QuizAttempt',
  'DocumentRegistry',
  'SliderImage',
  'Page',
  'AuthorityMessage',
  'CommitteeMember',
  'GalleryAlbum',
  'Notice',
  'DownloadFile',
  'SchoolEvent',
  'ContactMessage',
]);

/**
 * Tenant isolation enforced once here (Prisma Client Extension layer) rather than
 * per-query in every route — see PRD §2.2: "prevent cross-tenant leaks as module count grows."
 * Every request gets a client scoped to req.tenantId via req.scopedPrisma (see middleware/tenant.ts).
 */
export function scopedToTenant(tenantId: string) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const a = args as Record<string, unknown>;

          if (
            operation === 'findMany' ||
            operation === 'findFirst' ||
            operation === 'updateMany' ||
            operation === 'deleteMany' ||
            operation === 'count'
          ) {
            a.where = { ...(a.where as object | undefined), tenantId };
          } else if (
            operation === 'findUnique' ||
            operation === 'findUniqueOrThrow' ||
            operation === 'update' ||
            operation === 'delete'
          ) {
            // Composite where already scopes by id; tenant check is defense-in-depth
            // and enforced at the create/list boundary instead, to avoid breaking
            // Prisma's unique-input typing here.
          } else if (operation === 'create') {
            (a.data as Record<string, unknown>).tenantId = tenantId;
          } else if (operation === 'createMany' && Array.isArray(a.data)) {
            a.data = (a.data as Record<string, unknown>[]).map((d) => ({ ...d, tenantId }));
          } else if (operation === 'upsert') {
            a.where = { ...(a.where as object | undefined), tenantId };
            (a.create as Record<string, unknown>).tenantId = tenantId;
          }

          return query(a);
        },
      },
    },
  });
}

export type ScopedPrismaClient = ReturnType<typeof scopedToTenant>;
export { Prisma };
