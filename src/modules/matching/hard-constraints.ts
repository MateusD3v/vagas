import { includesText, normalizeText, sameText } from '../../shared/text.js';
import type { MatchCandidate, MatchJob } from './matching.types.js';

const seniorTerms = ['senior', 'sr', 'especialista', 'lead', 'lider'];
const juniorTargets = ['junior', 'jr', 'entry', 'intern', 'estagio', 'trainee'];

export function evaluateHardConstraints(candidate: MatchCandidate, job: MatchJob): string[] {
  const reasons: string[] = [];
  const title = normalizeText(job.title);
  const seniority = normalizeText(job.seniority ?? '');

  if (
    candidate.preferences.excludedRoles.some(
      (role) => includesText(job.title, role) || includesText(role, job.title),
    )
  ) {
    reasons.push('Cargo presente na lista de cargos excluídos');
  }

  const seeksOnlyEarlyCareer =
    candidate.preferences.seniorityLevels.length > 0 &&
    candidate.preferences.seniorityLevels.every((level) =>
      juniorTargets.some((term) => includesText(level, term)),
    );
  if (
    seeksOnlyEarlyCareer &&
    seniorTerms.some((term) => title.includes(term) || seniority.includes(term))
  ) {
    reasons.push('Senioridade sênior incompatível com os níveis desejados pelo candidato');
  }

  if (job.remoteType === 'REMOTE' && !candidate.preferences.remoteAllowed) {
    reasons.push('Trabalho remoto não permitido nas preferências');
  }
  if (job.remoteType === 'HYBRID' && !candidate.preferences.hybridAllowed) {
    reasons.push('Trabalho híbrido não permitido nas preferências');
  }
  if (job.remoteType === 'ONSITE') {
    if (!candidate.preferences.onsiteAllowed) {
      reasons.push('Trabalho presencial não permitido nas preferências');
    } else {
      const differentRegion =
        Boolean(job.state && candidate.state && !sameText(job.state, candidate.state)) ||
        Boolean(job.city && candidate.city && !sameText(job.city, candidate.city));
      if (differentRegion && !candidate.preferences.relocationAllowed) {
        reasons.push(
          'Vaga presencial em outra região e candidato sem disponibilidade para mudança',
        );
      }
    }
  }

  const missingCertifications = job.requiredCertifications.filter(
    (required) => !candidate.certifications.some((owned) => sameText(owned, required)),
  );
  if (missingCertifications.length) {
    reasons.push(`Certificação obrigatória ausente: ${missingCertifications.join(', ')}`);
  }

  if (normalizeText(job.requiredEducationLevel ?? '').includes('graduacao completa')) {
    const notComplete = !candidate.graduationDate || candidate.graduationDate > new Date();
    if (notComplete) reasons.push('Vaga exige graduação concluída');
  }

  return reasons;
}
