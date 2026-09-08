import { useEffect, useMemo, useRef, useState } from 'react';
import { uploadArenaQuestionImage } from '../../campus/services/campus.service';
import { resolveApiAssetUrl } from '../../lib/api';
import {
  ARENA_POINT_OPTIONS,
  ARENA_TIMER_OPTIONS,
  copyArenaPin,
  createArenaAnswer,
  createArenaQuestion,
  duplicateArenaQuestion,
  formatArenaPin,
  getArenaDraftPlayErrors,
} from './arenaDraft';
import './arena.css';

const TYPE_LABELS = {
  quiz: 'Quiz',
  true_false: 'Verdadero o falso',
  puzzle: 'Puzzle',
};

export default function ArenaEditor({
  draft,
  onChange,
  onBack,
  onSave,
  onPlay,
  saving = false,
  playing = false,
  error = '',
  savedMessage = '',
  sharePin = '',
  shareBlocked = '',
  onOpenLobby,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const imageInputRef = useRef(null);
  const questions = Array.isArray(draft.questions) ? draft.questions : [];
  const question = questions[currentIndex] || questions[0];
  const playErrors = useMemo(() => getArenaDraftPlayErrors(draft), [draft]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [draft.id]);

  useEffect(() => {
    setCopied(false);
  }, [sharePin]);

  const updateDraft = (patch) => {
    onChange({ ...draft, ...patch });
  };

  const updateQuestion = (patch) => {
    const nextQuestions = questions.map((item, index) => (
      index === currentIndex ? { ...item, ...patch } : item
    ));
    updateDraft({ questions: nextQuestions });
  };

  const changeType = (type) => {
    if (!question || question.type === type) {
      return;
    }
    updateQuestion({
      ...createArenaQuestion(type),
      key: question.key,
      prompt: question.prompt,
      imageUrl: question.imageUrl,
      timeLimitSec: question.timeLimitSec,
      points: question.points,
    });
  };

  const addQuestion = () => {
    const next = [...questions, createArenaQuestion('quiz')];
    updateDraft({ questions: next });
    setCurrentIndex(next.length - 1);
  };

  const duplicateCurrent = () => {
    if (!question) {
      return;
    }
    const next = [...questions];
    next.splice(currentIndex + 1, 0, duplicateArenaQuestion(question));
    updateDraft({ questions: next });
    setCurrentIndex(currentIndex + 1);
  };

  const deleteCurrent = () => {
    if (questions.length <= 1) {
      updateDraft({ questions: [createArenaQuestion('quiz')] });
      setCurrentIndex(0);
      return;
    }
    const next = questions.filter((_, index) => index !== currentIndex);
    updateDraft({ questions: next });
    setCurrentIndex(Math.max(0, currentIndex - 1));
  };

  const updateAnswer = (answerKey, patch) => {
    const nextAnswers = (question.answers || []).map((answer) => {
      if (answer.key !== answerKey) {
        if (patch.correct && question.selectionMode !== 'multiple' && question.type !== 'puzzle') {
          return { ...answer, correct: false };
        }
        return answer;
      }
      return { ...answer, ...patch };
    });
    updateQuestion({ answers: nextAnswers });
  };

  const addPuzzleItem = () => {
    if ((question.answers || []).length >= 4) {
      return;
    }
    updateQuestion({
      answers: [
        ...(question.answers || []),
        createArenaAnswer({ text: '', correctOrder: question.answers.length }),
      ],
    });
  };

  const removePuzzleItem = (answerKey) => {
    const next = (question.answers || [])
      .filter((answer) => answer.key !== answerKey)
      .map((answer, index) => ({ ...answer, correctOrder: index }));
    if (next.length < 3) {
      return;
    }
    updateQuestion({ answers: next });
  };

  const movePuzzleItem = (answerKey, direction) => {
    const answers = [...(question.answers || [])];
    const index = answers.findIndex((answer) => answer.key === answerKey);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= answers.length) {
      return;
    }
    const current = answers[index];
    answers[index] = answers[nextIndex];
    answers[nextIndex] = current;
    updateQuestion({
      answers: answers.map((answer, order) => ({ ...answer, correctOrder: order })),
    });
  };

  const onPickImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const result = await uploadArenaQuestionImage(file);
      updateQuestion({ imageUrl: result.imageUrl || '' });
    } catch (uploadError) {
      window.alert(uploadError?.response?.data?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  if (!question) {
    return null;
  }

  return (
    <section className="arena-editor">
      <div className="arena-editor__top">
        <button className="arena-btn-ghost" onClick={onBack} type="button">Volver</button>
        <input
          className="arena-editor__title"
          onChange={(event) => updateDraft({ title: event.target.value })}
          placeholder="Título del set"
          value={draft.title || ''}
        />
        <button className="arena-btn" disabled={saving} onClick={onSave} type="button">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button className="arena-btn-secondary" disabled={playing || playErrors.length > 0} onClick={onPlay} type="button">
          {playing ? 'Abriendo...' : 'Jugar'}
        </button>
      </div>

      {error ? <p className="arena-error">{error}</p> : null}
      {savedMessage ? <p className="arena-saved">{savedMessage}</p> : null}
      {shareBlocked ? <p className="arena-saved">{shareBlocked}</p> : null}
      {sharePin ? (
        <div className="arena-share-banner">
          <div>
            <p className="games-hub__kicker">Código para compartir</p>
            <strong className="arena-share-banner__pin">{formatArenaPin(sharePin)}</strong>
            <span>Tus alumnos lo escriben en Juegos. El set queda guardado para usarlo después.</span>
          </div>
          <div className="arena-library__actions">
            <button
              className="arena-btn-ghost"
              onClick={async () => {
                const ok = await copyArenaPin(sharePin);
                setCopied(ok);
              }}
              type="button"
            >
              {copied ? 'Copiado' : 'Copiar código'}
            </button>
            {onOpenLobby ? (
              <button className="arena-btn-secondary" onClick={onOpenLobby} type="button">
                Abrir lobby
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {playErrors.length ? (
        <ul className="arena-editor__errors">
          {playErrors.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}

      <div className="arena-editor__layout">
        <aside className="arena-editor__side">
          <div className="arena-type-row">
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <button
                className={`arena-type-btn${question.type === type ? ' is-active' : ''}`}
                key={type}
                onClick={() => changeType(type)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {question.type === 'quiz' ? (
            <div className="arena-mode-row">
              <button
                className={`arena-mode-btn${question.selectionMode !== 'multiple' ? ' is-active' : ''}`}
                onClick={() => updateQuestion({
                  selectionMode: 'single',
                  answers: (question.answers || []).map((answer, index) => ({
                    ...answer,
                    correct: index === 0,
                  })),
                })}
                type="button"
              >
                Simple
              </button>
              <button
                className={`arena-mode-btn${question.selectionMode === 'multiple' ? ' is-active' : ''}`}
                onClick={() => updateQuestion({ selectionMode: 'multiple' })}
                type="button"
              >
                Múltiple
              </button>
            </div>
          ) : null}

          <label>
            Tiempo
            <select
              onChange={(event) => updateQuestion({ timeLimitSec: Number(event.target.value) })}
              value={question.timeLimitSec || 20}
            >
              {ARENA_TIMER_OPTIONS.map((value) => (
                <option key={value} value={value}>{value} s</option>
              ))}
            </select>
          </label>

          <label>
            Puntos
            <select
              onChange={(event) => updateQuestion({ points: Number(event.target.value) })}
              value={question.points ?? 1000}
            >
              {ARENA_POINT_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <input
            accept="image/*"
            hidden
            onChange={onPickImage}
            ref={imageInputRef}
            type="file"
          />
          <button className="arena-btn-ghost" disabled={uploading} onClick={() => imageInputRef.current?.click()} type="button">
            {uploading ? 'Subiendo...' : (question.imageUrl ? 'Cambiar imagen' : 'Añadir imagen')}
          </button>
          {question.imageUrl ? (
            <div className="arena-image-preview">
              <img alt="" src={resolveApiAssetUrl(question.imageUrl)} />
              <button className="arena-btn-danger" onClick={() => updateQuestion({ imageUrl: '' })} type="button">
                Quitar imagen
              </button>
            </div>
          ) : null}

          <button className="arena-btn-ghost" onClick={duplicateCurrent} type="button">Duplicar pregunta</button>
          <button className="arena-btn-danger" onClick={deleteCurrent} type="button">Eliminar pregunta</button>
        </aside>

        <div className="arena-editor__stage">
          <label>
            Enunciado
            <textarea
              onChange={(event) => updateQuestion({ prompt: event.target.value })}
              placeholder="Escribe la pregunta"
              value={question.prompt || ''}
            />
          </label>

          {question.type === 'puzzle' ? (
            <div className="arena-puzzle-list">
              {(question.answers || []).map((answer, index) => (
                <div className="arena-puzzle-item" key={answer.key}>
                  <span>{index + 1}</span>
                  <input
                    onChange={(event) => updateAnswer(answer.key, { text: event.target.value })}
                    placeholder={`Ítem ${index + 1} en el orden correcto`}
                    value={answer.text || ''}
                  />
                  <div className="arena-library__actions">
                    <button className="arena-btn-ghost" onClick={() => movePuzzleItem(answer.key, -1)} type="button">↑</button>
                    <button className="arena-btn-ghost" onClick={() => movePuzzleItem(answer.key, 1)} type="button">↓</button>
                    <button className="arena-btn-danger" onClick={() => removePuzzleItem(answer.key)} type="button">×</button>
                  </div>
                </div>
              ))}
              {(question.answers || []).length < 4 ? (
                <button className="arena-btn-ghost" onClick={addPuzzleItem} type="button">Añadir ítem</button>
              ) : null}
            </div>
          ) : (
            <div className="arena-editor__answers">
              {(question.answers || []).map((answer, index) => (
                <div
                  className={`arena-answer${answer.correct ? ' is-correct' : ''}`}
                  key={answer.key}
                  style={{ background: ['#e21b3c', '#1368ce', '#d89e00', '#26890c'][index % 4] }}
                >
                  <input
                    onChange={(event) => updateAnswer(answer.key, { text: event.target.value })}
                    placeholder={question.type === 'true_false' ? answer.text : `Respuesta ${index + 1}`}
                    readOnly={question.type === 'true_false'}
                    value={answer.text || ''}
                  />
                  <button
                    onClick={() => updateAnswer(answer.key, { correct: !answer.correct })}
                    type="button"
                  >
                    {answer.correct ? '✓' : ''}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="arena-editor__carousel">
        {questions.map((item, index) => (
          <button
            className={`arena-slide${index === currentIndex ? ' is-active' : ''}`}
            key={item.key || index}
            onClick={() => setCurrentIndex(index)}
            type="button"
          >
            {index + 1}
          </button>
        ))}
        <button className="arena-slide is-add" onClick={addQuestion} type="button">+</button>
      </div>
    </section>
  );
}
