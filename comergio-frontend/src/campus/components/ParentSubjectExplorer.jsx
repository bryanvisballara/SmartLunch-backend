import { useEffect, useMemo, useState } from 'react';
import { resolveApiAssetUrl } from '../../lib/api';
import {
  buildSubjectCatalog,
  collectSubjectItemKeys,
  countUnseenSubjectItems,
  getSubjectCover,
  isPublicSubjectLabel,
  isPublishedClassItem,
  itemMatchesSubject,
  reviewsBySubjectKey,
} from '../lib/subjectExplorer';
import { markStudentSubjectSeen } from '../../services/studentPortal.service';
import StudentAssignmentsPanel from './StudentAssignmentsPanel';
import './ParentSubjectExplorer.css';

const SUBJECTS_PER_ROW = 5;

function chunkSubjects(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function SubjectCoverArt({ name }) {
  const cover = getSubjectCover(name);
  return (
    <div className={`parent-subject-explorer__cover is-${cover.tone}`} aria-hidden="true">
      <span />
      <span />
      <strong>{String(name || 'A').slice(0, 1).toUpperCase()}</strong>
    </div>
  );
}

function SubjectContent({ course }) {
  if (!course) {
    return <p className="parent-subject-explorer__empty">Aún no hay contenido académico publicado en esta asignatura.</p>;
  }

  const periods = Array.isArray(course.periods) ? course.periods : [];
  if (!periods.some((period) => (period.topics || []).length)) {
    return <p className="parent-subject-explorer__empty">Aún no hay temas ni material de apoyo en esta asignatura.</p>;
  }

  return (
    <div className="campus-parent-mobile__content-period-stack">
      {periods.map((period, periodIndex) => (
        <div className="campus-parent-mobile__content-period" key={period.periodKey || `period-${periodIndex}`}>
          <h4>{period.periodName || `Periodo ${periodIndex + 1}`}</h4>
          <div className="campus-parent-mobile__card-stack">
            {(period.topics || []).map((topic, topicIndex) => (
              <article
                className={`campus-parent-mobile__content-topic${topic.completed ? ' is-completed' : ''}`}
                key={topic.key || `${course.courseId}-topic-${topicIndex}`}
              >
                <div className="campus-parent-mobile__content-topic-top">
                  <strong>{topic.title}</strong>
                  {topic.completed ? <span className="campus-parent-mobile__content-topic-badge">Impartido</span> : null}
                </div>
                {topic.description ? <p>{topic.description}</p> : null}
                {(topic.materials || []).length > 0 ? (
                  <ul className="campus-parent-mobile__content-materials">
                    {(topic.materials || []).map((material, materialIndex) => {
                      const href = resolveApiAssetUrl(material.url);
                      const label = String(material.title || material.fileName || material.url || 'Material').trim() || 'Material';
                      return (
                        <li key={`${href}-${materialIndex}`}>
                          <a href={href} rel="noreferrer" target="_blank">{label}</a>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="campus-parent-mobile__empty-copy">Sin material de apoyo todavía.</p>
                )}
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatUnseenCount(count) {
  if (count > 99) {
    return '99+';
  }
  return String(count);
}

export default function ParentSubjectExplorer({
  calendarItems = [],
  contentCourses = [],
  gradebook = [],
  scheduleEvents = [],
  studentId = '',
  studentName = '',
  studentPortalMode = false,
  subjectReviews = [],
  upcomingAssignments = [],
}) {
  const [selectedKey, setSelectedKey] = useState('');
  const [activeTab, setActiveTab] = useState('content');
  const [seenKeysBySubject, setSeenKeysBySubject] = useState(() => reviewsBySubjectKey(subjectReviews));

  const subjects = useMemo(
    () => buildSubjectCatalog({
      contentCourses,
      gradebook,
      assignments: upcomingAssignments,
      calendarItems,
      scheduleEvents,
    }),
    [calendarItems, contentCourses, gradebook, scheduleEvents, upcomingAssignments],
  );

  useEffect(() => {
    setSelectedKey('');
    setActiveTab('content');
  }, [studentId]);

  const reviewsSignature = useMemo(
    () => JSON.stringify(
      (Array.isArray(subjectReviews) ? subjectReviews : []).map((review) => [
        review?.subjectKey,
        (review?.seenItemKeys || []).join(','),
      ]),
    ),
    [subjectReviews],
  );

  useEffect(() => {
    setSeenKeysBySubject(reviewsBySubjectKey(subjectReviews));
  }, [reviewsSignature, studentId, subjectReviews]);

  const itemCatalog = useMemo(() => ({
    contentCourses,
    assignments: upcomingAssignments,
    calendarItems,
  }), [calendarItems, contentCourses, upcomingAssignments]);

  const unseenCountByKey = useMemo(() => {
    const counts = new Map();
    subjects.forEach((subject) => {
      const itemKeys = collectSubjectItemKeys(subject, itemCatalog);
      counts.set(subject.key, countUnseenSubjectItems(itemKeys, seenKeysBySubject.get(subject.key) || []));
    });
    return counts;
  }, [itemCatalog, seenKeysBySubject, subjects]);

  const openSubject = (subject) => {
    const itemKeys = collectSubjectItemKeys(subject, itemCatalog);
    setSelectedKey(subject.key);
    setActiveTab('content');

    if (!studentPortalMode) {
      return;
    }

    setSeenKeysBySubject((current) => {
      const next = new Map(current);
      next.set(subject.key, itemKeys);
      return next;
    });

    markStudentSubjectSeen({
      subjectKey: subject.key,
      itemKeys,
    }).catch(() => {
      setSeenKeysBySubject(reviewsBySubjectKey(subjectReviews));
    });
  };

  const selectedSubject = subjects.find((item) => item.key === selectedKey) || null;
  const selectedCourse = selectedSubject
    ? (contentCourses || []).find((course) => itemMatchesSubject(course, selectedSubject))
    : null;
  const selectedClasses = (calendarItems || []).filter((item) => (
    selectedSubject && itemMatchesSubject(item, selectedSubject) && isPublishedClassItem(item)
  ));
  const selectedSchedule = (scheduleEvents || []).filter((item) => (
    selectedSubject && itemMatchesSubject(item, selectedSubject)
  ));

  if (selectedSubject) {
    return (
      <section className="parent-subject-explorer is-detail">
        <button className="parent-subject-explorer__back" onClick={() => setSelectedKey('')} type="button">
          ← Asignaturas
        </button>
        <article className="parent-subject-explorer__hero">
          <SubjectCoverArt name={selectedSubject.name} />
          <div className="parent-subject-explorer__hero-copy">
            <strong>{selectedSubject.name}</strong>
            {selectedSubject.teacher ? <span>{selectedSubject.teacher}</span> : null}
          </div>
        </article>
        <nav className="parent-subject-explorer__tabs" aria-label="Secciones de la asignatura">
          {[
            { key: 'content', label: 'Contenido' },
            { key: 'assignments', label: 'Asignaciones' },
            { key: 'classes', label: 'Clases' },
          ].map((tab) => (
            <button
              className={activeTab === tab.key ? 'is-active' : ''}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {activeTab === 'content' ? <SubjectContent course={selectedCourse} /> : null}
        {activeTab === 'assignments' ? (
          <StudentAssignmentsPanel
            embedded
            readOnly={!studentPortalMode}
            studentId={studentPortalMode ? '' : studentId}
            studentName={studentName}
            subjectFilter={selectedSubject}
          />
        ) : null}
        {activeTab === 'classes' ? (
          <div className="parent-subject-explorer__classes">
            {selectedSchedule.length ? (
              <section>
                <h4>Horario de la semana</h4>
                <div className="parent-subject-explorer__class-list">
                  {selectedSchedule.map((item, index) => (
                    <article key={`${item.day}-${item.timeLabel}-${index}`}>
                      <strong>{item.day}</strong>
                      <span>{item.timeLabel || 'Horario publicado'}</span>
                      {isPublicSubjectLabel(item.detail) ? <p>{item.detail}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {selectedClasses.length ? (
              <section>
                <h4>Clases publicadas</h4>
                <div className="parent-subject-explorer__class-list">
                  {selectedClasses.map((item) => (
                    <article key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{[item.dateLabel || item.type, item.type].filter(Boolean).join(' · ')}</span>
                      {isPublicSubjectLabel(item.detail) ? <p>{item.detail}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {!selectedSchedule.length && !selectedClasses.length ? (
              <p className="parent-subject-explorer__empty">Aún no hay clases publicadas en esta asignatura.</p>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="parent-subject-explorer">
      <header className="parent-subject-explorer__head">
        <h3>Contenido académico</h3>
        <p>Elige una asignatura para ver contenido, asignaciones y clases publicadas.</p>
        <span className="parent-subject-explorer__chip">Todas</span>
      </header>
      {subjects.length === 0 ? (
        <p className="parent-subject-explorer__empty">Aún no hay asignaturas publicadas para este alumno.</p>
      ) : (
        <div className="parent-subject-explorer__rows">
          {chunkSubjects(subjects, SUBJECTS_PER_ROW).map((row, rowIndex) => (
            <div
              aria-label={`Asignaturas ${rowIndex + 1}`}
              className="parent-subject-explorer__slider"
              key={`subject-row-${rowIndex}`}
            >
              <div className="parent-subject-explorer__grid">
                {row.map((subject) => (
                  <button
                    className="parent-subject-explorer__card"
                    key={subject.key}
                    onClick={() => openSubject(subject)}
                    type="button"
                  >
                    <SubjectCoverArt name={subject.name} />
                    <span className="parent-subject-explorer__copy">
                      <span className="parent-subject-explorer__title-row">
                        <span className="parent-subject-explorer__title-cluster">
                          <strong>{subject.name}</strong>
                          {unseenCountByKey.get(subject.key) > 0 ? (
                            <span className="parent-subject-explorer__badge" aria-label={`${unseenCountByKey.get(subject.key)} novedades`}>
                              {formatUnseenCount(unseenCountByKey.get(subject.key))}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {subject.teacher ? <small>{subject.teacher}</small> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
