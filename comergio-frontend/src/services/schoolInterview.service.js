import api from '../lib/api';
import {
  SCHOOL_INTERVIEW_AREAS,
  SCHOOL_INTERVIEW_QUESTIONS,
  buildSchoolInterviewReport,
  normalizeQuestionAnswer,
} from '../lib/schoolInterview';

export function buildSchoolInterviewAnalyzePayload({ schoolName, note, answers }) {
  const localReport = buildSchoolInterviewReport(answers);
  const questionnaire = SCHOOL_INTERVIEW_QUESTIONS.map((question) => {
    const answer = normalizeQuestionAnswer(answers[question.id]);
    const selectedLabels = question.options
      .filter((option) => answer.selectedIds.includes(option.id))
      .map((option) => option.label);
    const areaLabel = SCHOOL_INTERVIEW_AREAS.find((area) => area.id === question.areaId)?.label || '';
    return {
      id: question.id,
      areaId: question.areaId,
      areaLabel,
      prompt: question.prompt,
      selectedLabels,
      otherText: answer.otherText,
    };
  });

  return {
    schoolName,
    note,
    answers,
    localReport,
    questionnaire,
  };
}

export function analyzeSchoolInterview(payload) {
  return api.post('/public/school-interview/analyze', payload, { timeout: 90000 });
}

export function saveSchoolInterview(payload) {
  return api.post('/public/school-interview', payload);
}
