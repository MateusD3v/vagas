import type { MatchDecision, RemoteType } from '@prisma/client';
import type { MATCHING_WEIGHTS } from './matching.config.js';

export interface MatchCandidate {
  city: string | null;
  state: string | null;
  educationLevel: string | null;
  graduationDate: Date | null;
  yearsOfExperience: number;
  certifications: string[];
  skills: Array<{ name: string; yearsOfExperience: number }>;
  experiences: Array<{ technologies: string[] }>;
  preferences: {
    desiredRoles: string[];
    excludedRoles: string[];
    desiredTechnologies: string[];
    preferredLocations: string[];
    remoteAllowed: boolean;
    hybridAllowed: boolean;
    onsiteAllowed: boolean;
    relocationAllowed: boolean;
    minimumSalary: number | null;
    employmentTypes: string[];
    seniorityLevels: string[];
    automaticApplicationThreshold: number;
    reviewThreshold: number;
  };
}

export interface MatchJob {
  title: string;
  description: string;
  city: string | null;
  state: string | null;
  location: string | null;
  remoteType: RemoteType;
  employmentType: string | null;
  seniority: string | null;
  salaryMin: number | null;
  requiredEducationLevel: string | null;
  requiredCertifications: string[];
  skills: Array<{ skill: string; required: boolean; yearsRequired: number | null }>;
}

export interface DeterministicMatch {
  score: number;
  decision: MatchDecision;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
  hardConstraints: string[];
  components: Record<keyof typeof MATCHING_WEIGHTS, number>;
}
