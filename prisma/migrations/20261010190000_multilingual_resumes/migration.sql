CREATE TABLE "CandidateResumeEnglish" (
    "candidateId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CandidateResumeEnglish_pkey" PRIMARY KEY ("candidateId")
);
ALTER TABLE "CandidateResumeEnglish" ADD CONSTRAINT "CandidateResumeEnglish_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailApplicationTarget" ADD COLUMN "resumeLanguage" TEXT NOT NULL DEFAULT 'PT';
