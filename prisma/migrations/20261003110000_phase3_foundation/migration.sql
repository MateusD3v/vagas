ALTER TABLE "JobSource"
ADD COLUMN "keywordCursor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CandidateProfile"
ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

UPDATE "CandidateProfile"
SET "isDemo" = true
WHERE "email" = 'candidato@example.test';
