const User = require('../models/user.model');
const CampusCourse = require('../models/campusCourse.model');
const ConectaCase = require('../models/conectaCase.model');
const ConectaCursor = require('../models/conectaCursor.model');
const {
  listTenantSchoolContexts,
  runWithSchoolContext,
  runInControlDb,
  getControlDbSchoolIds,
  normalizeSchoolId,
} = require('../config/db');
const { getSchoolDisplayName } = require('../utils/schoolDisplayName');
const { queueNotificationsForParents } = require('./notification.service');
const { ensureConectaSeedCases } = require('./conectaSeed');

const CONECTA_STAFF_ROLES = [
  'teacher',
  'psychology',
  'nursing',
  'academic_secretary',
  'admissions',
  'coordination',
  'billing',
  'rectoria',
  'direccion',
  'admin',
  'human_resources',
];

function normalizeText(value) {
  return String(value || '').trim();
}

function actorKey(schoolId, userId) {
  return `${normalizeSchoolId(schoolId)}::${String(userId || '')}`;
}

let staffSchoolContextsCache = {
  expiresAt: 0,
  value: null,
};

async function listAllStaffSchoolContextsCached() {
  if (staffSchoolContextsCache.value && Date.now() < staffSchoolContextsCache.expiresAt) {
    return staffSchoolContextsCache.value;
  }
  const value = await listAllStaffSchoolContexts();
  staffSchoolContextsCache = {
    expiresAt: Date.now() + (5 * 60 * 1000),
    value,
  };
  return value;
}

function isSameActor(entry, schoolId, userId) {
  return String(entry?.schoolId || '') === normalizeSchoolId(schoolId)
    && String(entry?.userId || '') === String(userId || '');
}

