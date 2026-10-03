-- Canonical fingerprints identify possible cross-source duplicates for review,
-- but do not prove that two records are the same opening.
DROP INDEX IF EXISTS "Job_canonicalFingerprint_key";
CREATE INDEX "Job_canonicalFingerprint_idx" ON "Job"("canonicalFingerprint");
