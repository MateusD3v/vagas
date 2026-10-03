import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/http.js';
import type { ProfileCreateInput, ProfilePatchInput } from './profile.schemas.js';
import { ProfileRepository, profileInclude } from './profile.repository.js';

function scalarProfile(input: ProfilePatchInput) {
  const { skills, languages, experiences, preferences, policy, answers, ...scalar } = input;
  return { scalar, skills, languages, experiences, preferences, policy, answers };
}

export class ProfileService {
  private readonly repository: ProfileRepository;

  constructor(private readonly db: PrismaClient) {
    this.repository = new ProfileRepository(db);
  }

  async get() {
    const profile = await this.repository.findSingleton();
    if (!profile) throw new AppError('Perfil ainda não cadastrado', 404);
    return profile;
  }

  async readiness() {
    const profile = await this.get();
    const searchProfile = await this.db.jobSearchProfile.findUnique({
      where: { candidateId: profile.id },
    });

    const blocking: string[] = [];
    if (profile.isDemo) blocking.push('Perfil ainda é de demonstração');
    if (!profile.skills.length) blocking.push('Nenhuma competência cadastrada');
    if (!profile.experiences.length) blocking.push('Nenhuma experiência cadastrada');
    if (!profile.preferences) blocking.push('Preferências de vaga não configuradas');
    if (!searchProfile?.enabled || !searchProfile.keywords.length) {
      blocking.push('Perfil de busca não configurado ou sem keywords');
    }

    const recommended: string[] = [];
    if (!profile.phone) recommended.push('Telefone não informado');
    if (!profile.city || !profile.state) recommended.push('Cidade/estado não informados');
    if (!profile.linkedinUrl) recommended.push('LinkedIn não informado');
    if (!profile.institution) recommended.push('Instituição de ensino não informada');
    if (!profile.graduationDate) recommended.push('Data prevista de conclusão não informada');
    if (!profile.answers.length) recommended.push('Nenhuma resposta reutilizável cadastrada');

    return {
      candidateId: profile.id,
      isDemo: profile.isDemo,
      matchingReady: !profile.isDemo && profile.skills.length > 0 && Boolean(profile.preferences),
      collectionReady:
        !profile.isDemo &&
        Boolean(searchProfile?.enabled) &&
        Boolean(searchProfile?.keywords.length),
      blocking,
      recommended,
    };
  }

  async create(input: ProfileCreateInput) {
    if (await this.repository.findSingleton()) {
      throw new AppError('Esta instalação já possui um perfil; use PUT ou PATCH', 409);
    }
    const { skills, languages, experiences, preferences, policy, answers, ...scalar } = input;
    return this.db.candidateProfile.create({
      data: {
        ...scalar,
        skills: { create: skills },
        languages: { create: languages },
        experiences: { create: experiences },
        preferences: { create: preferences },
        ...(policy ? { policy: { create: policy } } : {}),
        answers: { create: answers },
      },
      include: profileInclude,
    });
  }

  async replace(input: ProfileCreateInput) {
    const current = await this.get();
    return this.updateRelations(current.id, input);
  }

  async patch(input: ProfilePatchInput) {
    const current = await this.get();
    return this.updateRelations(current.id, input);
  }

  private async updateRelations(id: string, input: ProfilePatchInput) {
    const nested = scalarProfile(input);
    const scalarData = {
      ...nested.scalar,
      ...(nested.scalar.email && nested.scalar.email !== 'candidato@example.test'
        ? { isDemo: false }
        : {}),
    };
    return this.db.$transaction(async (tx) => {
      await tx.candidateProfile.update({ where: { id }, data: scalarData });

      if (nested.skills) {
        await tx.candidateSkill.deleteMany({ where: { candidateId: id } });
        if (nested.skills.length) {
          await tx.candidateSkill.createMany({
            data: nested.skills.map((skill) => ({ ...skill, candidateId: id })),
          });
        }
      }
      if (nested.languages) {
        await tx.candidateLanguage.deleteMany({ where: { candidateId: id } });
        if (nested.languages.length) {
          await tx.candidateLanguage.createMany({
            data: nested.languages.map((language) => ({ ...language, candidateId: id })),
          });
        }
      }
      if (nested.experiences) {
        await tx.candidateExperience.deleteMany({ where: { candidateId: id } });
        if (nested.experiences.length) {
          await tx.candidateExperience.createMany({
            data: nested.experiences.map((experience) => ({ ...experience, candidateId: id })),
          });
        }
      }
      if (nested.preferences) {
        await tx.jobPreferences.upsert({
          where: { candidateId: id },
          create: { ...nested.preferences, candidateId: id },
          update: nested.preferences,
        });
      }
      if (nested.policy) {
        await tx.applicationPolicy.upsert({
          where: { candidateId: id },
          create: { ...nested.policy, candidateId: id },
          update: nested.policy,
        });
      }
      if (nested.answers) {
        await tx.candidateAnswer.deleteMany({ where: { candidateId: id } });
        if (nested.answers.length) {
          await tx.candidateAnswer.createMany({
            data: nested.answers.map((answer) => ({ ...answer, candidateId: id })),
          });
        }
      }

      return tx.candidateProfile.findUniqueOrThrow({ where: { id }, include: profileInclude });
    });
  }
}
