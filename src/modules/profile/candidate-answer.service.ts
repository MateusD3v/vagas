import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/http.js';
import { normalizeText } from '../../shared/text.js';
import { readApplicationQuestions } from '../applications/application-channel.js';
import { isSensitiveApplicationQuestion } from '../applications/application-question-readiness.js';
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

  private validateAutomaticUse(input: CandidateAnswerInput): void {
    if (input.allowedForAutomaticUse && isSensitiveApplicationQuestion(input.question)) {
      throw new AppError(
        'Perguntas sensíveis ou de consentimento não podem ser reutilizadas automaticamente',
        400,
      );
    }
  }

  private questionKey(label: string): string {
    const slug = normalizeText(label)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `ats_${slug.slice(0, 100) || 'question'}`;
  }

  async upsert(input: CandidateAnswerInput) {
    this.validateAutomaticUse(input);
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
  async upsertForApplication(
    applicationId: string,
    input: {
      question: string;
      answer: string;
      allowedForAutomaticUse: boolean;
    },
  ) {
    const candidateId = await this.candidateId();
    const application = await this.db.application.findFirst({
      where: { id: applicationId, candidateId },
      select: { job: { select: { rawData: true } } },
    });
    if (!application) throw new AppError('Candidatura não encontrada', 404);

    const requested = normalizeText(input.question);
    const question = readApplicationQuestions(application.job.rawData).find(
      (item) => normalizeText(item.label) === requested,
    );
    if (!question) {
      throw new AppError('Pergunta não pertence ao formulário conhecido desta candidatura', 404);
    }

    const candidateAnswer: CandidateAnswerInput = {
      questionKey: this.questionKey(question.label),
      question: question.label,
      answer: input.answer,
      answerType: question.fields[0]?.type ?? 'TEXT',
      allowedForAutomaticUse: input.allowedForAutomaticUse,
    };
    this.validateAutomaticUse(candidateAnswer);

    const answer = await this.db.candidateAnswer.upsert({
      where: {
        candidateId_questionKey: {
          candidateId,
          questionKey: candidateAnswer.questionKey,
        },
      },
      create: { candidateId, ...candidateAnswer },
      update: {
        question: candidateAnswer.question,
        answer: candidateAnswer.answer,
        answerType: candidateAnswer.answerType,
        allowedForAutomaticUse: candidateAnswer.allowedForAutomaticUse,
      },
    });
    await this.audit.record('CANDIDATE_ANSWER_UPSERTED', 'CandidateAnswer', answer.id, {
      applicationId,
      questionKey: answer.questionKey,
      allowedForAutomaticUse: answer.allowedForAutomaticUse,
    });
    return answer;
  }

  async update(id: string, input: CandidateAnswerInput) {
    this.validateAutomaticUse(input);
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
