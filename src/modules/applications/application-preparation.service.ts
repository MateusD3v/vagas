import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/http.js';
import { normalizeText } from '../../shared/text.js';
import { AuditService } from '../audit/audit.service.js';

const preparationInclude = {
  candidate: {
    include: {
      skills: true,
      languages: true,
      experiences: true,
      answers: true,
    },
  },
  job: { include: { skills: true } },
} satisfies Prisma.ApplicationInclude;

type PreparationApplication = Prisma.ApplicationGetPayload<{
  include: typeof preparationInclude;
}>;

function experienceRelevance(
  technologies: string[],
  jobSkills: Set<string>,
  jobText: string,
): number {
  return technologies.reduce((score, technology) => {
    const normalized = normalizeText(technology);
    return score + (jobSkills.has(normalized) || jobText.includes(normalized) ? 1 : 0);
  }, 0);
}

function monthYear(value: Date | null): string {
  if (!value) return 'Atual';
  return new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric' }).format(value);
}

function renderResumeMarkdown(
  candidate: PreparationApplication['candidate'],
  skills: PreparationApplication['candidate']['skills'],
  experiences: PreparationApplication['candidate']['experiences'],
): string {
  const contact = [
    candidate.email,
    candidate.phone,
    [candidate.city, candidate.state].filter(Boolean).join(' - '),
    candidate.linkedinUrl,
    candidate.githubUrl,
    candidate.portfolioUrl,
  ].filter((value): value is string => Boolean(value));

  const lines = [
    `# ${candidate.fullName}`,
    contact.join(' | '),
    '',
    '## Resumo profissional',
    candidate.professionalSummary,
    '',
    '## Competências',
    skills.map((skill) => `- ${skill.name} — ${skill.level}`).join('\n'),
    '',
    '## Experiência',
  ];

  for (const experience of experiences) {
    lines.push(
      `### ${experience.role} — ${experience.company}`,
      `${monthYear(experience.startDate)} – ${monthYear(experience.endDate)}`,
      experience.description,
      experience.technologies.length ? `Tecnologias: ${experience.technologies.join(', ')}` : '',
      ...experience.achievements.map((achievement) => `- ${achievement}`),
      '',
    );
  }

  if (candidate.course || candidate.institution || candidate.educationLevel) {
    lines.push(
      '## Formação',
      [candidate.course, candidate.institution, candidate.educationLevel]
        .filter(Boolean)
        .join(' — '),
      candidate.graduationDate ? `Conclusão prevista: ${monthYear(candidate.graduationDate)}` : '',
      '',
    );
  }

  if (candidate.languages.length) {
    lines.push(
      '## Idiomas',
      ...candidate.languages.map((language) => `- ${language.language} — ${language.level}`),
      '',
    );
  }

  if (candidate.certifications.length) {
    lines.push('## Certificações', ...candidate.certifications.map((item) => `- ${item}`), '');
  }

  return lines
    .filter((line, index) => line !== '' || lines[index - 1] !== '')
    .join('\n')
    .trim();
}

