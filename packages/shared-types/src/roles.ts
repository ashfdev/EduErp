// Mirrors the UserRole enum in apps/core-api/prisma/schema.prisma.
// Kept as a plain union (not imported from @prisma/client) so frontend apps
// don't need the Prisma client as a dependency — see PRD §3 role table.
export const USER_ROLES = [
  'SUPER_ADMIN',
  'INSTITUTION_ADMIN',
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'EXAM_CONTROLLER',
  'HEAD_OF_DEPARTMENT',
  'CLASS_TEACHER',
  'SUBJECT_TEACHER',
  'ACCOUNTANT',
  'LIBRARIAN',
  'TRANSPORT_MANAGER',
  'HOSTEL_MANAGER',
  'IT_ADMIN',
  'STUDENT',
  'GUARDIAN',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, { en: string; bn: string }> = {
  SUPER_ADMIN: { en: 'Super Admin', bn: 'সুপার অ্যাডমিন' },
  INSTITUTION_ADMIN: { en: 'Institution Admin', bn: 'ইনস্টিটিউশন অ্যাডমিন' },
  PRINCIPAL: { en: 'Principal', bn: 'অধ্যক্ষ' },
  VICE_PRINCIPAL: { en: 'Vice Principal', bn: 'সহ-অধ্যক্ষ' },
  EXAM_CONTROLLER: { en: 'Exam Controller', bn: 'পরীক্ষা নিয়ন্ত্রক' },
  HEAD_OF_DEPARTMENT: { en: 'Head of Department', bn: 'বিভাগীয় প্রধান' },
  CLASS_TEACHER: { en: 'Class Teacher', bn: 'শ্রেণি শিক্ষক' },
  SUBJECT_TEACHER: { en: 'Subject Teacher', bn: 'বিষয় শিক্ষক' },
  ACCOUNTANT: { en: 'Accountant', bn: 'হিসাবরক্ষক' },
  LIBRARIAN: { en: 'Librarian', bn: 'গ্রন্থাগারিক' },
  TRANSPORT_MANAGER: { en: 'Transport Manager', bn: 'পরিবহন ব্যবস্থাপক' },
  HOSTEL_MANAGER: { en: 'Hostel Manager', bn: 'হোস্টেল ব্যবস্থাপক' },
  IT_ADMIN: { en: 'IT Admin', bn: 'আইটি অ্যাডমিন' },
  STUDENT: { en: 'Student', bn: 'শিক্ষার্থী' },
  GUARDIAN: { en: 'Guardian', bn: 'অভিভাবক' },
};

export type InstitutionType = 'SCHOOL' | 'COLLEGE' | 'MADRASAH' | 'UNIVERSITY';
