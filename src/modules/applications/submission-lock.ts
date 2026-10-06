import type { Prisma } from '@prisma/client';

export async function lockCandidateSubmissions(
  tx: Prisma.TransactionClient,
  candidateId: string,
): Promise<void> {
  // A real row lock serializes budget reservations across API, cron and worker processes.
  await tx.$queryRaw`SELECT "id" FROM "CandidateProfile" WHERE "id" = ${candidateId} FOR UPDATE`;
}
