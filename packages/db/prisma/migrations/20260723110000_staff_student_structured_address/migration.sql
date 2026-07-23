-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "address_district" TEXT,
ADD COLUMN     "address_division" TEXT,
ADD COLUMN     "address_house_name" TEXT,
ADD COLUMN     "address_post_code" TEXT,
ADD COLUMN     "address_village" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "permanent_district" TEXT,
ADD COLUMN     "permanent_division" TEXT,
ADD COLUMN     "permanent_house_name" TEXT,
ADD COLUMN     "permanent_post_code" TEXT,
ADD COLUMN     "permanent_village" TEXT,
ADD COLUMN     "present_district" TEXT,
ADD COLUMN     "present_division" TEXT,
ADD COLUMN     "present_house_name" TEXT,
ADD COLUMN     "present_post_code" TEXT,
ADD COLUMN     "present_village" TEXT;

