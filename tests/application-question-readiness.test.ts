import { describe, expect, it } from 'vitest';
import { evaluateApplicationQuestionReadiness } from '../src/modules/applications/application-question-readiness.js';

const candidate = {
  fullName: 'Mateus Arruda',
  email: 'candidate@example.com',
  phone: '+55 00 00000-0000',
  city: 'Ananindeua',
  state: 'PA',
  linkedinUrl: 'https://www.linkedin.com/in/candidate',
  githubUrl: null,
  portfolioUrl: null,
};

describe('application question readiness', () => {
  it('reconhece campos básicos que já existem no perfil', () => {
    const result = evaluateApplicationQuestionReadiness(
      [
        {
          label: 'First Name',
          required: true,
          fields: [{ name: 'first_name', type: 'input_text' }],
        },
        { label: 'Email', required: true, fields: [{ name: 'email', type: 'input_text' }] },
        { label: 'Resume', required: true, fields: [{ name: 'resume', type: 'input_file' }] },
      ],
      candidate,
      [],
    );

    expect(result.map((item) => item.status)).toEqual([
      'PROFILE_READY',
      'PROFILE_READY',
      'PROFILE_READY',
    ]);
  });

  it('usa somente resposta salva explicitamente autorizada e com pergunta correspondente', () => {
    const result = evaluateApplicationQuestionReadiness(
      [{ label: 'Why do you want to work here?', required: true, fields: [] }],
      candidate,
      [
        {
          questionKey: 'motivation',
          question: 'Why do you want to work here?',
          answer: 'Quero contribuir com minha experiência em tecnologia.',
          allowedForAutomaticUse: true,
        },
      ],
    );

    expect(result[0]).toMatchObject({
      status: 'SAVED_ANSWER_READY',
      source: 'SAVED_ANSWER',
      answer: 'Quero contribuir com minha experiência em tecnologia.',
    });
  });

  it('mantém demografia, consentimento e respostas não autorizadas como manuais', () => {
    const result = evaluateApplicationQuestionReadiness(
      [
        { label: 'Gender', required: true, fields: [{ name: 'gender', type: 'select' }] },
        { label: 'GDPR processing consent', required: true, fields: [] },
        { label: 'Do you have production experience?', required: true, fields: [] },
      ],
      candidate,
      [
        {
          questionKey: 'production',
          question: 'Do you have production experience?',
          answer: 'Sim',
          allowedForAutomaticUse: false,
        },
      ],
    );

    expect(result.map((item) => item.status)).toEqual([
      'MANUAL_SENSITIVE',
      'MANUAL_SENSITIVE',
      'MANUAL_REQUIRED',
    ]);
  });
});
