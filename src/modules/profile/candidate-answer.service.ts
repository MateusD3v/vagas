import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/http.js';
import { AuditService } from '../audit/audit.service.js';

export interface CandidateAnswerInput {
  questionKey: string;
  question: string;
  answer: string;
  answerType: string;
  allowedForAutomaticUse: boolean;
}

export class CandidateAnswerService {
  private readonly audit: AuditService;

  constructor(private readonly db: PrismaClient) {
    this.audit = new AuditService(db);
  }

  private async candidateId(): Promise<string> {
    const profile = await this.db.candidateProfile.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, isDemo: true },
    });
    if (!profile) throw new AppError('Perfil do candidato não encontrado', 404);
    if (profile.isDemo)
      throw new AppError('Substitua o perfil de demonstração antes de salvar respostas', 409);
    return profile.id;
  }
  async list() {
    const candidateId = await this.candidateId();
    return this.db.candidateAnswer.findMany({
      where: { candidateId },
      orderBy: [{ questionKey: 'asc' }],
    });
  }

  async upsert(input: CandidateAnswerInput) {
    const candidateId = await this.candidateId();
    const answer = await this.db.candidateAnswer.upsert({
      where: { candidateId_questionKey: { candidateId, questionKey: input.questionKey } },
      create: { candidateId, ...input },
      update: {
        question: input.question,
        answer: input.answer,
        answerType: input.answerType,
        allowedForAutomaticUse: input.allowedForAutomaticUse,
      },
    });
    await this.audit.record('CANDIDATE_ANSWER_UPSERTED', 'CandidateAnswer', answer.id, {
      questionKey: answer.questionKey,
      allowedForAutomaticUse: answer.allowedForAutomaticUse,
    });
    return answer;
  }
  async update(id: string, input: CandidateAnswerInput) {
    const candidateId = await this.candidateId();
    const existing = await this.db.candidateAnswer.findFirst({ where: { id, candidateId } });
    if (!existing) throw new AppError('Resposta não encontrada', 404);

    const answer = await this.db.candidateAnswer.update({
      where: { id },
      data: input,
    });
    await this.audit.record('CANDIDATE_ANSWER_UPSERTED', 'CandidateAnswer', answer.id, {
      questionKey: answer.questionKey,
      allowedForAutomaticUse: answer.allowedForAutomaticUse,
    });
    return answer;
  }

  async remove(id: string): Promise<void> {
    const candidateId = await this.candidateId();
    const existing = await this.db.candidateAnswer.findFirst({ where: { id, candidateId } });
    if (!existing) throw new AppError('Resposta não encontrada', 404);
    await this.db.candidateAnswer.delete({ where: { id } });
    await this.audit.record('CANDIDATE_ANSWER_DELETED', 'CandidateAnswer', id, {
      questionKey: existing.questionKey,
    });
  }
}
