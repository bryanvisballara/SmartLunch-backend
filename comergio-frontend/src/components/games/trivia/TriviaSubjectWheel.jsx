import { useRef, useState } from 'react';
import categoriesArt from '../../../assets/trivia/categories-icons.png';

const SWIPE_DISTANCE = 28;
const SWIPE_FLICK_DISTANCE = 16;
const SWIPE_FLICK_MS = 420;

const GLOBAL_SUBJECTS = [
  { id: 'history', name: 'Historia', icon: '🏛️', color: '#f2bd19' },
  { id: 'science', name: 'Ciencia', icon: '⚗️', color: '#02a57f' },
  { id: 'culture', name: 'Cultura', icon: '🎭', color: '#7135c9' },
  { id: 'arts', name: 'Arte', icon: '🎨', color: '#e72991' },
  { id: 'sports', name: 'Deportes', icon: '⚽', color: '#f07d20' },
];
const GLOBAL_STYLES = {
  historia: { icon: '🏛️', color: '#f2bd19' },
  ciencia: { icon: '⚗️', color: '#02a57f' },
  cultura: { icon: '🎭', color: '#7135c9' },
  arte: { icon: '🎨', color: '#e72991' },
  deportes: { icon: '⚽', color: '#f07d20' },
};

const ICONS = ['📘', '🧠', '🔬', '✏️', '🌱', '🔢', '🌐', '💡', '🧪', '📚', '🎵', '🗺️'];

function stringHash(value) {
  return String(value).split('').reduce((hash, character) => {
    return ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }, 0);
}

function subjectColor(subject, index) {
  if (subject.color) {
    return subject.color;
  }
  const hue = Math.abs(stringHash(subject.id || subject.name)) % 360;
  const adjustedHue = (hue + index * 31) % 360;
  return `hsl(${adjustedHue} 72% 43%)`;
}

