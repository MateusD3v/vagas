import { includesText, normalizeText } from '../../shared/text.js';

export interface RoleAlignmentInput {
  title: string;
  jobSkills: string[];
  targetRoles: string[];
  targetTechnologies?: string[];
}

export interface RoleAlignmentResult {
  aligned: boolean;
  family: 'DIRECT' | 'SUPPORT' | 'BACKEND' | 'MOBILE' | 'INTERNSHIP' | null;
}

const supportTargets = [
  'suporte',
  'support',
  'help desk',
  'service desk',
  'helpdesk',
  'servicedesk',
];
const supportTitles = [
  'technical support',
  'it support',
  'help desk',
  'service desk',
  'desktop support',
  'support engineer',
  'support analyst',
  'support technician',
  'suporte tecnico',
  'suporte ti',
  'analista de suporte',
  'tecnico de suporte',
];
const supportSkills = [
  'windows',
  'hardware',
  'network',
  'networking',
  'redes',
  'linux',
  'vpn',
  'active directory',
  'microsoft 365',
  'office 365',
];

const backendTargets = ['backend', 'back end', 'node.js', 'nodejs', 'java'];
const backendSkills = [
  'node.js',
  'nodejs',
  'java',
  'mysql',
  'postgresql',
  'sql',
  'rest api',
  'spring',
  'express',
];

const mobileTargets = ['flutter', 'mobile'];
const mobileSkills = ['flutter', 'dart'];

const nonSoftwareTitles = [
  'sales engineer',
  'sales engineering',
  'solutions architect',
  'solution architect',
  'electrical engineer',
  'mechanical engineer',
  'civil engineer',
  'people analytics',
  'account manager',
  'customer success',
  'marketing',
  'recruiter',
];

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => includesText(value, term));
}

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map((value) => normalizeText(value)));
}

function hasSkill(skills: Set<string>, terms: string[]): boolean {
  return terms.some((term) => skills.has(normalizeText(term)));
}

export function evaluateRoleAlignment(input: RoleAlignmentInput): RoleAlignmentResult {
  const targetRoles = input.targetRoles.filter(Boolean);
  const targetText = targetRoles.join(' ');
  const title = input.title;
  const skills = normalizedSet(input.jobSkills);

  const direct = targetRoles.some((role) => includesText(title, role) || includesText(role, title));
  if (direct) return { aligned: true, family: 'DIRECT' };

  const targetsSupport = hasAny(targetText, supportTargets);
  if (targetsSupport) {
    if (hasAny(title, supportTitles)) return { aligned: true, family: 'SUPPORT' };

    const titleSaysSupport = includesText(title, 'support') || includesText(title, 'suporte');
    const businessSupport =
      hasAny(title, ['customer support', 'sales support', 'merchant support', 'customer care']) &&
      !hasAny(title, ['technical', 'it support', 'engineer', 'analyst', 'technician']);
    if (titleSaysSupport && !businessSupport && hasSkill(skills, supportSkills)) {
      return { aligned: true, family: 'SUPPORT' };
    }
  }

  const blockedEngineeringFamily = hasAny(title, nonSoftwareTitles);
  const softwareRoleWord = hasAny(title, [
    'developer',
    'desenvolvedor',
    'engineer',
    'engenheiro de software',
    'software',
    'programmer',
  ]);

  const targetsBackend = hasAny(targetText, backendTargets);
  if (targetsBackend && !blockedEngineeringFamily) {
    if (hasAny(title, ['backend', 'back-end', 'back end'])) {
      return { aligned: true, family: 'BACKEND' };
    }
    const titleTechnology = hasAny(title, backendSkills);
    if (
      (titleTechnology && softwareRoleWord) ||
      (softwareRoleWord && hasSkill(skills, backendSkills))
    ) {
      return { aligned: true, family: 'BACKEND' };
    }
  }

  const targetsMobile = hasAny(targetText, mobileTargets);
  if (targetsMobile && !blockedEngineeringFamily) {
    if (hasAny(title, ['flutter', 'mobile developer', 'mobile engineer'])) {
      return { aligned: true, family: 'MOBILE' };
    }
    if (softwareRoleWord && hasSkill(skills, mobileSkills)) {
      return { aligned: true, family: 'MOBILE' };
    }
  }

  const targetsInternship = hasAny(targetText, ['estagio', 'intern', 'internship', 'trainee']);
  if (
    targetsInternship &&
    hasAny(title, ['intern', 'internship', 'estagio', 'estagiario', 'trainee']) &&
    hasAny(title, [
      'developer',
      'development',
      'software',
      'ti',
      'it intern',
      'it internship',
      'information technology',
      'support',
      'suporte',
    ])
  ) {
    return { aligned: true, family: 'INTERNSHIP' };
  }

  return { aligned: false, family: null };
}
