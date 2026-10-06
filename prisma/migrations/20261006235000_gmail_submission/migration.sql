-- CreateTable
CREATE TABLE "GmailConnection" (
    "candidateId" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("candidateId")
);

-- CreateTable
CREATE TABLE "GmailAuthorization" (
    "stateHash" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailAuthorization_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "CandidateResume" (
    "candidateId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateResume_pkey" PRIMARY KEY ("candidateId")
);

-- CreateTable
CREATE TABLE "EmailApplicationTarget" (
    "applicationId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidenceUrl" TEXT NOT NULL,
    "evidenceQuote" TEXT NOT NULL,
    "confirmationSource" TEXT NOT NULL DEFAULT 'ADMIN',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailApplicationTarget_pkey" PRIMARY KEY ("applicationId")
);

-- CreateTable
CREATE TABLE "SubmissionAttempt" (
    "applicationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "externalApplicationId" TEXT,

    CONSTRAINT "SubmissionAttempt_pkey" PRIMARY KEY ("applicationId")
);

-- CreateIndex
CREATE INDEX "GmailAuthorization_expiresAt_idx" ON "GmailAuthorization"("expiresAt");

-- CreateIndex
CREATE INDEX "SubmissionAttempt_candidateId_reservedAt_idx" ON "SubmissionAttempt"("candidateId", "reservedAt");

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailAuthorization" ADD CONSTRAINT "GmailAuthorization_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateResume" ADD CONSTRAINT "CandidateResume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailApplicationTarget" ADD CONSTRAINT "EmailApplicationTarget_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

