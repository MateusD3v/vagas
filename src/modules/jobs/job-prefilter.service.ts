import type { RemoteType } from '@prisma/client';
import { includesText, normalizeText } from '../../shared/text.js';

export interface PreFilterCandidate {
  skills: string[];
  seniorityLevels: string[];
  remoteAllowed: boolean;
  hybridAllowed: boolean;
  onsiteAllowed: boolean;
}

export interface PreFilterSearchProfile {
  keywords: string[];
  excludedKeywords: string[];
  locations: string[];
  remoteTypes: RemoteType[];
  employmentTypes: string[];
  seniorityLevels: string[];
  publishedWithinHours: number | null;
}

export interface PreFilterJob {
  title: string;
  description: string;
  location: string | null;
  remoteType: RemoteType;
  employmentType: string | null;
  seniority: string | null;
  publishedAt: Date | null;
  skills: Array<{ skill: string }>;
}

export interface PreFilterResult {
  passed: boolean;
  reasons: string[];
  preliminaryScore: number;
}

const seniorTerms = ['senior', 'sr', 'staff', 'principal', 'lead'];
const earlyCareerTerms = ['intern', 'entry', 'junior', 'jr', 'trainee', 'estagio'];
const knownEmploymentTypes = new Set([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'ESTAGIO',
  'CLT',
  'TEMPORARY',
  'FREELANCE',
]);

export class JobPreFilterService {
  evaluate(
    job: PreFilterJob,
    search: PreFilterSearchProfile,
    candidate: PreFilterCandidate,
    defaultMaxAgeDays: number,
    now = new Date(),
  ): PreFilterResult {
    const reasons: string[] = [];
    const searchable = `${job.title} ${job.description}`;
    const exclusionTarget = `${job.title} ${job.seniority ?? ''}`;

    const excluded = search.excludedKeywords.find((keyword) =>
      includesText(exclusionTarget, keyword),
    );
    if (excluded) reasons.push(`Palavra-chave excluída: ${excluded}`);

    const targetSeniorities = search.seniorityLevels.length
      ? search.seniorityLevels
      : candidate.seniorityLevels;
    const onlyEarlyCareer =
      targetSeniorities.length > 0 &&
      targetSeniorities.every((level) =>
        earlyCareerTerms.some((term) => includesText(level, term)),
      );
    const jobSeniority = normalizeText(`${job.seniority ?? ''} ${job.title}`);
    if (onlyEarlyCareer && seniorTerms.some((term) => jobSeniority.includes(term))) {
      reasons.push('Senioridade incompatível: vaga sênior para perfil de início de carreira');
    }
    if (
      job.seniority &&
      targetSeniorities.length &&
      !targetSeniorities.some((level) => includesText(level, job.seniority ?? ''))
    ) {
      reasons.push(`Senioridade não desejada: ${job.seniority}`);
    }

    if (search.remoteTypes.length && !search.remoteTypes.includes(job.remoteType)) {
      reasons.push(`Modalidade não desejada: ${job.remoteType}`);
    }
    if (job.remoteType === 'REMOTE' && !candidate.remoteAllowed)
      reasons.push('Remoto não permitido');
    if (job.remoteType === 'HYBRID' && !candidate.hybridAllowed)
      reasons.push('Híbrido não permitido');
    if (job.remoteType === 'ONSITE' && !candidate.onsiteAllowed)
      reasons.push('Presencial não permitido');

    const requiresLocationMatch = job.remoteType === 'HYBRID' || job.remoteType === 'ONSITE';
    const locationMatches =
      !search.locations.length ||
      (job.location !== null &&
        search.locations.some(
          (location) =>
            includesText(job.location ?? '', location) ||
            includesText(location, job.location ?? ''),
        ));
    if (requiresLocationMatch && !locationMatches) {
      reasons.push(`Localização não desejada: ${job.location ?? 'não informada'}`);
    }

    if (
      search.employmentTypes.length &&
      job.employmentType &&
      knownEmploymentTypes.has(job.employmentType.toUpperCase()) &&
      !search.employmentTypes.some((type) => includesText(job.employmentType ?? '', type))
    ) {
      reasons.push(`Tipo de contratação não desejado: ${job.employmentType}`);
    }

    const maxAgeHours = search.publishedWithinHours ?? defaultMaxAgeDays * 24;
    if (job.publishedAt && now.getTime() - job.publishedAt.getTime() > maxAgeHours * 3_600_000) {
      reasons.push(`Vaga mais antiga que ${maxAgeHours} horas`);
    }

    const keywordMatch = search.keywords.some((keyword) => includesText(searchable, keyword));
    const matchedSkills = job.skills.filter((requirement) =>
      candidate.skills.some((skill) => normalizeText(skill) === normalizeText(requirement.skill)),
    ).length;
    if (!keywordMatch && matchedSkills === 0) {
      reasons.push('Sem evidência de alinhamento por palavra-chave ou competência');
    }
    const skillRatio = job.skills.length ? matchedSkills / job.skills.length : 0;
    const modalityMatch =
      !search.remoteTypes.length || search.remoteTypes.includes(job.remoteType) ? 1 : 0;
    const seniorityMatch =
      !job.seniority ||
      !targetSeniorities.length ||
      targetSeniorities.some((level) => includesText(level, job.seniority ?? ''))
        ? 1
        : 0;
    const preliminaryScore = Math.round(
      (keywordMatch ? 40 : 0) + skillRatio * 30 + modalityMatch * 15 + seniorityMatch * 15,
    );

    return { passed: reasons.length === 0, reasons, preliminaryScore };
  }
}
