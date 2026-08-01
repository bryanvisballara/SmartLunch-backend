const User = require('../models/user.model');
const InformaPost = require('../models/informaPost.model');
const InformaCursor = require('../models/informaCursor.model');
const {
  listTenantSchoolContexts,
  runWithSchoolContext,
  runInControlDb,
  getControlDbSchoolIds,
  normalizeSchoolId,
} = require('../config/db');
const { getSchoolDisplayName } = require('../utils/schoolDisplayName');
const { queueNotificationsForParents } = require('./notification.service');

const INFORMA_VIEWER_ROLES = [
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
  'super_admin',
];

const INFORMA_STAFF_NOTIFY_ROLES = INFORMA_VIEWER_ROLES.filter((role) => role !== 'super_admin');
const INFORMA_PUBLISHER_ROLES = ['super_admin'];
const INFORMA_PUBLIC_AUTHOR_NAME = 'Comergio Informa';
const INFORMA_PUBLIC_AUTHOR_PHOTO = '/informa/avatar-colibri.png';
const MAX_MEDIA_ITEMS = 10;

async function notifyPublishedPost(args) {
  return notifyAllStaffAboutPost(args);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function isSameActor(entry, schoolId, userId) {
  return String(entry?.schoolId || '') === normalizeSchoolId(schoolId)
    && String(entry?.userId || '') === String(userId || '');
}

function canPublishInforma(role) {
  return INFORMA_PUBLISHER_ROLES.includes(String(role || '').toLowerCase());
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

async function notifyAllStaffAboutPost({ postDoc, excludeSchoolId, excludeUserId }) {
  // Kept as internal name; exported as notifyPublishedPost for auto-drafts.
  const title = 'Nueva publicación en Comergio Informa';
  const postTitle = normalizeText(postDoc.title) || 'Novedad de Comergio';
  const body = `Comergio Informa publicó: ${postTitle}`;
  const payload = {
    type: 'informa.post',
    postId: String(postDoc._id),
    section: 'informa',
    url: '/campus/teacher',
  };

  const schoolContexts = await listAllStaffSchoolContexts();

  for (const context of schoolContexts) {
    try {
      const staffIds = await runWithSchoolContext(context.schoolId, async () => {
        const users = await User.find({
          schoolId: context.schoolId,
          role: { $in: INFORMA_STAFF_NOTIFY_ROLES },
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

      await queueNotificationsForParents({
        schoolId: context.schoolId,
        parentIds: staffIds,
        title,
        body,
        payload,
      });
    } catch (error) {
      console.warn(`[INFORMA_NOTIFY] school=${context.schoolId} failed: ${error.message || error}`);
    }
  }
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
    likesCount: likes.length,
    likedByMe: likes.some((like) => isSameActor(like, viewerSchoolId, viewerUserId)),
    createdAt: comment.createdAt || null,
  };
}

function normalizeMediaItem(item) {
  const kind = String(item?.kind || '').toLowerCase() === 'video' ? 'video' : 'image';
  const src = normalizeText(item?.src || item?.url || item?.videoUrl || item?.imageUrl);
  if (!src) return null;
  return {
    kind,
    src,
    thumbUrl: normalizeText(item?.thumbUrl) || (kind === 'image' ? src : ''),
    alt: normalizeText(item?.alt),
  };
}

function serializePostForViewer(doc, viewerSchoolId, viewerUserId, viewerRole) {
  if (!doc) return null;
  const likes = Array.isArray(doc.likes) ? doc.likes : [];
  const comments = Array.isArray(doc.comments) ? doc.comments : [];
  return {
    id: String(doc._id),
    author: {
      schoolId: normalizeText(doc.author?.schoolId),
      userId: String(doc.author?.userId || ''),
      name: INFORMA_PUBLIC_AUTHOR_NAME,
      role: normalizeText(doc.author?.role) || 'super_admin',
      photoUrl: INFORMA_PUBLIC_AUTHOR_PHOTO,
    },
    title: normalizeText(doc.title),
    body: normalizeText(doc.body),
    media: (doc.media || []).map((item) => ({
      kind: item.kind === 'video' ? 'video' : 'image',
      src: normalizeText(item.src),
      thumbUrl: normalizeText(item.thumbUrl) || normalizeText(item.src),
      alt: normalizeText(item.alt),
    })).filter((item) => item.src),
    likesCount: likes.length,
    likedByMe: likes.some((like) => isSameActor(like, viewerSchoolId, viewerUserId)),
    commentsCount: comments.length,
    comments: comments
      .slice()
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .map((comment) => serializeComment(comment, viewerSchoolId, viewerUserId)),
    publishedAt: doc.publishedAt || doc.createdAt || null,
    createdAt: doc.createdAt || null,
    canDelete: Boolean(
      isSameActor(doc.author, viewerSchoolId, viewerUserId)
      || canPublishInforma(viewerRole)
    ),
  };
}

async function createPost({
  schoolId,
  userId,
  role,
  title,
  body,
  media,
}) {
  if (!canPublishInforma(role)) {
    throw new Error('Solo Gerencia Comergio puede publicar en Comergio Informa.');
  }

  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    throw new Error('El título es obligatorio.');
  }

  const normalizedMedia = (Array.isArray(media) ? media : [])
    .map(normalizeMediaItem)
    .filter(Boolean)
    .slice(0, MAX_MEDIA_ITEMS);

  if (!normalizedMedia.length && !normalizeText(body)) {
    throw new Error('Agrega una foto, un video o un texto para publicar.');
  }

  const hasVideo = normalizedMedia.some((item) => item.kind === 'video');
  if (hasVideo && normalizedMedia.length > 1) {
    throw new Error('Una publicación de video no puede mezclarse con otras imágenes.');
  }

  const publishedAt = new Date();
  const postDoc = await runInControlDb(() => InformaPost.create({
    informaEntity: 'post',
    author: {
      schoolId: normalizeSchoolId(schoolId),
      userId: String(userId),
      name: INFORMA_PUBLIC_AUTHOR_NAME,
      role: 'super_admin',
      photoUrl: INFORMA_PUBLIC_AUTHOR_PHOTO,
    },
    title: normalizedTitle,
    body: normalizeText(body),
    media: normalizedMedia,
    likes: [],
    comments: [],
    status: 'published',
    publishedAt,
    source: {
      url: '',
      title: '',
      publisher: '',
      topic: '',
      fetchedAt: null,
    },
    auto: {
      enabled: false,
      slotKey: '',
      generatedAt: null,
      model: '',
    },
  }));

  await runInControlDb(() => InformaCursor.findOneAndUpdate(
    { informaEntity: 'cursor', schoolId: normalizeSchoolId(schoolId), userId: String(userId) },
    { $set: { informaEntity: 'cursor', lastSeenAt: publishedAt } },
    { upsert: true, new: true },
  ));

  setImmediate(() => {
    notifyPublishedPost({
      postDoc,
      excludeSchoolId: schoolId,
      excludeUserId: userId,
    }).catch((error) => {
      console.warn(`[INFORMA_NOTIFY] fan-out failed: ${error.message || error}`);
    });
  });

  return serializePostForViewer(postDoc, schoolId, userId, role);
}

async function listPosts({ schoolId, userId, role, limit = 40 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 80);
  const posts = await runInControlDb(() => InformaPost.find({
    informaEntity: 'post',
    status: 'published',
  })
    .sort({ publishedAt: -1 })
    .limit(safeLimit)
    .lean());

  await runInControlDb(() => InformaCursor.findOneAndUpdate(
    { informaEntity: 'cursor', schoolId: normalizeSchoolId(schoolId), userId: String(userId) },
    { $set: { informaEntity: 'cursor', lastSeenAt: new Date() } },
    { upsert: true, new: true },
  ));

  return posts.map((item) => serializePostForViewer(item, schoolId, userId, role));
}

async function getUnreadCount({ schoolId, userId }) {
  const cursor = await runInControlDb(() => InformaCursor.findOne({
    informaEntity: 'cursor',
    schoolId: normalizeSchoolId(schoolId),
    userId: String(userId),
  }).lean());

  const since = cursor?.lastSeenAt ? new Date(cursor.lastSeenAt) : new Date(0);

  return runInControlDb(() => InformaPost.countDocuments({
    informaEntity: 'post',
    status: 'published',
    publishedAt: { $gt: since },
    $nor: [{
      'author.schoolId': normalizeSchoolId(schoolId),
      'author.userId': String(userId),
    }],
  }));
}

async function togglePostLike({ schoolId, userId, name, postId }) {
  return runInControlDb(async () => {
    const postDoc = await InformaPost.findOne({ _id: postId, informaEntity: 'post' });
    if (!postDoc || postDoc.status !== 'published') {
      throw new Error('Publicación no encontrada.');
    }

    const likes = Array.isArray(postDoc.likes) ? postDoc.likes : [];
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
    postDoc.likes = likes;
    postDoc.informaEntity = 'post';
    await postDoc.save();
    return serializePostForViewer(postDoc, schoolId, userId);
  });
}

async function addComment({ schoolId, userId, name, role, postId, body }) {
  const normalizedBody = normalizeText(body);
  if (!normalizedBody) {
    throw new Error('El comentario no puede estar vacío.');
  }

  const schoolName = await runWithSchoolContext(schoolId, () => getSchoolDisplayName(schoolId));

  return runInControlDb(async () => {
    const postDoc = await InformaPost.findOne({ _id: postId, informaEntity: 'post' });
    if (!postDoc || postDoc.status !== 'published') {
      throw new Error('Publicación no encontrada.');
    }

    postDoc.comments.push({
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
    postDoc.informaEntity = 'post';
    await postDoc.save();
    return serializePostForViewer(postDoc, schoolId, userId, role);
  });
}

async function toggleCommentLike({ schoolId, userId, name, postId, commentId, role }) {
  return runInControlDb(async () => {
    const postDoc = await InformaPost.findOne({ _id: postId, informaEntity: 'post' });
    if (!postDoc || postDoc.status !== 'published') {
      throw new Error('Publicación no encontrada.');
    }

    const comment = postDoc.comments.id(commentId);
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
    postDoc.informaEntity = 'post';
    await postDoc.save();
    return serializePostForViewer(postDoc, schoolId, userId, role);
  });
}

async function archivePost({ schoolId, userId, role, postId }) {
  if (!canPublishInforma(role)) {
    throw new Error('Solo Gerencia Comergio puede archivar publicaciones de Comergio Informa.');
  }

  return runInControlDb(async () => {
    const postDoc = await InformaPost.findOne({ _id: postId, informaEntity: 'post' });
    if (!postDoc || postDoc.status !== 'published') {
      throw new Error('Publicación no encontrada.');
    }

    postDoc.status = 'archived';
    postDoc.informaEntity = 'post';
    await postDoc.save();
    return serializePostForViewer(postDoc, schoolId, userId, role);
  });
}

module.exports = {
  INFORMA_VIEWER_ROLES,
  INFORMA_PUBLISHER_ROLES,
  INFORMA_PUBLIC_AUTHOR_NAME,
  INFORMA_PUBLIC_AUTHOR_PHOTO,
  canPublishInforma,
  serializePostForViewer,
  notifyPublishedPost,
  createPost,
  listPosts,
  getUnreadCount,
  togglePostLike,
  addComment,
  toggleCommentLike,
  archivePost,
};
