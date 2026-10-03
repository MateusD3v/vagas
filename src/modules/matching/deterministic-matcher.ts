import type { MatchDecision } from '@prisma/client';
import { includesText, normalizeText, sameText } from '../../shared/text.js';
import { evaluateHardConstraints } from './hard-constraints.js';
import { clampScore, MATCHING_WEIGHTS } from './matching.config.js';
import { evaluateRoleAlignment } from './role-alignment.js';
import type { DeterministicMatch, MatchCandidate, MatchJob } from './matching.types.js';

const genericEvidenceSkills = new Set(['git', 'docker', 'rest api']);

function decide(score: number, candidate: MatchCandidate, constrained: boolean): MatchDecision {
  if (constrained) return 'SKIP';
  if (score >= candidate.preferences.automaticApplicationThreshold) return 'APPLY';
  if (score >= candidate.preferences.reviewThreshold) return 'REVIEW';
  return 'SKIP';
}

export function calculateDeterministicMatch(
  candidate: MatchCandidate,
  job: MatchJob,
): DeterministicMatch {
  const candidateSkills = new Map<string, number>();
  for (const skill of candidate.skills) {
    candidateSkills.set(normalizeText(skill.name), skill.yearsOfExperience);
  }
  for (const experience of candidate.experiences) {
    for (const technology of experience.technologies) {
      if (!candidateSkills.has(normalizeText(technology)))
        candidateSkills.set(normalizeText(technology), 0);
    }
  }

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const requirement of job.skills) {
    const years = candidateSkills.get(normalizeText(requirement.skill));
    if (
      years !== undefined &&
      (requirement.yearsRequired === null || years >= requirement.yearsRequired)
    ) {
      matchedSkills.push(requirement.skill);
    } else if (requirement.required) {
      missingSkills.push(requirement.skill);
    }
  }

  const skillRatio = job.skills.length ? matchedSkills.length / job.skills.length : 0;
  const skills = MATCHING_WEIGHTS.skills * skillRatio;

  const requiredYears = Math.max(
    0,
    ...job.skills.map((skill) => skill.yearsRequired ?? 0),
    normalizeText(job.seniority ?? '').includes('senior') ? 5 : 0,
    normalizeText(job.seniority ?? '').includes('mid') ? 3 : 0,
  );
  const experience =
    MATCHING_WEIGHTS.experience *
    (requiredYears === 0 ? 1 : Math.min(1, candidate.yearsOfExperience / requiredYears));

  const roleAlignment = evaluateRoleAlignment({
    title: job.title,
    jobSkills: job.skills.map((requirement) => requirement.skill),
    targetRoles: candidate.preferences.desiredRoles,
    targetTechnologies: candidate.preferences.desiredTechnologies,
  });
  const roleMatch = roleAlignment.aligned;
  const role = roleMatch ? MATCHING_WEIGHTS.role : 0;

  const locationAllowed =
    (job.remoteType === 'REMOTE' && candidate.preferences.remoteAllowed) ||
    (job.remoteType === 'HYBRID' && candidate.preferences.hybridAllowed) ||
    (job.remoteType === 'ONSITE' && candidate.preferences.onsiteAllowed) ||
    candidate.preferences.preferredLocations.some((place) =>
      includesText(job.location ?? '', place),
    );
  const location = locationAllowed ? MATCHING_WEIGHTS.location : 0;

  const seniorityMatch =
    !job.seniority ||
    candidate.preferences.seniorityLevels.length === 0 ||
    candidate.preferences.seniorityLevels.some((level) => sameText(level, job.seniority ?? ''));
  const seniority = seniorityMatch ? MATCHING_WEIGHTS.seniority : 0;

  const education =
    !job.requiredEducationLevel || candidate.educationLevel ? MATCHING_WEIGHTS.education : 0;
  const salary =
    !candidate.preferences.minimumSalary ||
    job.salaryMin === null ||
    job.salaryMin >= candidate.preferences.minimumSalary
      ? MATCHING_WEIGHTS.salary
      : 0;

  const components = { skills, experience, role, location, seniority, education, salary };
  const score = clampScore(Object.values(components).reduce((sum, value) => sum + value, 0));
  const hardConstraints = evaluateHardConstraints(candidate, job);
  const hasSubstantiveSkillEvidence = matchedSkills.some(
    (skill) => !genericEvidenceSkills.has(normalizeText(skill)),
  );
  if (!roleMatch && !hasSubstantiveSkillEvidence) {
    hardConstraints.push('Sem evidência de alinhamento com cargo ou competências relevantes');
  }
  const strengths = [
    ...(matchedSkills.length ? [`Competências compatíveis: ${matchedSkills.join(', ')}`] : []),
    ...(roleMatch ? ['Cargo alinhado aos objetivos'] : []),
    ...(locationAllowed ? ['Modalidade/localização compatível'] : []),
  ];
  const weaknesses = [
    ...(missingSkills.length
      ? [`Competências obrigatórias ausentes: ${missingSkills.join(', ')}`]
      : []),
    ...(!roleMatch ? ['Cargo fora dos objetivos prioritários'] : []),
    ...hardConstraints,
  ];

  const thresholdDecision = decide(score, candidate, hardConstraints.length > 0);
  const decision = !roleMatch && thresholdDecision === 'APPLY' ? 'REVIEW' : thresholdDecision;

  return {
    score,
    decision,
    roleAligned: roleMatch,
    matchedSkills,
    missingSkills,
    strengths,
    weaknesses,
    hardConstraints,
    components,
  };
}
