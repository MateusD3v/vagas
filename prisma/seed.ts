import { PrismaClient } from '@prisma/client';
import { MockJobSource } from '../src/integrations/job-sources/mock/mock.adapter.js';
import { MockLLMProvider } from '../src/integrations/llm/mock.provider.js';
import { JobIngestionService } from '../src/modules/jobs/job-ingestion.service.js';
import { createCanonicalJobFingerprint } from '../src/modules/jobs/job-fingerprint.js';
import { JobMatchingService } from '../src/modules/matching/job-matching.service.js';
import { profileTransferBundleSchema } from '../src/modules/profile/profile-transfer.schemas.js';
import { ProfileTransferService } from '../src/modules/profile/profile-transfer.service.js';
import { ProfileService } from '../src/modules/profile/profile.service.js';

const db = new PrismaClient();
const seedDemoData = process.env.SEED_DEMO_DATA === 'true';

const sourceDefinitions = [
  {
    name: 'Mock Job Source',
    slug: 'mock',
    type: 'MOCK' as const,
    baseUrl: null,
    configuration: { purpose: 'development-and-tests' },
  },
  {
    name: 'Remotive',
    slug: 'remotive',
    type: 'API' as const,
    baseUrl: 'https://remotive.com/api/remote-jobs',
    configuration: { attributionRequired: true, recommendedRunsPerDay: 4 },
  },
  {
    name: 'Arbeitnow',
    slug: 'arbeitnow',
    type: 'API' as const,
    baseUrl: 'https://www.arbeitnow.com/api/job-board-api',
    configuration: { authentication: 'none' },
  },
  {
    name: 'Jobicy',
    slug: 'jobicy',
    type: 'API' as const,
    baseUrl: 'https://jobicy.com/api/v2/remote-jobs',
    configuration: {
      authentication: 'none',
      attributionRequired: true,
      publicWindowDays: 7,
      recommendedPolling: 'few-times-per-day',
    },
  },
  {
    name: 'Himalayas',
    slug: 'himalayas',
    type: 'API' as const,
    baseUrl: 'https://himalayas.app/jobs/api/search',
    configuration: {
      authentication: 'none',
      attributionRequired: true,
      maxResultsPerRequest: 20,
      dataRefresh: 'daily',
      recommendedPolling: 'few-times-per-day',
    },
  },
  {
    name: 'Remote OK',
    slug: 'remoteok',
    type: 'API' as const,
    baseUrl: 'https://remoteok.com/api',
    configuration: {
      authentication: 'none',
      attributionRequired: true,
      linkBackRequired: true,
      filtering: 'local-keywords',
      recommendedPolling: 'few-times-per-day',
    },
  },
];

async function seedSources() {
  for (const definition of sourceDefinitions) {
    await db.jobSource.upsert({
      where: { slug: definition.slug },
      create: { ...definition, enabled: definition.slug !== 'mock' },
      update: {
        name: definition.name,
        type: definition.type,
        enabled: definition.slug !== 'mock',
        baseUrl: definition.baseUrl,
        configuration: definition.configuration,
      },
    });
  }
}

async function importBootstrapProfile(): Promise<void> {
  const encoded = process.env.PROFILE_BOOTSTRAP_BASE64;
  if (!encoded) return;
  const existingProfile = await db.candidateProfile.findFirst({ select: { id: true } });
  if (existingProfile) return;

  const json = Buffer.from(encoded, 'base64').toString('utf8');
  const bundle = profileTransferBundleSchema.parse(JSON.parse(json));
  await new ProfileTransferService(db).importBundle(bundle);
}

