import { describe, expect, it } from 'vitest';
import {
  classifyApplicationChannel,
  readApplicationQuestions,
  readFastApplyHint,
} from '../src/modules/applications/application-channel.js';

describe('application channel', () => {
  it('classifica LinkedIn Easy Apply somente quando existe hint explícito', () => {
    expect(
      classifyApplicationChannel('https://www.linkedin.com/jobs/view/123', 'linkedin-manual', true),
    ).toEqual({
      platform: 'LINKEDIN',
      flow: 'FAST_APPLY',
      label: 'LinkedIn Easy Apply',
    });

    expect(
      classifyApplicationChannel('https://www.linkedin.com/jobs/view/123', 'linkedin-manual', false)
        .flow,
    ).toBe('MANUAL');
  });

  it('classifica Indeed Apply somente com hint explícito', () => {
    expect(
      classifyApplicationChannel('https://br.indeed.com/viewjob?jk=abc', 'indeed-manual', true),
    ).toMatchObject({ platform: 'INDEED', flow: 'FAST_APPLY' });
  });

  it('reconhece ATS conhecidos pela URL sem presumir submissão automática', () => {
    expect(
      classifyApplicationChannel('https://boards.greenhouse.io/acme/jobs/1', 'manual'),
    ).toEqual({
      platform: 'GREENHOUSE',
      flow: 'ATS',
      label: 'Greenhouse',
    });
    expect(classifyApplicationChannel('https://jobs.lever.co/acme/1', 'manual')).toMatchObject({
      platform: 'LEVER',
      flow: 'ATS',
    });
    expect(classifyApplicationChannel('https://jobs.ashbyhq.com/acme/1', 'manual')).toMatchObject({
      platform: 'ASHBY',
      flow: 'ATS',
    });
    expect(
      classifyApplicationChannel(
        'https://jobs.smartrecruiters.com/acme/123456-junior-developer',
        'manual',
      ),
    ).toMatchObject({ platform: 'SMARTRECRUITERS', flow: 'ATS' });
    expect(
      classifyApplicationChannel('https://acme.wd5.myworkdayjobs.com/job/1', 'manual'),
    ).toMatchObject({ platform: 'WORKDAY', flow: 'ATS' });
  });

  it('lê fastApply apenas de boolean true explícito', () => {
    expect(readFastApplyHint({ fastApply: true })).toBe(true);
    expect(readFastApplyHint({ fastApply: 'true' })).toBe(false);
    expect(readFastApplyHint(null)).toBe(false);
  });

  it('lê perguntas do ATS de forma defensiva', () => {
    expect(
      readApplicationQuestions({
        applicationQuestions: [
          {
            label: 'Motivação',
            required: true,
            fields: [{ name: 'question_1', type: 'textarea', ignored: 'x' }],
          },
          { label: 123, required: true },
        ],
      }),
    ).toEqual([
      {
        label: 'Motivação',
        required: true,
        fields: [{ name: 'question_1', type: 'textarea' }],
      },
    ]);
    expect(readApplicationQuestions(null)).toEqual([]);
  });
});