function uniqueStrings(values = []) {
  const seen = new Set();
  return values
    .map((value) => normalizeText(value))
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function listAllStaffSchoolContexts() {
  const tenantContexts = await listTenantSchoolContexts();
  const contexts = [...tenantContexts];
  const seen = new Set(contexts.map((item) => normalizeSchoolId(item.schoolId).toLowerCase()));

  for (const controlSchoolId of getControlDbSchoolIds()) {
    const normalized = normalizeSchoolId(controlSchoolId);
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    contexts.push({ schoolId: normalized, dbName: 'control' });
  }

  return contexts;
}

async function resolveAuthorSubjects({ schoolId, userId }) {
  return runWithSchoolContext(schoolId, async () => {
    const user = await User.findById(userId).select('assignedSubjects role name').lean();
    const courses = await CampusCourse.find({
      schoolId,
      teacherUserId: userId,
      status: 'active',
    })
      .select('subject title')
      .lean();

    const subjects = uniqueStrings([
      ...(user?.assignedSubjects || []),
      ...courses.map((course) => course.subject || course.title),
    ]);

    return {
      subjects: [
        { key: 'general', label: 'General' },
        ...subjects.map((label) => ({
          key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'subject',
          label,
        })),
      ],
      role: normalizeText(user?.role),
      name: normalizeText(user?.name),
    };
  });
}

function serializeLike(like) {
  return {
    schoolId: normalizeText(like.schoolId),
    userId: String(like.userId || ''),
    name: normalizeText(like.name),
    createdAt: like.createdAt || null,
  };
}

function serializeComment(comment, viewerSchoolId, viewerUserId) {
  const likes = Array.isArray(comment.likes) ? comment.likes : [];
  return {
    id: String(comment._id),
    schoolId: normalizeText(comment.schoolId),
    userId: String(comment.userId || ''),
    name: normalizeText(comment.name),
    schoolName: normalizeText(comment.schoolName),
    role: normalizeText(comment.role),
    body: normalizeText(comment.body),
    likeCount: likes.length,
    likedByMe: likes.some((like) => isSameActor(like, viewerSchoolId, viewerUserId)),
    createdAt: comment.createdAt || null,
  };
}

function serializeCase(doc, viewerSchoolId, viewerUserId) {
  if (!doc) return null;
  const likes = Array.isArray(doc.likes) ? doc.likes : [];
  const comments = Array.isArray(doc.comments) ? doc.comments : [];
  return {
    id: String(doc._id),
    author: {
      schoolId: normalizeText(doc.author?.schoolId),
      userId: String(doc.author?.userId || ''),
      name: normalizeText(doc.author?.name),
      role: normalizeText(doc.author?.role),
      schoolName: normalizeText(doc.author?.schoolName),
      photoUrl: normalizeText(doc.author?.photoUrl),
    },
    subjectKey: normalizeText(doc.subjectKey) || 'general',
    subjectLabel: normalizeText(doc.subjectLabel) || 'General',
    title: normalizeText(doc.title),
    body: normalizeText(doc.body),
    media: (doc.media || []).map((item) => ({
      kind: item.kind || 'image',
      src: normalizeText(item.src),
      thumbUrl: normalizeText(item.thumbUrl) || normalizeText(item.src),
      alt: normalizeText(item.alt),
    })),
    likeCount: likes.length,
    likedByMe: likes.some((like) => isSameActor(like, viewerSchoolId, viewerUserId)),
    commentCount: comments.length,
    comments: comments
      .slice()
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .map((comment) => serializeComment(comment, viewerSchoolId, viewerUserId)),
    publishedAt: doc.publishedAt || doc.createdAt || null,
    createdAt: doc.createdAt || null,
  };
}

async function notifyAllStaffAboutCase({ caseDoc, excludeSchoolId, excludeUserId }) {
  const title = 'Nuevo caso en Conecta';
  const authorName = normalizeText(caseDoc.author?.name) || 'Un colega';
  const schoolName = normalizeText(caseDoc.author?.schoolName) || 'otro colegio';
  const body = `${authorName} (${schoolName}) publicó: ${normalizeText(caseDoc.title)}`;
  const payload = {
    type: 'conecta.case',
    caseId: String(caseDoc._id),
    url: '/campus/teacher',
  };

  const schoolContexts = await listAllStaffSchoolContexts();
  const results = [];

  for (const context of schoolContexts) {
    try {
      const staffIds = await runWithSchoolContext(context.schoolId, async () => {
        const users = await User.find({
          schoolId: context.schoolId,
          role: { $in: CONECTA_STAFF_ROLES },
          status: 'active',
          deletedAt: null,
        })
          .select('_id')
          .lean();

        return users
          .map((user) => String(user._id))
          .filter((userId) => !(
            normalizeSchoolId(context.schoolId) === normalizeSchoolId(excludeSchoolId)
            && userId === String(excludeUserId || '')
          ));
      });

      if (!staffIds.length) {
        continue;
      }

      const result = await queueNotificationsForParents({
        schoolId: context.schoolId,
        parentIds: staffIds,
        title,
        body,
        payload,
      });
      results.push({ schoolId: context.schoolId, ...result });
    } catch (error) {
      console.warn(`[CONECTA_NOTIFY] school=${context.schoolId} failed: ${error.message || error}`);
    }
  }

  return results;
}

async function createCase({
  schoolId,
  userId,
  name,
  role,
  photoUrl = '',
  title,
  body,
  subjectKey = 'general',
  subjectLabel = 'General',
  media = [],
}) {
  const normalizedTitle = normalizeText(title);
  const normalizedBody = normalizeText(body);
  if (!normalizedTitle || !normalizedBody) {
    throw new Error('Título y descripción del caso son requeridos.');
  }

  const schoolName = await runWithSchoolContext(schoolId, () => getSchoolDisplayName(schoolId));
  const publishedAt = new Date();

  const caseDoc = await runInControlDb(() => ConectaCase.create({
    conectaEntity: 'case',
    // Unique placeholder for legacy unique email index on reused collection.
    email: `conecta-case-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@comergio.internal`,
    author: {
      schoolId: normalizeSchoolId(schoolId),
      userId: String(userId),
      name: normalizeText(name) || 'Colega Comergio',
      role: normalizeText(role),
      schoolName: normalizeText(schoolName) || normalizeSchoolId(schoolId),
      photoUrl: normalizeText(photoUrl),
    },
    subjectKey: normalizeText(subjectKey) || 'general',
    subjectLabel: normalizeText(subjectLabel) || 'General',
    title: normalizedTitle,
    body: normalizedBody,
    media: (Array.isArray(media) ? media : [])
      .map((item) => ({
        kind: 'image',
        src: normalizeText(item.src || item.url),
        thumbUrl: normalizeText(item.thumbUrl) || normalizeText(item.src || item.url),
        alt: normalizeText(item.alt) || normalizedTitle,
      }))
      .filter((item) => item.src),
    status: 'published',
    publishedAt,
  }));

  // Mark author as already seen so their own post doesn't badge them.
  await runInControlDb(() => ConectaCursor.findOneAndUpdate(
    { conectaEntity: 'cursor', schoolId: normalizeSchoolId(schoolId), userId: String(userId) },
    { $set: { conectaEntity: 'cursor', lastSeenAt: publishedAt } },
    { upsert: true, new: true },
  ));

  setImmediate(() => {
    notifyAllStaffAboutCase({
      caseDoc,
      excludeSchoolId: schoolId,
      excludeUserId: userId,
    }).catch((error) => {
      console.warn(`[CONECTA_NOTIFY] fan-out failed: ${error.message || error}`);
    });
  });

  return serializeCase(caseDoc, schoolId, userId);
}

async function listCases({ schoolId, userId, limit = 40 }) {
  await ensureConectaSeedCases();
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 80);
  const cases = await runInControlDb(() => ConectaCase.find({ conectaEntity: 'case', status: 'published' })
    .sort({ publishedAt: -1 })
    .limit(safeLimit)
    .lean());

  await runInControlDb(() => ConectaCursor.findOneAndUpdate(
    { conectaEntity: 'cursor', schoolId: normalizeSchoolId(schoolId), userId: String(userId) },
    { $set: { conectaEntity: 'cursor', lastSeenAt: new Date() } },
    { upsert: true, new: true },
  ));

  return cases.map((item) => serializeCase(item, schoolId, userId));
}

