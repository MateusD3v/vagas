import type { Prisma, PrismaClient } from '@prisma/client';

export const profileInclude = {
  skills: true,
  languages: true,
  experiences: true,
  preferences: true,
  policy: true,
  answers: true,
} satisfies Prisma.CandidateProfileInclude;

export class ProfileRepository {
  constructor(private readonly db: PrismaClient) {}

  findSingleton() {
    return this.db.candidateProfile.findFirst({
      include: profileInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string) {
    return this.db.candidateProfile.findUnique({ where: { id }, include: profileInclude });
  }
}
