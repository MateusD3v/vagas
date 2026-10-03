-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RemoteType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DISCOVERED', 'ANALYZED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MatchDecision" AS ENUM ('APPLY', 'REVIEW', 'SKIP');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DISCOVERED', 'ANALYZED', 'READY', 'REVIEW_REQUIRED', 'SUBMITTED', 'FAILED', 'REJECTED', 'INTERVIEW', 'OFFER', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "educationLevel" TEXT,
    "course" TEXT,
    "institution" TEXT,
    "graduationDate" TIMESTAMP(3),
    "professionalSummary" TEXT NOT NULL,
    "yearsOfExperience" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "desiredJobTypes" TEXT[],
    "desiredRoles" TEXT[],
    "desiredLocations" TEXT[],
    "remotePreference" "RemoteType" NOT NULL DEFAULT 'UNSPECIFIED',
    "minimumSalary" DECIMAL(12,2),
    "salaryCurrency" VARCHAR(3),
    "certifications" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSkill" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "yearsOfExperience" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateLanguage" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" TEXT NOT NULL,

    CONSTRAINT "CandidateLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateExperience" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "technologies" TEXT[],
    "achievements" TEXT[],

    CONSTRAINT "CandidateExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPreferences" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "desiredRoles" TEXT[],
    "excludedRoles" TEXT[],
    "desiredTechnologies" TEXT[],
    "preferredLocations" TEXT[],
    "remoteAllowed" BOOLEAN NOT NULL DEFAULT true,
    "hybridAllowed" BOOLEAN NOT NULL DEFAULT true,
    "onsiteAllowed" BOOLEAN NOT NULL DEFAULT false,
    "relocationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "minimumSalary" DECIMAL(12,2),
    "employmentTypes" TEXT[],
    "seniorityLevels" TEXT[],
    "automaticApplicationThreshold" INTEGER NOT NULL DEFAULT 85,
    "reviewThreshold" INTEGER NOT NULL DEFAULT 65,

    CONSTRAINT "JobPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationPolicy" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "autoApplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minimumScore" INTEGER NOT NULL DEFAULT 85,
    "maximumApplicationsPerDay" INTEGER NOT NULL DEFAULT 10,
    "allowedSources" TEXT[],
    "blockedCompanies" TEXT[],
    "blockedKeywords" TEXT[],
    "requireSalaryInformation" BOOLEAN NOT NULL DEFAULT false,
    "requireRemote" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ApplicationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateAnswer" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "answerType" TEXT NOT NULL,
    "allowedForAutomaticUse" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "source" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "remoteType" "RemoteType" NOT NULL DEFAULT 'UNSPECIFIED',
    "employmentType" TEXT,
    "seniority" TEXT,
    "salaryMin" DECIMAL(12,2),
    "salaryMax" DECIMAL(12,2),
    "salaryCurrency" VARCHAR(3),
    "applicationUrl" TEXT,
    "originalUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JobStatus" NOT NULL DEFAULT 'DISCOVERED',
    "rawData" JSONB NOT NULL,
    "requiredEducationLevel" TEXT,
    "requiredCertifications" TEXT[],

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "yearsRequired" DOUBLE PRECISION,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "deterministicScore" INTEGER NOT NULL,
    "aiAdjustment" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL,
    "decision" "MatchDecision" NOT NULL,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "strengths" TEXT[],
    "weaknesses" TEXT[],
    "hardConstraints" TEXT[],
    "reasoning" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "applicationMethod" TEXT NOT NULL DEFAULT 'MANUAL_PREPARATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "externalApplicationId" TEXT,
    "notes" TEXT,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_email_key" ON "CandidateProfile"("email");

-- CreateIndex
CREATE INDEX "CandidateSkill_candidateId_idx" ON "CandidateSkill"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSkill_candidateId_name_key" ON "CandidateSkill"("candidateId", "name");

-- CreateIndex
CREATE INDEX "CandidateLanguage_candidateId_idx" ON "CandidateLanguage"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateLanguage_candidateId_language_key" ON "CandidateLanguage"("candidateId", "language");

-- CreateIndex
CREATE INDEX "CandidateExperience_candidateId_idx" ON "CandidateExperience"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "JobPreferences_candidateId_key" ON "JobPreferences"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationPolicy_candidateId_key" ON "ApplicationPolicy"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateAnswer_candidateId_idx" ON "CandidateAnswer"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateAnswer_candidateId_questionKey_key" ON "CandidateAnswer"("candidateId", "questionKey");

-- CreateIndex
CREATE UNIQUE INDEX "Job_fingerprint_key" ON "Job"("fingerprint");

-- CreateIndex
CREATE INDEX "Job_status_source_idx" ON "Job"("status", "source");

-- CreateIndex
CREATE INDEX "Job_company_idx" ON "Job"("company");

-- CreateIndex
CREATE UNIQUE INDEX "Job_source_externalId_key" ON "Job"("source", "externalId");

-- CreateIndex
CREATE INDEX "JobSkill_jobId_idx" ON "JobSkill"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSkill_jobId_skill_key" ON "JobSkill"("jobId", "skill");

-- CreateIndex
CREATE INDEX "JobMatch_candidateId_decision_idx" ON "JobMatch"("candidateId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_jobId_candidateId_key" ON "JobMatch"("jobId", "candidateId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_jobId_key" ON "Application"("candidateId", "jobId");

-- CreateIndex
CREATE INDEX "AuditLog_event_createdAt_idx" ON "AuditLog"("event", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateLanguage" ADD CONSTRAINT "CandidateLanguage_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPreferences" ADD CONSTRAINT "JobPreferences_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPolicy" ADD CONSTRAINT "ApplicationPolicy_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAnswer" ADD CONSTRAINT "CandidateAnswer_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
