export function isPublicSubjectLabel(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  if (/other[_-\s]?\d+/i.test(text)) {
    return false;
  }
  if (/^other([_\s-].*)?$/i.test(text)) {
    return false;
  }
  if (/^[a-z]+_\d+$/i.test(text)) {
    return false;
  }
  return true;
}

export function normalizeSubjectKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function subjectsMatch(left, right) {
  const first = normalizeSubjectKey(left);
  const second = normalizeSubjectKey(right);
  if (!first || !second) {
    return false;
  }
  return first === second || first.includes(second) || second.includes(first);
}

export function isAssignedTeacherName(value, subjectName = '') {
  const text = String(value || '').trim();
  if (!isPublicSubjectLabel(text)) {
    return false;
  }

  const key = normalizeSubjectKey(text);
  if (!key || /^(docente|docenteasignado|mentors?|profesor|profe)$/.test(key)) {
    return false;
  }

  const subject = String(subjectName || '').trim();
  if (subject && subjectsMatch(text, subject)) {
    return false;
  }

  const beforeSeparator = String(text.split(/[·•|]/)[0] || '').trim();
  if (subject && beforeSeparator && subjectsMatch(beforeSeparator, subject)) {
    return false;
  }

  return true;
}

const SUBJECT_COVERS = [
  { test: /math|mate|algebra|calculo|quest/, tone: 'math', label: 'Matemáticas' },
  { test: /deporte|edfisica|educacionfisica|sport/, tone: 'sport', label: 'Deporte' },
  { test: /science|ciencia|fisica|quimica|biologia|stem/, tone: 'science', label: 'Ciencias' },
  { test: /society|social|historia|civica|geo/, tone: 'society', label: 'Sociales' },
  { test: /english|ingles|language|idioma|spanish|espanol|lengua|literatura/, tone: 'language', label: 'Lenguaje' },
  { test: /art|arte|musica|music|teatro|danza/, tone: 'arts', label: 'Artes' },
  { test: /tech|tecnolog|comput|informatica|robot|coding|program/, tone: 'tech', label: 'Tecnología' },
  { test: /religion|etica|valores|sel|path|guidance/, tone: 'values', label: 'Valores' },
];

export function getSubjectCover(subjectName = '') {
  const key = normalizeSubjectKey(subjectName);
  return SUBJECT_COVERS.find((item) => item.test.test(key)) || { tone: 'default', label: 'Asignatura' };
}

export function buildSubjectCatalog({
  contentCourses = [],
  gradebook = [],
  assignments = [],
  calendarItems = [],
  scheduleEvents = [],
} = {}) {
  const catalog = new Map();

  const upsert = ({ id, subject, teacher, courseId }) => {
    const name = String(subject || '').trim();
    if (!isPublicSubjectLabel(name)) {
      return;
    }
    const key = normalizeSubjectKey(name);
    if (!key) {
      return;
    }
    const current = catalog.get(key) || {
      id: String(id || courseId || key),
      key,
      name,
      teacher: '',
      title: '',
      courseIds: [],
    };
    if (courseId && !current.courseIds.includes(String(courseId))) {
      current.courseIds.push(String(courseId));
    }
    if (!current.teacher && isAssignedTeacherName(teacher, current.name)) {
      current.teacher = String(teacher).trim();
      current.title = current.teacher;
    }
    catalog.set(key, current);
  };

  (Array.isArray(contentCourses) ? contentCourses : []).forEach((course) => {
    upsert({
      id: course.courseId,
      subject: course.subject || course.title,
      teacher: course.teacher,
      courseId: course.courseId,
    });
  });

  (Array.isArray(gradebook) ? gradebook : []).forEach((subject) => {
    upsert({
      id: subject.id,
      subject: subject.name || subject.subject,
      teacher: subject.teacher,
    });
  });

  (Array.isArray(assignments) ? assignments : []).forEach((item) => {
    upsert({
      id: item.courseId,
      subject: item.subject || item.subtitle || item.courseTitle,
      teacher: item.teacher || item.authorName,
      courseId: item.courseId,
    });
  });

  (Array.isArray(calendarItems) ? calendarItems : []).forEach((item) => {
    upsert({
      id: item.courseId,
      subject: item.subject || item.courseTitle,
      teacher: item.teacher || item.authorName,
      courseId: item.courseId,
    });
  });

  (Array.isArray(scheduleEvents) ? scheduleEvents : []).forEach((item) => {
    upsert({
      subject: item.subject,
      teacher: item.detail,
    });
  });

  return Array.from(catalog.values()).sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }));
}

export function itemMatchesSubject(item, subject) {
  if (!subject) {
    return false;
  }
  const names = [item?.subject, item?.subtitle, item?.courseTitle, item?.name, item?.title];
  if (names.some((value) => subjectsMatch(value, subject.name))) {
    return true;
  }
  const courseId = String(item?.courseId || '').trim();
  return Boolean(courseId && subject.courseIds.includes(courseId));
}

export function isPublishedClassItem(item = {}) {
  const type = normalizeSubjectKey(item.type || item.deliveryMode || '');
  return /clase|class|material|aviso|announcement/.test(type) || String(item.deliveryMode || '').toLowerCase() === 'class';
}

export function collectSubjectItemKeys(subject, {
  contentCourses = [],
  assignments = [],
  calendarItems = [],
} = {}) {
  if (!subject) {
    return [];
  }

  const keys = [];

  (Array.isArray(contentCourses) ? contentCourses : []).forEach((course) => {
    if (!itemMatchesSubject(course, subject)) {
      return;
    }
    (Array.isArray(course.periods) ? course.periods : []).forEach((period) => {
      (Array.isArray(period.topics) ? period.topics : []).forEach((topic) => {
        const topicKey = String(topic.key || normalizeSubjectKey(topic.title) || '').trim();
        if (topicKey) {
          keys.push(`topic:${course.courseId || subject.key}:${topicKey}`);
        }
      });
    });
  });

  (Array.isArray(assignments) ? assignments : []).forEach((item) => {
    if (!itemMatchesSubject(item, subject)) {
      return;
    }
    const itemId = String(item.id || item._id || '').trim();
    if (itemId) {
      keys.push(`assignment:${itemId}`);
    }
  });

  (Array.isArray(calendarItems) ? calendarItems : []).forEach((item) => {
    if (!itemMatchesSubject(item, subject) || !isPublishedClassItem(item)) {
      return;
    }
    const itemId = String(item.id || item._id || '').trim();
    if (itemId) {
      keys.push(`class:${itemId}`);
    }
  });

  return Array.from(new Set(keys));
}

export function countUnseenSubjectItems(itemKeys = [], seenItemKeys = []) {
  const seen = new Set((Array.isArray(seenItemKeys) ? seenItemKeys : []).map((key) => String(key || '').trim()).filter(Boolean));
  return (Array.isArray(itemKeys) ? itemKeys : []).filter((key) => !seen.has(String(key || '').trim())).length;
}

export function reviewsBySubjectKey(reviews = []) {
  return new Map(
    (Array.isArray(reviews) ? reviews : [])
      .map((review) => [normalizeSubjectKey(review?.subjectKey), Array.isArray(review?.seenItemKeys) ? review.seenItemKeys : []])
      .filter(([key]) => key),
  );
}
