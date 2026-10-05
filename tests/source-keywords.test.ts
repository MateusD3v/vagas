import { describe, expect, it } from 'vitest';
import { sourceSearchKeywords } from '../src/modules/sources/source-keywords.js';

describe('sourceSearchKeywords', () => {
  const profileKeywords = [
    'Technical Support',
    'IT Support',
    'Help Desk',
    'Service Desk',
    'Backend Developer',
    'Node.js',
    'Java Developer',
    'Flutter Developer',
    'Analista de Suporte',
    'Suporte TI',
    'Desenvolvedor Backend',
    'Estágio Desenvolvimento',
  ];

  it('traduz aliases comuns em português e remove duplicatas nas fontes globais rotativas', () => {
    expect(sourceSearchKeywords('himalayas', profileKeywords)).toEqual([
      'Technical Support',
      'IT Support',
      'Help Desk',
      'Service Desk',
      'Backend Developer',
      'Node.js',
      'Java Developer',
      'Flutter Developer',
      'Software Engineering Intern',
    ]);
  });

  it.each(['remotive', 'jobicy'])('aplica a mesma normalização em %s', (source) => {
    const keywords = sourceSearchKeywords(source, [
      'Desenvolvedora Java',
      'Suporte Técnico',
      'Estagio TI',
    ]);

    expect(keywords).toEqual([
      'Java Developer',
      'Technical Support',
      'Software Engineering Intern',
    ]);
  });

  it('não altera keywords de fontes que processam a lista completa', () => {
    expect(sourceSearchKeywords('arbeitnow', profileKeywords)).toEqual(profileKeywords);
  });

  it('preserva termos desconhecidos e remove apenas duplicatas sem diferenciar maiúsculas', () => {
    expect(
      sourceSearchKeywords('remotive', ['QA Analyst', 'qa analyst', 'Node.js', 'node.JS']),
    ).toEqual(['QA Analyst', 'Node.js']);
  });
});
