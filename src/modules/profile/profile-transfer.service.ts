import type { PrismaClient } from '@prisma/client';
import { ProfileService } from './profile.service.js';
import type { ProfileTransferBundle } from './profile-transfer.schemas.js';

function decimalToNumber(value: { toString(): string } | null): number | null {
  return value === null ? null : Number(value.toString());
}

export class ProfileTransferService {
  private readonly profiles: ProfileService;

  constructor(private readonly db: PrismaClient) {
    this.profiles = new ProfileService(db);
  }

  async exportBundle(): Promise<ProfileTransferBundle> {
    const profile = await this.profiles.get();
    const searchProfile = await this.db.jobSearchProfile.findUnique({
      where: { candidateId: profile.id },
    });

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        city: profile.city,
        state: profile.state,
        country: profile.country,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        educationLevel: profile.educationLevel,
        course: profile.course,
        institution: profile.institution,
        graduationDate: profile.graduationDate,
        professionalSummary: profile.professionalSummary,
        yearsOfExperience: profile.yearsOfExperience,
        desiredJobTypes: profile.desiredJobTypes,
        desiredRoles: profile.desiredRoles,
        desiredLocations: profile.desiredLocations,
        remotePreference: profile.remotePreference,
        minimumSalary: decimalToNumber(profile.minimumSalary),
        salaryCurrency: profile.salaryCurrency,
        certifications: profile.certifications,
        skills: profile.skills.map((skill) => ({
          name: skill.name,
          level: skill.level,
          yearsOfExperience: skill.yearsOfExperience,
        })),
        languages: profile.languages.map((language) => ({
          language: language.language,
          level: language.level,
        })),
        experiences: profile.experiences.map((experience) => ({
          company: experience.company,
          role: experience.role,
          startDate: experience.startDate,
          endDate: experience.endDate,
          current: experience.current,
          description: experience.description,
          technologies: experience.technologies,
          achievements: experience.achievements,
        })),
        preferences: {
          desiredRoles: profile.preferences?.desiredRoles ?? [],
          excludedRoles: profile.preferences?.excludedRoles ?? [],
          desiredTechnologies: profile.preferences?.desiredTechnologies ?? [],
          preferredLocations: profile.preferences?.preferredLocations ?? [],
          remoteAllowed: profile.preferences?.remoteAllowed ?? true,
          hybridAllowed: profile.preferences?.hybridAllowed ?? true,
          onsiteAllowed: profile.preferences?.onsiteAllowed ?? false,
          relocationAllowed: profile.preferences?.relocationAllowed ?? false,
          minimumSalary: decimalToNumber(profile.preferences?.minimumSalary ?? null),
          employmentTypes: profile.preferences?.employmentTypes ?? [],
          seniorityLevels: profile.preferences?.seniorityLevels ?? [],
          automaticApplicationThreshold: profile.preferences?.automaticApplicationThreshold ?? 85,
          reviewThreshold: profile.preferences?.reviewThreshold ?? 65,
        },
        ...(profile.policy
          ? {
              policy: {
                autoApplyEnabled: profile.policy.autoApplyEnabled,
                minimumScore: profile.policy.minimumScore,
                maximumApplicationsPerDay: profile.policy.maximumApplicationsPerDay,
                allowedSources: profile.policy.allowedSources,
                blockedCompanies: profile.policy.blockedCompanies,
                blockedKeywords: profile.policy.blockedKeywords,
                requireSalaryInformation: profile.policy.requireSalaryInformation,
                requireRemote: profile.policy.requireRemote,
              },
            }
          : {}),
        answers: profile.answers.map((answer) => ({
          questionKey: answer.questionKey,
          question: answer.question,
          answer: answer.answer,
          answerType: answer.answerType,
          allowedForAutomaticUse: answer.allowedForAutomaticUse,
        })),
      },
      searchProfile: searchProfile
        ? {
            enabled: searchProfile.enabled,
            keywords: searchProfile.keywords,
            excludedKeywords: searchProfile.excludedKeywords,
            locations: searchProfile.locations,
            remoteTypes: searchProfile.remoteTypes,
            employmentTypes: searchProfile.employmentTypes,
            seniorityLevels: searchProfile.seniorityLevels,
            maxJobsPerRun: searchProfile.maxJobsPerRun,
            publishedWithinHours: searchProfile.publishedWithinHours,
          }
        : null,
    };
  }

  async importBundle(bundle: ProfileTransferBundle) {
    const current = await this.db.candidateProfile.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const profile = current
      ? await this.profiles.replace(bundle.profile)
      : await this.profiles.create(bundle.profile);

    const searchProfile = bundle.searchProfile
      ? await this.db.jobSearchProfile.upsert({
          where: { candidateId: profile.id },
          create: { ...bundle.searchProfile, candidateId: profile.id },
          update: bundle.searchProfile,
        })
      : null;

    return {
      version: 1,
      importedAt: new Date().toISOString(),
      candidateId: profile.id,
      searchProfileId: searchProfile?.id ?? null,
      matchingReady: !profile.isDemo && profile.skills.length > 0 && Boolean(profile.preferences),
    };
  }
}
