-- Admission review gets its own status enum so a review outcome is not confused
-- with an enrolment state. The column is cast by name, which is safe because
-- APPLICANT and WITHDRAWN exist in both enums.

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('APPLICANT', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WAITLISTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "AdmissionApplication"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "AdmissionStatus" USING ("status"::text::"AdmissionStatus"),
  ALTER COLUMN "status" SET DEFAULT 'APPLICANT';

-- AddForeignKey
ALTER TABLE "AdmissionApplication"
  ADD CONSTRAINT "AdmissionApplication_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- AddForeignKey
ALTER TABLE "AdmissionApplication"
  ADD CONSTRAINT "AdmissionApplication_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL;