async function main() {
  await seedSources();
  await importBootstrapProfile();
  const existingProfile = await db.candidateProfile.findFirst();
  if (!existingProfile && seedDemoData) {
    await new ProfileService(db).create({
      fullName: 'Candidato Demonstração',
      email: 'candidato@example.test',
      phone: null,
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
      linkedinUrl: null,
      githubUrl: 'https://github.com/example',
      portfolioUrl: null,
      educationLevel: 'GRADUACAO_COMPLETA',
      course: 'Análise e Desenvolvimento de Sistemas',
      institution: 'Instituição de Demonstração',
      graduationDate: new Date('2025-12-15T00:00:00.000Z'),
      professionalSummary:
        'Profissional júnior de tecnologia com experiência em suporte e desenvolvimento backend.',
      yearsOfExperience: 2,
      desiredJobTypes: ['CLT', 'ESTAGIO'],
      desiredRoles: [
        'Analista de Suporte',
        'Suporte TI',
        'Desenvolvedor Backend Jr',
        'Desenvolvedor Node.js Jr',
      ],
      desiredLocations: ['São Paulo', 'Remoto'],
      remotePreference: 'REMOTE',
      minimumSalary: 3000,
      salaryCurrency: 'BRL',
      certifications: [],
      skills: [
        { name: 'Node.js', level: 'JUNIOR', yearsOfExperience: 1.5 },
        { name: 'PostgreSQL', level: 'JUNIOR', yearsOfExperience: 1 },
        { name: 'Git', level: 'INTERMEDIARIO', yearsOfExperience: 2 },
        { name: 'REST API', level: 'JUNIOR', yearsOfExperience: 1.5 },
        { name: 'Windows', level: 'INTERMEDIARIO', yearsOfExperience: 2 },
        { name: 'Redes', level: 'BASICO', yearsOfExperience: 1 },
        { name: 'Hardware', level: 'BASICO', yearsOfExperience: 1 },
      ],
      languages: [
        { language: 'Português', level: 'NATIVO' },
        { language: 'Inglês', level: 'INTERMEDIARIO' },
      ],
      experiences: [
        {
          company: 'Empresa Exemplo',
          role: 'Analista de Suporte Jr',
          startDate: new Date('2024-01-01T00:00:00.000Z'),
          endDate: null,
          current: true,
          description: 'Atendimento técnico e automação de rotinas internas.',
          technologies: ['Windows', 'Redes', 'Node.js', 'PostgreSQL', 'Git'],
          achievements: ['Redução documentada do tempo médio de atendimento.'],
        },
      ],
      preferences: {
        desiredRoles: [
          'Analista de Suporte',
          'Suporte TI',
          'Desenvolvedor Backend Jr',
          'Desenvolvedor Node.js Jr',
        ],
        excludedRoles: ['Gerente', 'Diretor'],
        desiredTechnologies: ['Node.js', 'PostgreSQL', 'Git', 'REST API'],
        preferredLocations: ['São Paulo', 'Remoto'],
        remoteAllowed: true,
        hybridAllowed: true,
        onsiteAllowed: true,
        relocationAllowed: false,
        minimumSalary: 3000,
        employmentTypes: ['CLT', 'ESTAGIO'],
        seniorityLevels: ['ENTRY', 'INTERN', 'TRAINEE', 'JUNIOR'],
        automaticApplicationThreshold: 85,
        reviewThreshold: 65,
      },
      policy: {
        autoApplyEnabled: false,
        minimumScore: 85,
        maximumApplicationsPerDay: 10,
        allowedSources: ['mock'],
        blockedCompanies: [],
        blockedKeywords: [],
        requireSalaryInformation: false,
        requireRemote: false,
      },
      answers: [
        {
          questionKey: 'remote_availability',
          question: 'Possui disponibilidade para trabalho remoto?',
          answer: 'Sim',
          answerType: 'BOOLEAN',
          allowedForAutomaticUse: true,
        },
        {
          questionKey: 'salary_expectation',
          question: 'Qual sua pretensão salarial?',
          answer: 'A partir de R$ 3.000,00',
          answerType: 'TEXT',
          allowedForAutomaticUse: false,
        },
      ],
    });
  }

  if (!seedDemoData) return;

  await db.candidateProfile.updateMany({
    where: { email: 'candidato@example.test' },
    data: { isDemo: true },
  });

  const imported = await new JobIngestionService(db).import(new MockJobSource());
  const matcher = new JobMatchingService(db, new MockLLMProvider(), 10);
  for (const jobId of imported.jobIds) await matcher.analyze(jobId);

  const candidate = await db.candidateProfile.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  await db.jobSearchProfile.upsert({
    where: { candidateId: candidate.id },
    create: {
      candidateId: candidate.id,
      enabled: true,
      keywords: [
        'Backend Developer',
        'Node.js',
        'Technical Support',
        'Desenvolvedor Backend',
        'Analista de Suporte',
      ],
      excludedKeywords: ['Director', 'VP Engineering'],
      locations: ['Remote', 'Brazil', 'São Paulo'],
      remoteTypes: ['REMOTE', 'HYBRID'],
      employmentTypes: ['FULL_TIME', 'CLT'],
      seniorityLevels: ['INTERN', 'ENTRY', 'JUNIOR'],
      maxJobsPerRun: 25,
      publishedWithinHours: 24 * 30,
    },
    update: {},
  });

  const mockSource = await db.jobSource.findUniqueOrThrow({ where: { slug: 'mock' } });
  const existingJobs = await db.job.findMany({ where: { source: 'mock' } });
  for (const job of existingJobs) {
    await db.job.update({
      where: { id: job.id },
      data: {
        canonicalFingerprint: createCanonicalJobFingerprint({
          company: job.company,
          title: job.title,
          location: job.location ?? undefined,
          applicationUrl: job.applicationUrl ?? undefined,
        }),
      },
    });
    await db.jobSourceReference.upsert({
      where: { jobId_sourceId: { jobId: job.id, sourceId: mockSource.id } },
      create: {
        jobId: job.id,
        sourceId: mockSource.id,
        externalId: job.externalId,
        originalUrl: job.originalUrl,
      },
      update: { lastSeenAt: new Date() },
    });
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
