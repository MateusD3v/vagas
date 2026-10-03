import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProfileService } from '../src/modules/profile/profile.service.js';

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    fullName: 'Mateus Teste',
    email: 'mateus@example.test',
    phone: null,
    city: null,
    state: 'PA',
    country: 'Brasil',
    linkedinUrl: null,
    githubUrl: 'https://github.com/example',
    portfolioUrl: null,
    educationLevel: 'GRADUACAO_EM_ANDAMENTO',
    course: 'Sistemas de Informação',
    institution: null,
    graduationDate: null,
    professionalSummary: 'Resumo profissional suficientemente completo.',
    isDemo: false,
    yearsOfExperience: 1,
    desiredJobTypes: [],
    desiredRoles: [],
    desiredLocations: [],
    remotePreference: 'REMOTE',
    minimumSalary: null,
    salaryCurrency: 'BRL',
    certifications: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    skills: [
      {
        id: 'skill-1',
        candidateId: 'candidate-1',
        name: 'Node.js',
        level: 'JUNIOR',
        yearsOfExperience: 1,
      },
    ],
    languages: [],
    experiences: [{ id: 'exp-1' }],
    preferences: { id: 'pref-1' },
    policy: null,
    answers: [],
    ...overrides,
  };
}
describe('ProfileService readiness', () => {
  it('marca matching e coleta como prontos quando base mínima existe', async () => {
    const db = {
      candidateProfile: { findFirst: vi.fn().mockResolvedValue(profile()) },
      jobSearchProfile: {
        findUnique: vi.fn().mockResolvedValue({
          candidateId: 'candidate-1',
          enabled: true,
          keywords: ['suporte', 'backend'],
        }),
      },
    } as unknown as PrismaClient;

    const result = await new ProfileService(db).readiness();

    expect(result.matchingReady).toBe(true);
    expect(result.collectionReady).toBe(true);
    expect(result.blocking).toEqual([]);
    expect(result.recommended).toEqual(
      expect.arrayContaining([
        'Telefone não informado',
        'Cidade/estado não informados',
        'LinkedIn não informado',
        'Instituição de ensino não informada',
        'Data prevista de conclusão não informada',
        'Nenhuma resposta reutilizável cadastrada',
      ]),
    );
  });
  it('explica bloqueios quando perfil ainda não está operacional', async () => {
    const db = {
      candidateProfile: {
        findFirst: vi.fn().mockResolvedValue(
          profile({
            isDemo: true,
            skills: [],
            experiences: [],
            preferences: null,
          }),
        ),
      },
      jobSearchProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const result = await new ProfileService(db).readiness();

    expect(result.matchingReady).toBe(false);
    expect(result.collectionReady).toBe(false);
    expect(result.blocking).toEqual(
      expect.arrayContaining([
        'Perfil ainda é de demonstração',
        'Nenhuma competência cadastrada',
        'Nenhuma experiência cadastrada',
        'Preferências de vaga não configuradas',
        'Perfil de busca não configurado ou sem keywords',
      ]),
    );
  });
});
