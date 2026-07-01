import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('changeme123', 12);

  const tenant = await prisma.tenant.upsert({
    where: { eiin: '999999' },
    update: {},
    create: {
      nameEn: 'AshDevs Demo School',
      nameBn: 'অ্যাশডেভস ডেমো স্কুল',
      shortCode: 'ASH',
      type: 'SCHOOL',
      eiin: '999999',
      board: 'Dhaka',
      country: 'BD',
      currency: 'BDT',
    },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { tenantId_label: { tenantId: tenant.id, label: '2026' } },
    update: {},
    create: {
      tenantId: tenant.id,
      label: '2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
    },
  });

  const shift = await prisma.shift.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Morning' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Morning', startTime: '08:00', endTime: '12:30' },
  });

  const klass = await prisma.class.upsert({
    where: { academicYearId_name: { academicYearId: academicYear.id, name: 'Class 6' } },
    update: {},
    create: { tenantId: tenant.id, academicYearId: academicYear.id, name: 'Class 6', level: 6, order: 6 },
  });

  const section = await prisma.section.upsert({
    where: { classId_name: { classId: klass.id, name: 'A' } },
    update: {},
    create: { classId: klass.id, name: 'A', shiftId: shift.id },
  });

  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.ashdevs.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Demo Admin',
      role: 'INSTITUTION_ADMIN',
      email: 'admin@demo.ashdevs.com',
      passwordHash,
      langPreference: 'bn',
    },
  });

  const demoStudents = [
    { name: 'Rahim Uddin', rollNo: '01' },
    { name: 'Karim Ahmed', rollNo: '02' },
    { name: 'Fatima Begum', rollNo: '03' },
  ];

  for (const [i, s] of demoStudents.entries()) {
    const studentUid = `${tenant.shortCode}-2026-${String(i + 1).padStart(5, '0')}`;
    const existing = await prisma.student.findFirst({ where: { tenantId: tenant.id, studentUid } });
    if (existing) continue;

    const user = await prisma.user.create({
      data: { tenantId: tenant.id, name: s.name, role: 'STUDENT', passwordHash, langPreference: 'bn' },
    });

    await prisma.student.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        studentUid,
        rollNo: s.rollNo,
        classId: klass.id,
        sectionId: section.id,
        status: 'ACTIVE',
      },
    });
  }

  console.log('Seed complete.');
  console.log(`Tenant: ${tenant.nameEn} (${tenant.id})`);
  console.log(`Admin login: admin@demo.ashdevs.com / changeme123`);
  console.log(`Admin user id (needed for JWT tenantId claim during manual testing): ${adminUser.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
