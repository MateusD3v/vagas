import type { PrismaClient } from '@prisma/client';
import type { LLMProvider } from '../../integrations/llm/provider.interface.js';
import { safeAnalyzeJobMatch } from '../../integrations/llm/safe-analysis.js';
import { sameText } from '../../shared/text.js';
import { AppError } from '../../shared/http.js';
import { ApplicationService } from '../applications/application.service.js';
import { AuditService } from '../audit/audit.service.js';
import { calculateDeterministicMatch } from './deterministic-matcher.js';
import { createAnalysisInputHash } from './analysis-cache.js';
import { clampScore } from './matching.config.js';
import type { MatchCandidate, MatchJob } from './matching.types.js';

export class JobMatchingService {
  private readonly audit: AuditService;
  private readonly applications: ApplicationService;

  constructor(
    private readonly db: PrismaClient,
    private readonly llm: LLMProvider,
    private readonly aiAdjustmentLimit: number,
    private readonly engineVersion = 1,
  ) {
    this.audit = new AuditService(db);
    this.applications = new ApplicationService(db);
  }

  async analyze(jobId: string) {
    const [profile, job] = await Promise.all([
      this.db.candidateProfile.findFirst({
        orderBy: { createdAt: 'asc' },
        include: { skills: true, experiences: true, preferences: true },
      }),
      this.db.job.findUnique({ where: { id: jobId }, include: { skills: true } }),
    ]);
    if (!profile) throw new AppError('Cadastre um perfil antes de analisar vagas', 409);
    if (!profile.preferences) throw new AppError('Configure as preferências antes da análise', 409);
    if (!job) throw new AppError('Vaga não encontrada', 404);

    const candidate: MatchCandidate = {
      city: profile.city,
      state: profile.state,
      educationLevel: profile.educationLevel,
      graduationDate: profile.graduationDate,
      yearsOfExperience: profile.yearsOfExperience,
      certifications: profile.certifications,
      skills: profile.skills.map((skill) => ({
        name: skill.name,
        yearsOfExperience: skill.yearsOfExperience,
      })),
      experiences: profile.experiences.map((experience) => ({
        technologies: experience.technologies,
      })),
      preferences: {
        ...profile.preferences,
        minimumSalary: profile.preferences.minimumSalary
          ? Number(profile.preferences.minimumSalary)
          : null,
      },
    };
    const matchJob: MatchJob = {
      title: job.title,
      description: job.description,
      city: job.city,
      state: job.state,
      location: job.location,
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      seniority: job.seniority,
      salaryMin: job.salaryMin ? Number(job.salaryMin) : null,
      requiredEducationLevel: job.requiredEducationLevel,
      requiredCertifications: job.requiredCertifications,
      skills: job.skills.map((skill) => ({
        skill: skill.skill,
        required: skill.required,
        yearsRequired: skill.yearsRequired,
      })),
    };
    const deterministic = calculateDeterministicMatch(candidate, matchJob);
    const analysisInputHash = createAnalysisInputHash({
      candidate,
      job: matchJob,
      engineVersion: this.engineVersion,
    });
    const existingMatch = await this.db.jobMatch.findUnique({
      where: { jobId_candidateId: { jobId: job.id, candidateId: profile.id } },
    });
    if (existingMatch?.analysisInputHash === analysisInputHash) {
      const application = await this.db.application.findUnique({
        where: { candidateId_jobId: { candidateId: profile.id, jobId: job.id } },
      });
      return { match: existingMatch, application, cached: true };
    }

    let adjustment = 0;
    let aiSummary = 'Análise de IA indisponível; resultado determinístico preservado.';
    let aiStrengths: string[] = [];
    let aiWeaknesses: string[] = [];
    const aiResult = await safeAnalyzeJobMatch(this.llm, {
      candidate: {
        professionalSummary: profile.professionalSummary,
        yearsOfExperience: profile.yearsOfExperience,
        skills: profile.skills.map((skill) => skill.name),
        desiredRoles: profile.preferences.desiredRoles,
      },
      job: {
        title: job.title,
        description: job.description,
        skills: job.skills.map((s) => s.skill),
      },
      deterministicScore: deterministic.score,
    });
    if (aiResult.output) {
      const ai = aiResult.output;
      adjustment = Math.max(
        -this.aiAdjustmentLimit,
        Math.min(this.aiAdjustmentLimit, ai.scoreAdjustment),
      );
      aiSummary = ai.summary;
      aiStrengths = ai.strengths;
      aiWeaknesses = ai.weaknesses;

      // Competências sugeridas pela IA não entram no registro: apenas o cálculo verificável é persistido.
      const candidateSkillNames = profile.skills.map((skill) => skill.name);
      const safeAiMatches = ai.matchedSkills.filter((skill) =>
        candidateSkillNames.some((candidateSkill) => sameText(candidateSkill, skill)),
      );
      if (safeAiMatches.length) aiStrengths.push(`IA confirmou: ${safeAiMatches.join(', ')}`);
    } else {
      await this.audit.record('LLM_ERROR', 'Job', job.id, {
        message: aiResult.error?.message ?? 'Erro desconhecido',
      });
    }

    if (deterministic.hardConstraints.length) adjustment = 0;
    const finalScore = clampScore(deterministic.score + adjustment);
    const decision = deterministic.hardConstraints.length
      ? 'SKIP'
      : finalScore >= profile.preferences.automaticApplicationThreshold
        ? 'APPLY'
        : finalScore >= profile.preferences.reviewThreshold
          ? 'REVIEW'
          : 'SKIP';
    const reasoning = [
      `Score determinístico ${deterministic.score}/100.`,
      `Componentes: ${Object.entries(deterministic.components)
        .map(([name, score]) => `${name}=${Math.round(score)}`)
        .join(', ')}.`,
      `Ajuste de IA ${adjustment >= 0 ? '+' : ''}${adjustment}.`,
      aiSummary,
      ...(deterministic.hardConstraints.length
        ? [`Restrições eliminatórias: ${deterministic.hardConstraints.join('; ')}.`]
        : []),
    ].join(' ');

    const saved = await this.db.$transaction(async (tx) => {
      const match = await tx.jobMatch.upsert({
        where: { jobId_candidateId: { jobId: job.id, candidateId: profile.id } },
        create: {
          jobId: job.id,
          candidateId: profile.id,
          deterministicScore: deterministic.score,
          aiAdjustment: adjustment,
          score: finalScore,
          decision,
          matchedSkills: deterministic.matchedSkills,
          missingSkills: deterministic.missingSkills,
          strengths: [...deterministic.strengths, ...aiStrengths],
          weaknesses: [...deterministic.weaknesses, ...aiWeaknesses],
          hardConstraints: deterministic.hardConstraints,
          reasoning,
          analysisInputHash,
          engineVersion: this.engineVersion,
        },
        update: {
          deterministicScore: deterministic.score,
          aiAdjustment: adjustment,
          score: finalScore,
          decision,
          matchedSkills: deterministic.matchedSkills,
          missingSkills: deterministic.missingSkills,
          strengths: [...deterministic.strengths, ...aiStrengths],
          weaknesses: [...deterministic.weaknesses, ...aiWeaknesses],
          hardConstraints: deterministic.hardConstraints,
          reasoning,
          analysisInputHash,
          engineVersion: this.engineVersion,
        },
      });
      await tx.job.update({ where: { id: job.id }, data: { status: 'ANALYZED' } });
      return match;
    });

    await this.audit.record('JOB_ANALYZED', 'Job', job.id, {
      matchId: saved.id,
      deterministicScore: deterministic.score,
      aiAdjustment: adjustment,
      finalScore,
      decision,
      hardConstraints: deterministic.hardConstraints,
    });
    const application = await this.applications.prepare(profile.id, job.id, decision, finalScore);
    return { match: saved, application, cached: false };
  }
}