function buildPreparation(application: PreparationApplication) {
  const candidate = application.candidate;
  const job = application.job;
  const jobSkills = new Set(job.skills.map((skill) => normalizeText(skill.skill)));
  const jobText = normalizeText(`${job.title} ${job.description}`);

  const skills = [...candidate.skills].sort((a, b) => {
    const aMatched = jobSkills.has(normalizeText(a.name)) ? 1 : 0;
    const bMatched = jobSkills.has(normalizeText(b.name)) ? 1 : 0;
    return bMatched - aMatched || b.yearsOfExperience - a.yearsOfExperience;
  });

  const experiences = [...candidate.experiences].sort((a, b) => {
    const relevance =
      experienceRelevance(b.technologies, jobSkills, jobText) -
      experienceRelevance(a.technologies, jobSkills, jobText);
    return relevance || b.startDate.getTime() - a.startDate.getTime();
  });

  const reusableAnswers = candidate.answers
    .filter((answer) => answer.allowedForAutomaticUse)
    .map((answer) => ({
      questionKey: answer.questionKey,
      question: answer.question,
      answer: answer.answer,
      answerType: answer.answerType,
    }));
  const missingInformation: string[] = [];
  if (!candidate.phone) missingInformation.push('Telefone do candidato não informado');
  if (!candidate.linkedinUrl) missingInformation.push('LinkedIn do candidato não informado');
  if (!job.applicationUrl) missingInformation.push('URL de candidatura da vaga não informada');

  const candidateCertifications = new Set(
    candidate.certifications.map((certification) => normalizeText(certification)),
  );
  for (const certification of job.requiredCertifications) {
    if (!candidateCertifications.has(normalizeText(certification))) {
      missingInformation.push(`Certificação exigida não confirmada: ${certification}`);
    }
  }

  const payload = {
    applicationId: application.id,
    matchScore: application.matchScore,
    targetJob: {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      applicationUrl: job.applicationUrl,
    },
    resumeMarkdown: renderResumeMarkdown(candidate, skills, experiences),
    resume: {
      fullName: candidate.fullName,
      contact: {
        email: candidate.email,
        phone: candidate.phone,
        city: candidate.city,
        state: candidate.state,
        country: candidate.country,
        linkedinUrl: candidate.linkedinUrl,
        githubUrl: candidate.githubUrl,
        portfolioUrl: candidate.portfolioUrl,
      },
      professionalSummary: candidate.professionalSummary,
      education: {
        level: candidate.educationLevel,
        course: candidate.course,
        institution: candidate.institution,
        graduationDate: candidate.graduationDate?.toISOString() ?? null,
      },
      certifications: candidate.certifications,
      skills: skills.map((skill) => ({
        name: skill.name,
        level: skill.level,
        yearsOfExperience: skill.yearsOfExperience,
        matchedToJob: jobSkills.has(normalizeText(skill.name)),
      })),
      languages: candidate.languages.map(({ language, level }) => ({ language, level })),
      experiences: experiences.map((experience) => ({
        company: experience.company,
        role: experience.role,
        startDate: experience.startDate.toISOString(),
        endDate: experience.endDate?.toISOString() ?? null,
        current: experience.current,
        description: experience.description,
        technologies: experience.technologies,
        achievements: experience.achievements,
      })),
    },
  };

  return { payload, reusableAnswers, missingInformation };
}

export class ApplicationPreparationService {
  private readonly audit: AuditService;

  constructor(private readonly db: PrismaClient) {
    this.audit = new AuditService(db);
  }

  async prepare(applicationId: string) {
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: preparationInclude,
    });
    if (!application) throw new AppError('Candidatura não encontrada', 404);
    if (application.candidate.isDemo) {
      throw new AppError('Substitua o perfil de demonstração antes de preparar candidatura', 409);
    }

    const preparation = buildPreparation(application);
    const stored = await this.db.applicationPreparation.upsert({
      where: { applicationId },
      create: {
        applicationId,
        payload: preparation.payload,
        reusableAnswers: preparation.reusableAnswers,
        missingInformation: preparation.missingInformation,
      },
      update: {
        payload: preparation.payload,
        reusableAnswers: preparation.reusableAnswers,
        missingInformation: preparation.missingInformation,
        version: { increment: 1 },
      },
    });

    await this.audit.record('APPLICATION_PREPARATION_READY', 'ApplicationPreparation', stored.id, {
      applicationId,
      missingInformation: preparation.missingInformation,
    });
    return stored;
  }
  async preparePending(limit = 25) {
    const pending = await this.db.application.findMany({
      where: {
        status: { in: ['READY', 'REVIEW_REQUIRED'] },
        preparation: { is: null },
        candidate: { isDemo: false },
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    let prepared = 0;
    const failures: Array<{ applicationId: string; message: string }> = [];
    for (const item of pending) {
      try {
        await this.prepare(item.id);
        prepared += 1;
      } catch (error) {
        failures.push({
          applicationId: item.id,
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }
    return { attempted: pending.length, prepared, failed: failures.length, failures };
  }

  async get(applicationId: string) {
    const preparation = await this.db.applicationPreparation.findUnique({
      where: { applicationId },
    });
    if (!preparation) {
      throw new AppError('Preparação ainda não gerada para esta candidatura', 404);
    }
    return preparation;
  }
}
