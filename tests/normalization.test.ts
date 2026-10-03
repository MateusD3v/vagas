import { describe, expect, it } from 'vitest';
import { extractKnownSkills } from '../src/integrations/job-sources/shared/normalization.js';

describe('normalização de competências', () => {
  it('não confunde Git com palavras como digital ou GitHub', () => {
    const skills = extractKnownSkills(
      'Digital Solutions Architect',
      'Build digital products and collaborate through GitHub.',
    );
    expect(skills.map((item) => item.skill)).not.toContain('Git');
  });

  it('não confunde Java com JavaScript', () => {
    const skills = extractKnownSkills('Frontend Developer', 'React and JavaScript applications.');
    expect(skills.map((item) => item.skill)).toContain('JavaScript');
    expect(skills.map((item) => item.skill)).not.toContain('Java');
  });

  it('reconhece competências como termos completos', () => {
    const skills = extractKnownSkills(
      'Node.js Backend Developer',
      'Work with Java, Git, Docker and REST API.',
    );
    expect(skills.map((item) => item.skill)).toEqual(
      expect.arrayContaining(['Node.js', 'Java', 'Git', 'Docker', 'REST API']),
    );
  });
});
