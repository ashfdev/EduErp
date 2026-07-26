import { PrismaClient } from "@education-erp/db";

const prisma = new PrismaClient();

async function main() {
  await prisma.institutionProfile.updateMany({
    data: {
      primary_color: "#270082",
      secondary_color: "#f15a25",
    },
  });
  console.log("Colors updated!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