async function getCommunityStats() {
  await ensureConectaSeedCases();

  const cases = await runInControlDb(() => ConectaCase.find({ conectaEntity: 'case', status: 'published' })
    .select('title author.schoolId author.schoolName author.userId author.photoUrl author.name subjectLabel likes publishedAt')
    .lean());

  const topicCounts = {};
  const caseSchoolIds = new Set();
  cases.forEach((item) => {
    if (item.author?.schoolId) caseSchoolIds.add(String(item.author.schoolId));
    const topic = String(item.subjectLabel || 'General').trim() || 'General';
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  });

  const trending = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      tag: `#${label.replace(/\s+/g, '')}`,
      count,
    }));

  const featured = cases
    .slice()
    .sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
    .slice(0, 3)
    .map((item) => ({
      id: String(item._id),
      title: item.title || item.subjectLabel || 'Caso destacado',
      schoolName: item.author?.schoolName || 'Colegio Comergio',
      photoUrl: normalizeText(item.author?.photoUrl),
      authorName: normalizeText(item.author?.name),
    }));

  let schoolCount = caseSchoolIds.size;
  let realStaffCount = 0;

  try {
    const schoolContexts = await listAllStaffSchoolContextsCached();
    if (schoolContexts.length) {
      schoolCount = schoolContexts.length;
    }

    const staffCounts = await Promise.all(schoolContexts.map(async (context) => {
      try {
        return await runWithSchoolContext(context.schoolId, () => User.countDocuments({
          schoolId: context.schoolId,
          role: { $in: CONECTA_STAFF_ROLES },
          status: 'active',
          deletedAt: null,
        }));
      } catch (error) {
        console.warn(`[CONECTA_STATS] school=${context.schoolId} failed: ${error.message || error}`);
        return 0;
      }
    }));
    realStaffCount = staffCounts.reduce((sum, count) => sum + (Number(count) || 0), 0);
  } catch (error) {
    console.warn(`[CONECTA_STATS] school contexts failed: ${error.message || error}`);
    schoolCount = Math.max(schoolCount, getControlDbSchoolIds().size);
  }

  return {
    activeTeachers: 100 + realStaffCount,
    schools: schoolCount,
    sharedCases: cases.length,
    trending: trending.length
      ? trending
      : [
        { label: 'Convivencia escolar', tag: '#ConvivenciaEscolar', count: 0 },
        { label: 'Evaluación formativa', tag: '#EvaluaciónFormativa', count: 0 },
        { label: 'Recursos didácticos', tag: '#RecursosDidácticos', count: 0 },
      ],
    featured,
  };
}

