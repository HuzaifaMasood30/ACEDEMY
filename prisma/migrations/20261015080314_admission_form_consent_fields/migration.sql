-- AlterTable
ALTER TABLE "AdmissionApplication" ADD COLUMN     "consentToContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialClassRequested" BOOLEAN NOT NULL DEFAULT false;
