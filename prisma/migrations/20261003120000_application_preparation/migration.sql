CREATE TABLE "ApplicationPreparation" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "reusableAnswers" JSONB NOT NULL,
  "missingInformation" TEXT[] NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApplicationPreparation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationPreparation_applicationId_key"
ON "ApplicationPreparation"("applicationId");

CREATE INDEX "ApplicationPreparation_updatedAt_idx"
ON "ApplicationPreparation"("updatedAt");

ALTER TABLE "ApplicationPreparation"
ADD CONSTRAINT "ApplicationPreparation_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
