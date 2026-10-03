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

export interface ProfileQuestionValue {
  field: string;
  value: string;
}

export interface QuestionReadinessResult {
  label: string;
  required: boolean;
  status: QuestionReadinessStatus;
  source: 'PROFILE' | 'SAVED_ANSWER' | 'MANUAL';
  answer?: string;
  profileValues?: ProfileQuestionValue[];
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

interface ProfileFieldReadiness {
  ready: boolean;
  value?: string;
}

function profileFieldReadiness(
  fieldName: string,
  candidate: QuestionReadinessCandidate,
): ProfileFieldReadiness | undefined {
  const name = fieldName.toLowerCase();
  const nameParts = candidate.fullName.trim().split(/\s+/).filter(Boolean);

  if (name === 'first_name') {
    return nameParts[0] ? { ready: true, value: nameParts[0] } : { ready: false };
  }
  if (name === 'last_name') {
    return nameParts.length > 1
      ? { ready: true, value: nameParts.slice(1).join(' ') }
      : { ready: false };
  }
  if (name === 'name' || name === 'full_name') {
    return candidate.fullName ? { ready: true, value: candidate.fullName } : { ready: false };
  }
  if (name === 'email') {
    return candidate.email ? { ready: true, value: candidate.email } : { ready: false };
  }
  if (name === 'phone' || name === 'phone_number') {
    return candidate.phone ? { ready: true, value: candidate.phone } : { ready: false };
  }
  if (name === 'city') {
    return candidate.city ? { ready: true, value: candidate.city } : { ready: false };
  }
  if (name === 'state') {
    return candidate.state ? { ready: true, value: candidate.state } : { ready: false };
  }
  if (name === 'location') {
    const location = [candidate.city, candidate.state].filter(Boolean).join(' - ');
    return location ? { ready: true, value: location } : { ready: false };
  }
  if (name === 'linkedin' || name === 'linkedin_url') {
    return candidate.linkedinUrl
      ? { ready: true, value: candidate.linkedinUrl }
      : { ready: false };
  }
  if (name === 'github' || name === 'github_url') {
    return candidate.githubUrl ? { ready: true, value: candidate.githubUrl } : { ready: false };
  }
  if (name === 'portfolio' || name === 'portfolio_url') {
    return candidate.portfolioUrl
      ? { ready: true, value: candidate.portfolioUrl }
      : { ready: false };
  }
  if (name === 'resume' || name === 'resume_text' || name === 'resume_content') {
    return { ready: true };
  }

  return undefined;
}

function profileQuestionReadiness(
  question: ApplicationQuestion,
  candidate: QuestionReadinessCandidate,
): ProfileQuestionValue[] | null {
  if (!question.fields.length) return null;

  const checked = question.fields.map((field) => {
    const name = field.name?.toLowerCase();
    if (!name) return null;
    const readiness = profileFieldReadiness(name, candidate);
    if (!readiness?.ready) return null;
    return readiness.value ? { field: name, value: readiness.value } : { field: name };
  });

  if (checked.some((item) => item === null)) return null;
  return checked.flatMap((item) =>
    item && 'value' in item && item.value ? [{ field: item.field, value: item.value }] : [],
  );
}

function includesSensitiveTerm(label: string): boolean {
  const normalized = normalizeText(label);
  return sensitiveTerms.some((term) => normalized.includes(normalizeText(term)));
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

    const profileValues = profileQuestionReadiness(question, candidate);
    if (profileValues) {
      return {
        label: question.label,
        required: question.required,
        status: 'PROFILE_READY' as const,
        source: 'PROFILE' as const,
        ...(profileValues.length === 1 ? { answer: profileValues[0]?.value } : {}),
        profileValues,
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
