import type { MatchCandidate, MatchJob } from '../src/modules/matching/matching.types.js';

export function candidateFixture(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    city: 'São Paulo',
    state: 'SP',
    educationLevel: 'GRADUACAO_COMPLETA',
    graduationDate: new Date('2024-01-01T00:00:00.000Z'),
    yearsOfExperience: 2,
    certifications: [],
    skills: [
      { name: 'Node.js', yearsOfExperience: 2 },
      { name: 'PostgreSQL', yearsOfExperience: 2 },
      { name: 'Git', yearsOfExperience: 3 },
    ],
    experiences: [{ technologies: ['REST API', 'Docker'] }],
    preferences: {
      desiredRoles: ['Desenvolvedor Backend Jr'],
      excludedRoles: [],
      desiredTechnologies: ['Node.js', 'PostgreSQL'],
      preferredLocations: ['São Paulo', 'Remoto'],
      remoteAllowed: true,
      hybridAllowed: true,
      onsiteAllowed: true,
      relocationAllowed: false,
      minimumSalary: 3000,
      employmentTypes: ['CLT'],
      seniorityLevels: ['JUNIOR'],
      automaticApplicationThreshold: 85,
      reviewThreshold: 65,
    },
    ...overrides,
  };
}

export function jobFixture(overrides: Partial<MatchJob> = {}): MatchJob {
  return {
    title: 'Desenvolvedor Backend Jr',
    description: 'Desenvolvimento de APIs',
    city: 'São Paulo',
    state: 'SP',
    location: 'São Paulo, SP',
    remoteType: 'HYBRID',
    employmentType: 'CLT',
    seniority: 'JUNIOR',
    salaryMin: 4500,
    requiredEducationLevel: null,
    requiredCertifications: [],
    skills: [
      { skill: 'Node.js', required: true, yearsRequired: 1 },
      { skill: 'PostgreSQL', required: true, yearsRequired: null },
      { skill: 'Git', required: true, yearsRequired: null },
    ],
    ...overrides,
  };
}
