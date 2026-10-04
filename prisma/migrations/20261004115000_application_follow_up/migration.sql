ALTER TABLE "Application"
ADD COLUMN "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN "lastFollowUpAt" TIMESTAMP(3);
CREATE INDEX "Application_nextFollowUpAt_status_idx" ON "Application"("nextFollowUpAt", "status");
