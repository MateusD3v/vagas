import { describe, expect, it } from 'vitest';
import { RemotiveJobSource } from '../src/integrations/job-sources/providers/remotive/remotive.adapter.js';
import type { JobSourceHttpClient } from '../src/integrations/job-sources/shared/http-client.js';
import { createCanonicalJobFingerprint } from '../src/modules/jobs/job-fingerprint.js';
import { JobPreFilterService } from '../src/modules/jobs/job-prefilter.service.js';
import { calculateDeterministicMatch } from '../src/modules/matching/deterministic-matcher.js';
import { candidateFixture } from './fixtures.js';

describe('pipeline externo controlado sem internet', () => {
  it('normaliza, sinaliza possível duplicata, pré-filtra, faz matching e prepara READY', () => {
    const adapter = new RemotiveJobSource({} as JobSourceHttpClient, 50_000);
    const external = {
      id: 500,
      url: 'https://remotive.com/jobs/500',
      title: 'Junior Backend Developer',
      company_name: 'Pipeline Example',
      category: 'Software Development',
      job_type: 'full_time',
      publication_date: '2026-10-03T00:00:00Z',
      candidate_required_location: 'Worldwide',
      salary: '',
      description: '<p>Node.js, PostgreSQL and Git building REST API.</p>',
    };
    const normalized = adapter.normalizeJob(external);
    const fingerprint = createCanonicalJobFingerprint(normalized);
    const possibleDuplicateFingerprints = new Set<string>();
    possibleDuplicateFingerprints.add(fingerprint);
    possibleDuplicateFingerprints.add(
      createCanonicalJobFingerprint(adapter.normalizeJob(external)),
    );
    expect(possibleDuplicateFingerprints.size).toBe(1);

    const profile = candidateFixture();
    const preFilter = new JobPreFilterService().evaluate(
      {
        ...normalized,
        location: normalized.location ?? null,
        employmentType: normalized.employmentType ?? null,
        seniority: normalized.seniority ?? null,
        publishedAt: normalized.publishedAt ?? null,
      },
      {
        keywords: ['Backend Developer'],
        excludedKeywords: [],
        locations: ['Worldwide'],
        remoteTypes: ['REMOTE'],
        employmentTypes: ['FULL_TIME'],
        seniorityLevels: ['JUNIOR'],
        publishedWithinHours: 24 * 14,
      },
      {
        skills: profile.skills.map((skill) => skill.name),
        seniorityLevels: profile.preferences.seniorityLevels,
        remoteAllowed: true,
        hybridAllowed: true,
        onsiteAllowed: false,
      },
      14,
      new Date('2026-10-03T06:00:00Z'),
    );
    expect(preFilter.passed).toBe(true);

    const match = calculateDeterministicMatch(profile, {
      title: normalized.title,
      description: normalized.description,
      city: null,
      state: null,
      location: normalized.location ?? null,
      remoteType: normalized.remoteType,
      employmentType: normalized.employmentType ?? null,
      seniority: normalized.seniority ?? null,
      salaryMin: null,
      requiredEducationLevel: null,
      requiredCertifications: [],
      skills: normalized.skills.map((skill) => ({ ...skill, yearsRequired: null })),
    });
    expect(match.decision).toBe('APPLY');
    const applicationStatus = match.decision === 'APPLY' ? 'READY' : 'REVIEW_REQUIRED';
    expect(applicationStatus).toBe('READY');
  });
});
