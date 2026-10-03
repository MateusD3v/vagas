import { describe, expect, it } from 'vitest';
import { evaluateRoleAlignment } from '../src/modules/matching/role-alignment.js';

const targets = [
  'Analista de Suporte',
  'Suporte TI',
  'Help Desk',
  'Service Desk',
  'Desenvolvedor Backend Jr',
  'Desenvolvedor Java Jr',
  'Desenvolvedor Flutter Jr',
  'Estágio em Desenvolvimento',
];

describe('alinhamento de cargo', () => {
  it('reconhece service desk como suporte de TI', () => {
    expect(
      evaluateRoleAlignment({
        title: 'Tier III Service Desk Engineer',
        jobSkills: ['Git', 'Hardware'],
        targetRoles: targets,
        targetTechnologies: ['Windows', 'Redes', 'Node.js', 'Java', 'Flutter'],
      }),
    ).toMatchObject({ aligned: true });
  });

  it('não confunde customer support genérico com suporte de TI', () => {
    expect(
      evaluateRoleAlignment({
        title: 'Customer Support Specialist',
        jobSkills: ['Git'],
        targetRoles: targets,
        targetTechnologies: ['Windows', 'Redes', 'Node.js', 'Java'],
      }),
    ).toMatchObject({ aligned: false });
  });

  it('reconhece backend engineer com tecnologia alvo', () => {
    expect(
      evaluateRoleAlignment({
        title: 'Backend Engineer - Agentic AI',
        jobSkills: ['Java', 'Docker', 'Git'],
        targetRoles: targets,
        targetTechnologies: ['Node.js', 'Java', 'Flutter'],
      }),
    ).toMatchObject({ aligned: true, family: 'BACKEND' });
  });

  it('bloqueia solutions architect apesar de skill genérica compatível', () => {
    expect(
      evaluateRoleAlignment({
        title: 'Payments Solutions Architect',
        jobSkills: ['Git'],
        targetRoles: targets,
        targetTechnologies: ['Node.js', 'Java', 'Flutter'],
      }),
    ).toMatchObject({ aligned: false });
  });

  it('reconhece estágio de desenvolvimento em inglês', () => {
    expect(
      evaluateRoleAlignment({
        title: 'Software Development Intern',
        jobSkills: ['Node.js'],
        targetRoles: targets,
        targetTechnologies: ['Node.js'],
      }),
    ).toMatchObject({ aligned: true, family: 'BACKEND' });
  });
});
