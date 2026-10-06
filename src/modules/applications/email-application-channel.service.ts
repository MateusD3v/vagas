import type { PrismaClient } from '@prisma/client';
import { readApplicationQuestions } from './application-channel.js';
import { lockCandidateSubmissions } from './submission-lock.js';

const allowedSources = [
  'remotive',
  'arbeitnow',
  'jobicy',
  'himalayas',
  'remoteok',
  'weworkremotely',
  'solides',
  'gupy',
];

// Deliberately recognizes only explicit, unambiguous resume-by-email instructions.
// A generic contact email, a negation, multiple recipients, or a custom subject stays assisted.
export function discoverEmailChannel(
  description: string,
): { recipient: string; evidenceQuote: string } | null {
  const text = description
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
  if (/\b(?:assunto|subject)\b/i.test(text)) return null;
  const addresses = [
    ...new Set(text.match(/[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []),
  ];
  if (addresses.length !== 1) return null;
  const recipient = addresses[0]!;
  const offset = text.indexOf(recipient);
  const prefix = text.slice(Math.max(0, offset - 220), offset);
  // Avoid instructions separated by another sentence or negations anywhere in the local context.
  if (/\b(?:nao|não|never|not|don't|dont)\b/i.test(prefix)) return null;
  const instruction = prefix.match(
    /\b(?:envie|enviar|encaminhe|encaminhar|send|email)\s+(?:(?:seu|sua|your|o|a|the)\s+)?(?:curr[ií]culo|cv|resume|application)(?:\s+(?:atualizado|updated))?\s+(?:para|to)\s+(?:(?:o|a|e-?mail|endereco|endereço|address|de|at)\s*[:-]?\s*)*$/i,
  )?.[0];
  if (!instruction) return null;
  return { recipient, evidenceQuote: `${instruction}${recipient}` };
}

export class EmailApplicationChannelService {
  constructor(private readonly db: PrismaClient) {}

  async discoverPending(limit: number): Promise<number> {
    const applications = await this.db.application.findMany({
      where: {
        status: 'READY',
        submittedAt: null,
        submissionAttempt: { is: null },
        emailTarget: { is: null },
        candidate: { isDemo: false, policy: { autoApplyEnabled: true } },
        job: { isActive: true, source: { in: allowedSources }, status: 'ANALYZED' },
      },
      orderBy: { matchScore: 'desc' },
      take: limit,
      include: { job: true, candidate: true },
    });
    let discovered = 0;
    for (const application of applications) {
      if (readApplicationQuestions(application.job.rawData).some((question) => question.required))
        continue;
      const channel = discoverEmailChannel(application.job.description);
      const evidenceUrl = application.job.originalUrl ?? application.job.applicationUrl;
      if (!channel || !evidenceUrl) continue;
      try {
        if (new URL(evidenceUrl).protocol !== 'https:') continue;
      } catch {
        continue;
      }
      const subject = `Candidatura - ${application.job.title}`;
      if (subject.length > 200 || /[\r\n]/.test(subject)) continue;
      const body = `Olá,\n\nGostaria de me candidatar à vaga de ${application.job.title}. Meu currículo segue em anexo.\n\nAtenciosamente,\n${application.candidate.fullName}`;
      const created = await this.db.$transaction(async (tx) => {
        await lockCandidateSubmissions(tx, application.candidateId);
        const current = await tx.application.findUnique({
          where: { id: application.id },
          include: { submissionAttempt: true, emailTarget: true },
        });
        if (
          !current ||
          current.submittedAt ||
          current.submissionAttempt ||
          current.emailTarget ||
          current.status !== 'READY'
        )
          return false;
        await tx.emailApplicationTarget.create({
          data: {
            applicationId: application.id,
            ...channel,
            subject,
            body,
            evidenceUrl,
            confirmationSource: 'JOB_INSTRUCTIONS',
          },
        });
        await tx.auditLog.create({
          data: {
            event: 'EMAIL_APPLICATION_CHANNEL_DISCOVERED',
            entityType: 'Application',
            entityId: application.id,
            metadata: { evidenceUrl },
          },
        });
        return true;
      });
      if (created) discovered++;
    }
    return discovered;
  }
}
