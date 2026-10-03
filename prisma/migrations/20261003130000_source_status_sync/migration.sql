ALTER TABLE "JobSourceReference"
ADD COLUMN "statusCheckedAt" TIMESTAMP(3),
ADD COLUMN "externalStatus" TEXT;

CREATE INDEX "JobSourceReference_statusCheckedAt_idx"
ON "JobSourceReference"("statusCheckedAt");
