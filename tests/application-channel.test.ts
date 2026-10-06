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

  it('classifica portais principais como canais próprios', () => {
    expect(
      classifyApplicationChannel(
        'https://empresa.gupy.io/job/eyJqb2JJZCI6MTIzfQ==',
        'gupy',
      ),
    ).toEqual({ platform: 'GUPY', flow: 'ATS', label: 'Gupy' });

    expect(
      classifyApplicationChannel(
        'https://vagas.solides.com.br/vaga/123/analista-de-suporte',
        'solides',
      ),
    ).toEqual({ platform: 'SOLIDES', flow: 'ATS', label: 'Sólides' });

    expect(
      classifyApplicationChannel(
        'https://www.glassdoor.com.br/job-listing/analista-de-suporte-example-JV.htm',
        'manual',
      ),
    ).toEqual({ platform: 'GLASSDOOR', flow: 'MANUAL', label: 'Glassdoor' });
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
      classifyApplicationChannel('https://acme.recruitee.com/o/junior-developer', 'manual'),
    ).toMatchObject({ platform: 'RECRUITEE', flow: 'ATS' });
    expect(
      classifyApplicationChannel('https://apply.workable.com/acme/j/ABC123', 'manual'),
    ).toMatchObject({ platform: 'WORKABLE', flow: 'ATS' });
    expect(
      classifyApplicationChannel('https://acme.jobs.personio.de/job/12345', 'manual'),
    ).toMatchObject({ platform: 'PERSONIO', flow: 'ATS' });
    expect(
      classifyApplicationChannel(
        'https://careers.pinpointhq.com/en/postings/9447bc5f-30f9-4dbe-8531-3d66df1fc1a5',
        'manual',
      ),
    ).toMatchObject({ platform: 'PINPOINT', flow: 'ATS' });
    expect(
      classifyApplicationChannel(
        'https://unio-digital.breezy.hr/p/e03e9b1c94de-tier-iii-service-desk-engineer',
        'manual',
      ),
    ).toMatchObject({ platform: 'BREEZY', flow: 'ATS' });
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
            fields: [
              {
                name: 'question_1',
                type: 'multi_value_single_select',
                values: [
                  { label: 'Sim', value: 1, ignored: true },
                  { label: 'Não', value: 0 },
                  { value: 2 },
                ],
                ignored: 'x',
              },
            ],
          },
          { label: 123, required: true },
        ],
      }),
    ).toEqual([
      {
        label: 'Motivação',
        required: true,
        fields: [
          {
            name: 'question_1',
            type: 'multi_value_single_select',
            values: [
              { label: 'Sim', value: 1 },
              { label: 'Não', value: 0 },
            ],
          },
        ],
      },
    ]);
    expect(readApplicationQuestions(null)).toEqual([]);
  });
});
