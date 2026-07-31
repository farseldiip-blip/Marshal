-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "preferredLang" TEXT NOT NULL DEFAULT 'en';
