import { normalizeText } from '../../shared/text.js';
import type { ApplicationQuestion } from './application-channel.js';

export type QuestionReadinessStatus =
  'PROFILE_READY' | 'SAVED_ANSWER_READY' | 'MANUAL_REQUIRED' | 'MANUAL_SENSITIVE';

export interface QuestionReadinessCandidate {
  fullName: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
}

export interface ReusableAnswer {
  questionKey: string;
  question: string;
  answer: string;
  allowedForAutomaticUse: boolean;
}

export interface QuestionReadinessResult {
  label: string;
  required: boolean;
  status: QuestionReadinessStatus;
  source: 'PROFILE' | 'SAVED_ANSWER' | 'MANUAL';
  answer?: string;
  sensitive: boolean;
}

const sensitiveTerms = [
  'gender',
  'genero',
  'race',
  'raca',
  'ethnicity',
  'etnia',
  'disability',
  'deficiencia',
  'veteran',
  'sexual orientation',
  'orientacao sexual',
  'religion',
  'religiao',
  'marital status',
  'estado civil',
  'date of birth',
  'birth date',
  'data de nascimento',
  'pronoun',
  'pronome',
  'gdpr',
  'consent',
  'consentimento',
  'privacy',
  'privacidade',
];

const profileFieldAliases: Record<string, keyof QuestionReadinessCandidate | 'resume'> = {
  first_name: 'fullName',
  last_name: 'fullName',
  name: 'fullName',
  full_name: 'fullName',
  email: 'email',
  phone: 'phone',
  phone_number: 'phone',
  location: 'city',
  city: 'city',
  state: 'state',
  linkedin: 'linkedinUrl',
  linkedin_url: 'linkedinUrl',
  github: 'githubUrl',
  github_url: 'githubUrl',
  portfolio: 'portfolioUrl',
  portfolio_url: 'portfolioUrl',
  resume: 'resume',
  resume_text: 'resume',
  resume_content: 'resume',
};

function includesSensitiveTerm(label: string): boolean {
  const normalized = normalizeText(label);
  return sensitiveTerms.some((term) => normalized.includes(normalizeText(term)));
}

function fieldReady(question: ApplicationQuestion, candidate: QuestionReadinessCandidate): boolean {
  return question.fields.some((field) => {
    const name = field.name?.toLowerCase();
    if (!name) return false;
    const mapped = profileFieldAliases[name];
    if (!mapped) return false;
    if (mapped === 'resume') return true;
    return Boolean(candidate[mapped]);
  });
}

function findSavedAnswer(
  question: ApplicationQuestion,
  answers: ReusableAnswer[],
): ReusableAnswer | undefined {
  const label = normalizeText(question.label);
  return answers.find((answer) => {
    if (!answer.allowedForAutomaticUse) return false;
    const questionText = normalizeText(answer.question);
    const key = normalizeText(answer.questionKey.replace(/[_-]+/g, ' '));
    return questionText === label || key === label;
  });
}

export function evaluateApplicationQuestionReadiness(
  questions: ApplicationQuestion[],
  candidate: QuestionReadinessCandidate,
  answers: ReusableAnswer[],
): QuestionReadinessResult[] {
  return questions.map((question) => {
    const sensitive = includesSensitiveTerm(question.label);
    if (sensitive) {
      return {
        label: question.label,
        required: question.required,
        status: 'MANUAL_SENSITIVE' as const,
        source: 'MANUAL' as const,
        sensitive: true,
      };
    }

    if (fieldReady(question, candidate)) {
      return {
        label: question.label,
        required: question.required,
        status: 'PROFILE_READY' as const,
        source: 'PROFILE' as const,
        sensitive: false,
      };
    }

    const saved = findSavedAnswer(question, answers);
    if (saved) {
      return {
        label: question.label,
        required: question.required,
        status: 'SAVED_ANSWER_READY' as const,
        source: 'SAVED_ANSWER' as const,
        answer: saved.answer,
        sensitive: false,
      };
    }

    return {
      label: question.label,
      required: question.required,
      status: 'MANUAL_REQUIRED' as const,
      source: 'MANUAL' as const,
      sensitive: false,
    };
  });
}
