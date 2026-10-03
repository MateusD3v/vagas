import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProfileTransferService } from '../src/modules/profile/profile-transfer.service.js';

function storedProfile() {
  return {
    id: 'candidate-1',
    fullName: 'Candidate',
    email: 'candidate@example.com',
    phone: '+55 00 00000-0000',
    city: 'Ananindeua',
    state: 'PA',
    country: 'Brasil',
    linkedinUrl: 'https://www.linkedin.com/in/candidate',
    githubUrl: null,
    portfolioUrl: null,
    educationLevel: 'Graduação',
    course: 'Sistemas de Informação',
    institution: 'Universidade',
    graduationDate: new Date('2028-02-01T00:00:00.000Z'),
    professionalSummary: 'Profissional de tecnologia com experiência em suporte e desenvolvimento.',
    isDemo: false,
    yearsOfExperience: 1,
    desiredJobTypes: ['FULL_TIME', 'INTERNSHIP'],
    desiredRoles: ['Analista de Suporte'],
    desiredLocations: ['Belém'],
    remotePreference: 'REMOTE' as const,
    minimumSalary: { toString: () => '2500' },
    salaryCurrency: 'BRL',
    certifications: ['IT Essentials'],
    createdAt: new Date(),
    updatedAt: new Date(),
    skills: [
      {
        id: 'skill-1',
        candidateId: 'candidate-1',
        name: 'Node.js',
        level: 'Intermediário',
        yearsOfExperience: 1,
      },
    ],
    languages: [
      { id: 'lang-1', candidateId: 'candidate-1', language: 'Inglês', level: 'Intermediário' },
    ],
    experiences: [
      {
        id: 'exp-1',
        candidateId: 'candidate-1',
        company: 'Empresa',
        role: 'Estagiário de Desenvolvimento',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        current: true,
        description: 'Desenvolvimento e manutenção de sistemas.',
        technologies: ['Node.js'],
        achievements: [],
      },
    ],
    preferences: {
      id: 'pref-1',
      candidateId: 'candidate-1',
      desiredRoles: ['Analista de Suporte'],
      excludedRoles: ['Senior'],
      desiredTechnologies: ['Node.js'],
      preferredLocations: ['Belém'],
      remoteAllowed: true,
      hybridAllowed: true,
      onsiteAllowed: true,
      relocationAllowed: false,
      minimumSalary: { toString: () => '2500' },
      employmentTypes: ['FULL_TIME'],
      seniorityLevels: ['JUNIOR'],
      automaticApplicationThreshold: 85,
      reviewThreshold: 65,
    },
    policy: {
      id: 'policy-1',
      candidateId: 'candidate-1',
      autoApplyEnabled: false,
      minimumScore: 85,
      maximumApplicationsPerDay: 10,
      allowedSources: [],
      blockedCompanies: [],
      blockedKeywords: [],
      requireSalaryInformation: false,
      requireRemote: false,
    },
    answers: [
      {
        id: 'answer-1',
        candidateId: 'candidate-1',
        questionKey: 'english',
        question: 'Nível de inglês?',
        answer: 'Intermediário',
        answerType: 'TEXT',
        allowedForAutomaticUse: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };
}

const searchProfile = {
  id: 'search-1',
  candidateId: 'candidate-1',
  enabled: true,
  keywords: ['Suporte TI'],
  excludedKeywords: ['Senior'],
  locations: ['Belém'],
  remoteTypes: ['REMOTE'] as const,
  employmentTypes: ['FULL_TIME'],
  seniorityLevels: ['JUNIOR'],
  maxJobsPerRun: 25,
  publishedWithinHours: 336,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ProfileTransferService', () => {
  it('exporta somente dados portáveis e converte salários Decimal para número', async () => {
    const db = {
      candidateProfile: { findFirst: vi.fn().mockResolvedValue(storedProfile()) },
      jobSearchProfile: { findUnique: vi.fn().mockResolvedValue(searchProfile) },
    } as unknown as PrismaClient;

    const bundle = await new ProfileTransferService(db).exportBundle();

    expect(bundle.version).toBe(1);
    expect(bundle.profile.minimumSalary).toBe(2500);
    expect(bundle.profile.preferences.minimumSalary).toBe(2500);
    expect(bundle.profile.skills).toEqual([
      { name: 'Node.js', level: 'Intermediário', yearsOfExperience: 1 },
    ]);
    expect(bundle.searchProfile?.keywords).toEqual(['Suporte TI']);
    expect(bundle.profile).not.toHaveProperty('id');
    expect(bundle.profile.skills[0]).not.toHaveProperty('candidateId');
  });

  it('importa bundle em instalação vazia e recria o perfil de busca', async () => {
    const candidateFindFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const created = storedProfile();
    const candidateCreate = vi.fn().mockResolvedValue(created);
    const searchUpsert = vi.fn().mockResolvedValue(searchProfile);
    const db = {
      candidateProfile: {
        findFirst: candidateFindFirst,
        create: candidateCreate,
      },
      jobSearchProfile: { upsert: searchUpsert },
    } as unknown as PrismaClient;

    const source = await new ProfileTransferService({
      candidateProfile: { findFirst: vi.fn().mockResolvedValue(storedProfile()) },
      jobSearchProfile: { findUnique: vi.fn().mockResolvedValue(searchProfile) },
    } as unknown as PrismaClient).exportBundle();

    const result = await new ProfileTransferService(db).importBundle(source);

    expect(candidateCreate).toHaveBeenCalledOnce();
    expect(searchUpsert).toHaveBeenCalledOnce();
    const upsertCall = searchUpsert.mock.calls[0]?.[0] as {
      where: { candidateId: string };
      create: { candidateId: string; keywords: string[] };
    };
    expect(upsertCall.where.candidateId).toBe('candidate-1');
    expect(upsertCall.create.candidateId).toBe('candidate-1');
    expect(upsertCall.create.keywords).toEqual(['Suporte TI']);
    expect(result).toMatchObject({
      version: 1,
      candidateId: 'candidate-1',
      searchProfileId: 'search-1',
      matchingReady: true,
    });
  });
});