function subjectKey(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function normalizeSubjects(mode, subjects) {
  const source = mode === 'global' && !subjects?.length ? GLOBAL_SUBJECTS : subjects || [];
  return source.map((subject, index) => {
    const normalized = typeof subject === 'string' ? { id: subject, name: subject } : subject;
    const globalStyle = mode === 'global'
      ? GLOBAL_STYLES[subjectKey(normalized.name || normalized.id)]
      : null;
    return {
      ...normalized,
      color: globalStyle?.color || subjectColor(normalized, index),
      icon: globalStyle?.icon || normalized.icon || ICONS[index % ICONS.length],
    };
  });
}

function findSubject(items, selectedId) {
  const needle = subjectKey(selectedId);
  if (!needle) {
    return null;
  }
  return items.find((item) => [item.id, item.name, item.subjectKey, item.category].some((value) => subjectKey(value) === needle)) || null;
}

function pointerAngle(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  return Math.atan2(
    clientY - (rect.top + rect.height / 2),
    clientX - (rect.left + rect.width / 2)
  ) * (180 / Math.PI);
}

export default function TriviaSubjectWheel({
  disabled = false,
  mode = 'global',
  onBack,
  onContinue,
  onSpin,
  revealComplete = false,
  selectedSubjectId = '',
  spinning = false,
  subjects = [],
}) {
  const wheelRef = useRef(null);
  const gestureRef = useRef(null);
  const swipeTriggeredRef = useRef(false);
  const [dragAngle, setDragAngle] = useState(0);
  const items = normalizeSubjects(mode, subjects);
  const segmentSize = items.length ? 360 / items.length : 360;
  const gradient = items.length
    ? `conic-gradient(${items.map((subject, index) => (
      `${subject.color} ${index * segmentSize}deg ${(index + 1) * segmentSize}deg`
    )).join(', ')})`
    : '#dbe6f2';
  const selected = findSubject(items, selectedSubjectId);
  const selectedIndex = selected
    ? items.findIndex((subject) => subject.id === selected.id)
    : -1;
  const selectedCenter = selectedIndex >= 0 ? selectedIndex * segmentSize + segmentSize / 2 : 0;
  const stopRotation = 1800 + ((360 - selectedCenter) % 360);
  const wheelMotion = spinning || (selected && !revealComplete);
  const canSwipe = !disabled && !spinning && !revealComplete;

  const endGesture = (event) => {
    const gesture = gestureRef.current;
    if (!gesture?.active) {
      return;
    }
    gesture.active = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    const elapsed = Date.now() - gesture.startAt;
    const swiped = distance >= SWIPE_DISTANCE || (distance >= SWIPE_FLICK_DISTANCE && elapsed <= SWIPE_FLICK_MS);
    setDragAngle(0);
    if (swiped && canSwipe) {
      swipeTriggeredRef.current = true;
      onSpin?.();
    }
  };

  return (
    <section className="trivia-screen trivia-wheel-screen">
      {onBack ? (
        <button className="trivia-wheel__back" disabled={spinning} onClick={onBack} type="button">
          <span aria-hidden="true">←</span> Volver a juegos
        </button>
      ) : null}
      <header className="trivia-wheel-head">
        <div>
          <span className="trivia-kicker">{mode === 'institutional' ? 'Tus materias' : 'Trivia global'}</span>
          <h1>Gira la ruleta</h1>
          <p>La ruleta elegirá al azar la categoría de esta estación.</p>
        </div>
        {mode === 'global' ? (
          <div className="trivia-wheel-head__collection">
            <strong>Colecciona todas<br />las estaciones</strong>
            <img alt="" aria-hidden="true" src={categoriesArt} />
          </div>
        ) : <span className="trivia-wheel-head__icon" aria-hidden="true">📚</span>}
      </header>

      {items.length ? (
        <>
          <div
            className={`trivia-wheel${items.length > 8 ? ' is-crowded' : ''}${wheelMotion ? ' is-spinning' : ''}${revealComplete ? ' is-landed' : ''}${dragAngle ? ' is-dragging' : ''}`}
            onPointerCancel={endGesture}
            onPointerDown={(event) => {
              if (!canSwipe || event.button) {
                return;
              }
              const wheel = wheelRef.current;
              if (!wheel) {
                return;
              }
              gestureRef.current = {
                active: true,
                startX: event.clientX,
                startY: event.clientY,
                startAt: Date.now(),
                lastAngle: pointerAngle(wheel, event.clientX, event.clientY),
              };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const gesture = gestureRef.current;
              const wheel = wheelRef.current;
              if (!gesture?.active || !wheel) {
                return;
              }
              const nextAngle = pointerAngle(wheel, event.clientX, event.clientY);
              let delta = nextAngle - gesture.lastAngle;
              if (delta > 180) {
                delta -= 360;
              } else if (delta < -180) {
                delta += 360;
              }
              gesture.lastAngle = nextAngle;
              setDragAngle((current) => current + delta);
            }}
            onPointerUp={endGesture}
            ref={wheelRef}
            style={{
              '--wheel-gradient': gradient,
              '--wheel-stop': `${stopRotation}deg`,
              '--wheel-drag': `${dragAngle}deg`,
            }}
          >
            <div className="trivia-wheel__pointer" aria-hidden="true" />
            <div className="trivia-wheel__rotor">
              <div className="trivia-wheel__disc" aria-hidden="true" />
              {items.map((subject, index) => {
                const angle = index * segmentSize + segmentSize / 2 - 90;
                const radians = angle * (Math.PI / 180);
                const radius = items.length > 8 ? 38 : 35;
                const x = 50 + Math.cos(radians) * radius;
                const y = 50 + Math.sin(radians) * radius;
                return (
                  <div
                    className={`trivia-wheel__label${selected?.id === subject.id ? ' is-selected' : ''}`}
                    key={subject.id}
                    style={{ '--label-x': `${x}%`, '--label-y': `${y}%` }}
                  >
                    <span aria-hidden="true">{subject.icon}</span>
                    <strong>{subject.name}</strong>
                  </div>
                );
              })}
            </div>
            <button
              aria-label="Girar la ruleta"
              className="trivia-wheel__hub"
              disabled={disabled || spinning}
              onClick={() => {
                if (swipeTriggeredRef.current) {
                  swipeTriggeredRef.current = false;
                  return;
                }
                onSpin?.();
              }}
              type="button"
            >
              <strong>{spinning ? '…' : 'GIRAR'}</strong>
              <span aria-hidden="true">⟳</span>
            </button>
          </div>

          <div
            className={`trivia-wheel__selection${selected && revealComplete ? ' is-chosen' : ''}`}
            style={selected && revealComplete ? { '--subject-color': selected.color } : undefined}
            aria-live="polite"
          >
            {selected && revealComplete ? (
              <>
                <span>{selected.icon}</span>
                <div>
                  <small>Categoría elegida</small>
                  <strong>{selected.name}</strong>
                </div>
              </>
            ) : (
              <>
                <span className="trivia-wheel__tip-icon" aria-hidden="true">🎮</span>
                <p>{spinning ? 'La ruleta está eligiendo…' : <>Presiona <strong>GIRAR</strong> o desliza la ruleta.</>}</p>
              </>
            )}
          </div>
          {selected && revealComplete ? (
            <button className="trivia-wheel__continue" onClick={onContinue} type="button">
              Continuar <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </>
      ) : (
        <p className="trivia-alert">Tu colegio aún no tiene materias disponibles para Trivia.</p>
      )}
    </section>
  );
}