async function getUnreadCount({ schoolId, userId }) {
  const cursor = await runInControlDb(() => ConectaCursor.findOne({
    conectaEntity: 'cursor',
    schoolId: normalizeSchoolId(schoolId),
    userId: String(userId),
  }).lean());

  const since = cursor?.lastSeenAt ? new Date(cursor.lastSeenAt) : new Date(0);

  return runInControlDb(() => ConectaCase.countDocuments({
    conectaEntity: 'case',
    status: 'published',
    publishedAt: { $gt: since },
    $nor: [{
      'author.schoolId': normalizeSchoolId(schoolId),
      'author.userId': String(userId),
    }],
  }));
}

async function toggleCaseLike({ schoolId, userId, name, caseId }) {
  return runInControlDb(async () => {
    const caseDoc = await ConectaCase.findOne({ _id: caseId, conectaEntity: 'case' });
    if (!caseDoc || caseDoc.status !== 'published') {
      throw new Error('Caso no encontrado.');
    }

    const likes = Array.isArray(caseDoc.likes) ? caseDoc.likes : [];
    const existingIndex = likes.findIndex((like) => isSameActor(like, schoolId, userId));
    if (existingIndex >= 0) {
      likes.splice(existingIndex, 1);
    } else {
      likes.push({
        schoolId: normalizeSchoolId(schoolId),
        userId: String(userId),
        name: normalizeText(name),
        createdAt: new Date(),
      });
    }
    caseDoc.likes = likes;
    caseDoc.conectaEntity = 'case';
    await caseDoc.save();
    return serializeCase(caseDoc, schoolId, userId);
  });
}

async function addComment({ schoolId, userId, name, role, caseId, body }) {
  const normalizedBody = normalizeText(body);
  if (!normalizedBody) {
    throw new Error('El comentario no puede estar vacío.');
  }

  const schoolName = await runWithSchoolContext(schoolId, () => getSchoolDisplayName(schoolId));

  return runInControlDb(async () => {
    const caseDoc = await ConectaCase.findOne({ _id: caseId, conectaEntity: 'case' });
    if (!caseDoc || caseDoc.status !== 'published') {
      throw new Error('Caso no encontrado.');
    }

    caseDoc.comments.push({
      schoolId: normalizeSchoolId(schoolId),
      userId: String(userId),
      name: normalizeText(name),
      schoolName: normalizeText(schoolName) || normalizeSchoolId(schoolId),
      role: normalizeText(role),
      body: normalizedBody,
      likes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    caseDoc.conectaEntity = 'case';
    await caseDoc.save();
    return serializeCase(caseDoc, schoolId, userId);
  });
}

async function toggleCommentLike({ schoolId, userId, name, caseId, commentId }) {
  return runInControlDb(async () => {
    const caseDoc = await ConectaCase.findOne({ _id: caseId, conectaEntity: 'case' });
    if (!caseDoc || caseDoc.status !== 'published') {
      throw new Error('Caso no encontrado.');
    }

    const comment = caseDoc.comments.id(commentId);
    if (!comment) {
      throw new Error('Comentario no encontrado.');
    }

    const likes = Array.isArray(comment.likes) ? comment.likes : [];
    const existingIndex = likes.findIndex((like) => isSameActor(like, schoolId, userId));
    if (existingIndex >= 0) {
      likes.splice(existingIndex, 1);
    } else {
      likes.push({
        schoolId: normalizeSchoolId(schoolId),
        userId: String(userId),
        name: normalizeText(name),
        createdAt: new Date(),
      });
    }
    comment.likes = likes;
    comment.updatedAt = new Date();
    caseDoc.conectaEntity = 'case';
    await caseDoc.save();
    return serializeCase(caseDoc, schoolId, userId);
  });
}

module.exports = {
  CONECTA_STAFF_ROLES,
  resolveAuthorSubjects,
  createCase,
  listCases,
  getCommunityStats,
  getUnreadCount,
  toggleCaseLike,
  addComment,
  toggleCommentLike,
  actorKey,
};
