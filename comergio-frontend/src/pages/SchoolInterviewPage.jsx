import { useEffect, useMemo, useRef, useState } from 'react';
import colibriLogo from '../assets/colibrisinfondo.png';
import {
  INTERVIEW_OTHER_OPTION_ID,
  SCHOOL_INTERVIEW_OTHER_PLACEHOLDERS,
  SCHOOL_INTERVIEW_QUESTIONS,
  buildSchoolInterviewReport,
  interviewAnswersComplete,
  isQuestionAnswerComplete,
  normalizeQuestionAnswer,
} from '../lib/schoolInterview';
import {
  analyzeSchoolInterview,
  buildSchoolInterviewAnalyzePayload,
  saveSchoolInterview,
} from '../services/schoolInterview.service';
import './SchoolInterviewPage.css';

const EMPTY_PROFILE = {
  schoolName: '',
  note: '',
};

function InterviewReportContent({ profile, report, whatsappText, onRestart }) {
  return (
    <>
      <div className="interview-result__hero">
        <div>
          <p className="interview-kicker">{profile.schoolName}</p>
          <h1>{report.band?.headline}</h1>
          <p className="interview-lead">{report.band?.paragraph}</p>
          <p className="interview-band">{report.band?.label}</p>
        </div>
        <Donut value={report.overall || 0} />
      </div>
      <p className="interview-disclaimer">
        Este índice describe qué tan reunidos están hoy los procesos. Un número más bajo significa más espacio para acompañar al equipo, no una falla del colegio.
      </p>

      <div className="interview-areas">
        {report.areas.map((area) => (
          <article key={area.id}>
            <header>
              <h2>{area.label}</h2>
              <strong>{area.score == null ? 'No aplica' : area.score}</strong>
            </header>
            <div className="interview-bar" aria-hidden="true">
              <span style={{ width: `${area.score || 0}%` }} />
            </div>
            <p>{area.sentence}</p>
          </article>
        ))}
      </div>

      {(report.otherInsights || []).length > 0 ? (
        <article className="interview-note-card">
          <h2>Lo que nos contaron</h2>
          <ul className="interview-other-insights">
            {report.otherInsights.map((item) => (
              <li key={item.questionId}>
                <strong>{item.areaLabel}.</strong> {item.summary || item.text}
                {item.accompaniment ? <span>{item.accompaniment}</span> : null}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <div className="interview-split">
        <article>
          <h2>Lo que ya está bien cuidado</h2>
          <ul>
            {report.strengths.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
        <article>
          <h2>Cómo Comergio puede acompañar</h2>
          <ul>
            {report.accompaniments.map((item) => (
              <li key={`${item.questionId}-${item.text}`}>
                <strong>{item.title}.</strong> {item.text}
              </li>
            ))}
          </ul>
        </article>
      </div>

      {profile.note ? (
        <article className="interview-note-card">
          <h2>Lo que precisó el colegio</h2>
          <p>{profile.note}</p>
        </article>
      ) : null}

      <div className="interview-actions interview-actions--result">
        <a className="interview-primary" href={`https://wa.me/573016214806?text=${whatsappText}`}>
          Conversar esta lectura
        </a>
        <button className="interview-ghost" onClick={() => window.print()} type="button">Imprimir</button>
        <button className="interview-ghost" onClick={onRestart} type="button">
          Nueva lectura
        </button>
      </div>
    </>
  );
}

function Donut({ value }) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const safeValue = Number.isFinite(value) ? value : 0;
  const offset = circumference * (1 - safeValue / 100);

  return (
    <div className="interview-donut" aria-label={`Índice de articulación ${safeValue}`}>
      <svg viewBox="0 0 200 200">
        <circle className="interview-donut__track" cx="100" cy="100" r={radius} />
        <circle
          className="interview-donut__value"
          cx="100"
          cy="100"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="interview-donut__label">
        <strong>{safeValue}</strong>
        <span>de 100</span>
      </div>
    </div>
  );
}

function SchoolInterviewPage() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
  const [aiReport, setAiReport] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [resultView, setResultView] = useState(null);
  const saveStartedRef = useRef(false);
  const analyzeStartedRef = useRef(false);

  const totalSteps = SCHOOL_INTERVIEW_QUESTIONS.length + 1;
  const totalQuestionCount = totalSteps;
  const isIntro = step === 0;
  const isSchoolNameStep = step === 1;
  const questionIndex = step - 2;
  const question = questionIndex >= 0 && questionIndex < SCHOOL_INTERVIEW_QUESTIONS.length
    ? SCHOOL_INTERVIEW_QUESTIONS[questionIndex]
    : null;
  const isResult = step > totalSteps;
  const localReport = useMemo(
    () => (isResult ? buildSchoolInterviewReport(answers) : null),
    [answers, isResult],
  );
  const reportToSave = aiReport || localReport;
  const displayedReport = resultView === 'ai'
    ? aiReport
    : resultView === 'system'
      ? localReport
      : null;
  const aiReady = Boolean(aiReport);
  const canShowAiView = aiReady && !aiLoading;

  useEffect(() => {
    if (!isResult || !localReport || analyzeStartedRef.current) {
      return undefined;
    }
    analyzeStartedRef.current = true;
    let cancelled = false;
    setAiLoading(true);
    setAiError('');

    analyzeSchoolInterview(buildSchoolInterviewAnalyzePayload({
      schoolName: profile.schoolName,
      note: profile.note,
      answers,
    }))
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (response?.data?.report) {
          setAiReport(response.data.report);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAiError(error?.response?.data?.message || error?.message || 'Usamos la lectura local.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [answers, isResult, localReport, profile.note, profile.schoolName]);

  useEffect(() => {
    if (!isResult || !reportToSave || aiLoading || saveStartedRef.current) {
      return undefined;
    }
    saveStartedRef.current = true;
    let cancelled = false;
    saveSchoolInterview({
      ...profile,
      answers,
      report: reportToSave,
    }).then((response) => {
      if (!cancelled) {
        setSavedId(response?.data?.id || 'saved');
      }
    }).catch(() => {
      if (!cancelled) {
        setSavedId('local');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [aiLoading, answers, isResult, profile, reportToSave]);

  const progress = isIntro ? 0 : Math.min(100, Math.round(((step - 1) / totalSteps) * 100));

  const restartInterview = () => {
    setStep(0);
    setAnswers({});
    setProfile(EMPTY_PROFILE);
    setSavedId('');
    setAiReport(null);
    setAiLoading(false);
    setAiError('');
    setResultView(null);
    saveStartedRef.current = false;
    analyzeStartedRef.current = false;
    setError('');
  };

  const toggleOption = (questionId, optionId) => {
    setAnswers((current) => {
      const answer = normalizeQuestionAnswer(current[questionId]);
      const selected = new Set(answer.selectedIds);
      if (selected.has(optionId)) {
        selected.delete(optionId);
      } else {
        selected.add(optionId);
      }
      const otherText = selected.has(INTERVIEW_OTHER_OPTION_ID) ? answer.otherText : '';
      return {
        ...current,
        [questionId]: {
          selectedIds: [...selected],
          otherText,
        },
      };
    });
    setError('');
  };

  const updateOtherText = (questionId, otherText) => {
    setAnswers((current) => {
      const answer = normalizeQuestionAnswer(current[questionId]);
      return {
        ...current,
        [questionId]: {
          ...answer,
          otherText,
        },
      };
    });
    setError('');
  };

  const goNext = () => {
    if (isSchoolNameStep) {
      if (!profile.schoolName.trim()) {
        setError('Indique el nombre del colegio.');
        return;
      }
    }
    if (question && !isQuestionAnswerComplete(answers[question.id])) {
      const answer = normalizeQuestionAnswer(answers[question.id]);
      if (!answer.selectedIds.length) {
        setError('Elija al menos una opción para continuar.');
      } else {
        setError('Cuando elige Otro, cuéntenos brevemente cómo lo hacen.');
      }
      return;
    }
    setError('');
    setStep((current) => current + 1);
  };

  const whatsappText = encodeURIComponent(
    `Hola, represento ${profile.schoolName || 'un colegio'}. Acabo de ver la lectura de procesos en Comergio y me gustaría conversarla.`
  );

  return (
    <div className="interview-page">
      <header className="interview-top">
        <img alt="Comergio" className="interview-top__logo" src={colibriLogo} />
        <p>Lectura de procesos</p>
      </header>

      {!isResult ? (
        <div className="interview-progress" aria-hidden="true">
          <span style={{ width: `${isIntro ? 6 : progress}%` }} />
        </div>
      ) : null}

      {isIntro ? (
        <section className="interview-panel interview-hero">
          <h1>Vamos a analizar tu colegio.</h1>
          <p className="interview-lead">
            Unas preguntas rápidas sobre cómo trabajan hoy. Al terminar verás un resumen claro y cómo Comergio puede acompañarlos.
          </p>
          <button className="interview-primary" onClick={() => setStep(1)} type="button">Comenzar</button>
        </section>
      ) : null}

      {isSchoolNameStep ? (
        <section className="interview-panel">
          <p className="interview-kicker">1 de {totalQuestionCount}</p>
          <h1>¿Cuál es el nombre del colegio?</h1>
          <p className="interview-help">Así personalizamos la lectura al final.</p>
          <label className="interview-school-name">
            Nombre del colegio
            <input
              autoFocus
              placeholder="Ej. International Berckley School"
              value={profile.schoolName}
              onChange={(event) => {
                setProfile((current) => ({ ...current, schoolName: event.target.value }));
                setError('');
              }}
            />
          </label>
          {error ? <p className="interview-error">{error}</p> : null}
          <div className="interview-actions">
            <button className="interview-ghost" onClick={() => setStep(0)} type="button">Atrás</button>
            <button
              className="interview-primary"
              disabled={!profile.schoolName.trim()}
              onClick={goNext}
              type="button"
            >
              Continuar
            </button>
          </div>
        </section>
      ) : null}

      {question ? (
        <section className="interview-panel">
          <p className="interview-kicker">
            {questionIndex + 2} de {totalQuestionCount}
            {' · '}
            {question.areaId === 'communications' ? 'Comunicaciones' : null}
            {question.areaId === 'billing' ? 'Cartera' : null}
            {question.areaId === 'academics' ? 'Academia' : null}
            {question.areaId === 'store' ? 'Tienda escolar' : null}
            {question.areaId === 'wellbeing' ? 'Enfermería y bienestar' : null}
          </p>
          <h1>{question.prompt}</h1>
          <p className="interview-help">{question.help}</p>
          <div className="interview-options">
            {question.options.map((option) => {
              const answer = normalizeQuestionAnswer(answers[question.id]);
              const selected = answer.selectedIds.includes(option.id);
              return (
                <button
                  className={selected ? 'is-selected' : ''}
                  key={option.id}
                  onClick={() => toggleOption(question.id, option.id)}
                  type="button"
                >
                  <span className="interview-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          {normalizeQuestionAnswer(answers[question.id]).selectedIds.includes(INTERVIEW_OTHER_OPTION_ID) ? (
            <label className="interview-other-field">
              Cuéntenos cómo lo hacen
              <textarea
                maxLength={500}
                placeholder={SCHOOL_INTERVIEW_OTHER_PLACEHOLDERS[question.id] || 'Describa brevemente cómo lo hacen hoy…'}
                rows={3}
                value={normalizeQuestionAnswer(answers[question.id]).otherText}
                onChange={(event) => updateOtherText(question.id, event.target.value.slice(0, 500))}
              />
            </label>
          ) : null}
          {questionIndex === SCHOOL_INTERVIEW_QUESTIONS.length - 1 ? (
            <label className="interview-note">
              Si quiere precisar algo, puede dejarlo aquí
              <textarea
                maxLength={2000}
                rows={4}
                value={profile.note}
                onChange={(event) => setProfile((current) => ({ ...current, note: event.target.value }))}
              />
            </label>
          ) : null}
          {error ? <p className="interview-error">{error}</p> : null}
          <div className="interview-actions">
            <button className="interview-ghost" onClick={() => setStep((current) => current - 1)} type="button">Atrás</button>
            <button
              className="interview-primary"
              disabled={!isQuestionAnswerComplete(answers[question.id])}
              onClick={goNext}
              type="button"
            >
              {questionIndex === SCHOOL_INTERVIEW_QUESTIONS.length - 1 ? 'Ver la lectura' : 'Continuar'}
            </button>
          </div>
        </section>
      ) : null}

      {isResult && localReport && !resultView ? (
        <section className="interview-panel interview-result-hub">
          <p className="interview-kicker">{profile.schoolName}</p>
          <h1>Su lectura está en camino</h1>
          <p className="interview-lead">
            Estamos analizando las respuestas. Puede ver ya la lectura automática del sistema o esperar la versión elaborada con inteligencia artificial.
          </p>
          {aiLoading ? (
            <p className="interview-ai-status">Preparando la lectura con IA… suele tardar unos segundos.</p>
          ) : null}
          {!aiLoading && aiError ? (
            <p className="interview-ai-status is-muted">{aiError}</p>
          ) : null}
          {!aiLoading && canShowAiView ? (
            <p className="interview-ai-status is-success">La lectura con IA ya está lista.</p>
          ) : null}
          <div className="interview-result-hub__actions">
            <button
              className="interview-primary"
              onClick={() => setResultView('system')}
              type="button"
            >
              Ver lectura del sistema
            </button>
            <button
              className="interview-primary interview-primary--ai"
              disabled={!canShowAiView}
              onClick={() => setResultView('ai')}
              type="button"
            >
              {aiLoading ? 'Lectura con IA en preparación…' : 'Ver lectura con IA'}
            </button>
          </div>
          <button className="interview-ghost interview-result-hub__back" onClick={restartInterview} type="button">
            Nueva lectura
          </button>
        </section>
      ) : null}

      {isResult && displayedReport ? (
        <section className="interview-result">
          <div className="interview-result-source" role="tablist" aria-label="Tipo de lectura">
            <button
              className={resultView === 'system' ? 'is-active' : ''}
              onClick={() => setResultView('system')}
              role="tab"
              aria-selected={resultView === 'system'}
              type="button"
            >
              Lectura del sistema
            </button>
            <button
              className={resultView === 'ai' ? 'is-active' : ''}
              disabled={!canShowAiView}
              onClick={() => setResultView('ai')}
              role="tab"
              aria-selected={resultView === 'ai'}
              type="button"
            >
              {aiLoading ? 'IA preparando…' : 'Lectura con IA'}
            </button>
          </div>
          {resultView === 'system' ? (
            <p className="interview-ai-status is-muted">Lectura automática según las respuestas del cuestionario.</p>
          ) : null}
          {resultView === 'ai' && displayedReport.aiEnhanced ? (
            <p className="interview-ai-status is-success">Lectura elaborada con apoyo de inteligencia artificial.</p>
          ) : null}
          {resultView === 'ai' && !displayedReport.aiEnhanced && aiError ? (
            <p className="interview-ai-status is-muted">{aiError}</p>
          ) : null}
          <InterviewReportContent
            profile={profile}
            report={displayedReport}
            whatsappText={whatsappText}
            onRestart={restartInterview}
          />
          {!interviewAnswersComplete(answers) ? null : (
            <p className="interview-saved">
              {savedId && savedId !== 'local'
                ? 'La lectura quedó guardada para el equipo de Comergio.'
                : 'La lectura está lista en esta pantalla.'}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

export default SchoolInterviewPage;
