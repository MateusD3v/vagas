-- CreateEnum
CREATE TYPE "JobSourceType" AS ENUM ('API', 'FEED', 'ATS', 'MOCK');

-- CreateEnum
CREATE TYPE "CollectionRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "CollectionErrorType" AS ENUM ('NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT', 'AUTHENTICATION_ERROR', 'INVALID_RESPONSE', 'NORMALIZATION_ERROR', 'SOURCE_UNAVAILABLE', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'PREFILTERED';
ALTER TYPE "JobStatus" ADD VALUE 'REJECTED_BY_PREFILTER';
ALTER TYPE "JobStatus" ADD VALUE 'PENDING_ANALYSIS';
ALTER TYPE "JobStatus" ADD VALUE 'ERROR';
ALTER TYPE "JobStatus" ADD VALUE 'STALE';
ALTER TYPE "JobStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "canonicalFingerprint" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "preliminaryScore" INTEGER;

-- AlterTable
ALTER TABLE "JobMatch" ADD COLUMN     "analysisInputHash" TEXT,
ADD COLUMN     "engineVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "JobSourceType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "baseUrl" TEXT,
    "configuration" JSONB NOT NULL,
    "lastSuccessfulRunAt" TIMESTAMP(3),
    "lastFailedRunAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "cooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSourceReference" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "originalUrl" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSearchProfile" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "keywords" TEXT[],
    "excludedKeywords" TEXT[],
    "locations" TEXT[],
    "remoteTypes" "RemoteType"[],
    "employmentTypes" TEXT[],
    "seniorityLevels" TEXT[],
    "maxJobsPerRun" INTEGER NOT NULL DEFAULT 25,
    "publishedWithinHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "candidateId" TEXT,
    "status" "CollectionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "queriesExecuted" INTEGER NOT NULL DEFAULT 0,
    "jobsFetched" INTEGER NOT NULL DEFAULT 0,
    "jobsInserted" INTEGER NOT NULL DEFAULT 0,
    "jobsDuplicated" INTEGER NOT NULL DEFAULT 0,
    "jobsRejected" INTEGER NOT NULL DEFAULT 0,
    "jobsAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "applyCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "applicationsReady" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionError" (
    "id" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "errorType" "CollectionErrorType" NOT NULL,
    "message" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_slug_key" ON "JobSource"("slug");

-- CreateIndex
CREATE INDEX "JobSource_enabled_type_idx" ON "JobSource"("enabled", "type");

-- CreateIndex
CREATE INDEX "JobSourceReference_jobId_idx" ON "JobSourceReference"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSourceReference_sourceId_externalId_key" ON "JobSourceReference"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSourceReference_sourceId_originalUrl_key" ON "JobSourceReference"("sourceId", "originalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "JobSourceReference_jobId_sourceId_key" ON "JobSourceReference"("jobId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSearchProfile_candidateId_key" ON "JobSearchProfile"("candidateId");

-- CreateIndex
CREATE INDEX "CollectionRun_sourceId_startedAt_idx" ON "CollectionRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "CollectionRun_status_startedAt_idx" ON "CollectionRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "CollectionError_collectionRunId_idx" ON "CollectionError"("collectionRunId");

-- CreateIndex
CREATE INDEX "CollectionError_errorType_createdAt_idx" ON "CollectionError"("errorType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerHeartbeat_workerName_key" ON "WorkerHeartbeat"("workerName");

-- CreateIndex
CREATE UNIQUE INDEX "Job_canonicalFingerprint_key" ON "Job"("canonicalFingerprint");

-- AddForeignKey
ALTER TABLE "JobSourceReference" ADD CONSTRAINT "JobSourceReference_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSourceReference" ADD CONSTRAINT "JobSourceReference_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSearchProfile" ADD CONSTRAINT "JobSearchProfile_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionError" ADD CONSTRAINT "CollectionError_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
