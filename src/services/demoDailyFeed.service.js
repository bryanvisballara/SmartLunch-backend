const crypto = require('crypto');
const mongoose = require('mongoose');
const { resolveSchoolDbName } = require('../config/db');
const DemoLead = require('../models/demoLead.model');
const { queueNotificationsForParents } = require('./notification.service');
const { DEMO_DAILY_POSTS, DEMO_FEED_FAMILIES } = require('./demoDailyPosts');

const { ObjectId } = mongoose.Types;

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const COMMENT_DELAYS_MINUTES = [35, 95];
const PUSH_GRACE_MS = 3 * 60 * 60 * 1000;

function bogotaDayNumber(date) {
  return Math.floor((new Date(date).getTime() + BOGOTA_OFFSET_MS) / DAY_MS);
}

function bogotaHour(date) {
  return new Date(new Date(date).getTime() + BOGOTA_OFFSET_MS).getUTCHours();
}

function scheduledAt(createdAt, post) {
  const dayStartUtc = (bogotaDayNumber(createdAt) + post.day) * DAY_MS - BOGOTA_OFFSET_MS;
  return new Date(dayStartUtc + (post.hour * 60 + post.minute) * 60 * 1000);
}

function familyUserId(name) {
  return new ObjectId(crypto.createHash('md5').update(`demo-family:${name}`).digest('hex').slice(0, 24));
}

function pickFamilies(postIndex, count, offset = 0) {
  return Array.from({ length: count }, (_value, index) => (
    DEMO_FEED_FAMILIES[(postIndex * 3 + offset + index) % DEMO_FEED_FAMILIES.length]
  ));
}

function like(name, at) {
  return { _id: new ObjectId(), userId: familyUserId(name), name, createdAt: at };
}

function imageBaseUrl() {
  return String(
    process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_BACKEND_URL || process.env.API_PUBLIC_URL || 'https://api.comergio.com',
  ).trim().replace(/\/+$/, '');
}

function getTenantDb(schoolId) {
  return mongoose.connection.client.db(resolveSchoolDbName(schoolId));
}

async function resolveAuthor(db, schoolId, post) {
  if (post.author.kind === 'secretary') {
    const [secretary, defaultAuthor] = await Promise.all([
      db.collection('users').findOne({ schoolId, role: 'academic_secretary', status: 'active' }),
      db.collection('academiccommunicationauthors').findOne({ schoolId, isDefault: true }),
    ]);
    return {
      createdByUserId: secretary?._id || null,
      createdByName: secretary?.name || '',
      authorId: defaultAuthor?._id || null,
      authorName: defaultAuthor?.name || 'Secretaría académica',
      authorPhotoUrl: defaultAuthor?.photoUrl || '',
      authorThumbUrl: defaultAuthor?.thumbUrl || '',
      publisherRole: 'secretary',
    };
  }

  const teachers = await db.collection('users').find({ schoolId, role: 'teacher', status: 'active' }).toArray();
  const teacher = teachers.find((user) => (user.assignedSubjects || []).some((subject) => post.author.match.test(subject)))
    || teachers[0];
  return {
    createdByUserId: teacher?._id || null,
    createdByName: teacher?.name || '',
    authorId: null,
    authorName: `${post.author.name} - Docente de ${post.author.subject}`,
    authorPhotoUrl: '',
    authorThumbUrl: '',
    publisherRole: 'teacher',
  };
}

async function publishPost(lead, post, postIndex, { sentAt, sendPush }) {
  const schoolId = lead.demoSchoolId;
  const db = getTenantDb(schoolId);
  const author = await resolveAuthor(db, schoolId, post);
  const src = `${imageBaseUrl()}/assets/demo-feed/${post.image}`;
  const communicationId = new ObjectId();

  await db.collection('academiccommunications').insertOne({
    _id: communicationId,
    schoolId,
    ...author,
    audienceType: 'general',
    gradeTargets: [],
    courseTargets: [],
    cohortKey: '',
    academicYear: '',
    authorStudentId: null,
    parentTargets: [],
    studentTargets: [],
    recipientParentIds: [lead.parentUserId],
    recipientStudentIds: [],
    emailSubject: '',
    title: post.title,
    body: post.body,
    media: [{ _id: new ObjectId(), kind: 'image', src, thumbUrl: src, alt: post.alt }],
    likes: pickFamilies(postIndex, 2).map((name) => like(name, sentAt)),
    comments: [],
    channels: { feed: true, push: sendPush, email: false },
    deliverySummary: null,
    sentAt,
    createdAt: sentAt,
    updatedAt: sentAt,
    __v: 0,
  });

  if (sendPush) {
    queueNotificationsForParents({
      schoolId,
      parentIds: [lead.parentUserId],
      title: post.title,
      body: post.body,
      payload: { type: 'academic.communication', communicationId: String(communicationId), url: '/parent' },
    }).catch((error) => console.warn(`[DEMO_FEED] push failed ${post.key} school=${schoolId}: ${error.message}`));
  }

  return communicationId;
}

async function addComment(lead, entry, post, postIndex, commentIndex) {
  const name = pickFamilies(postIndex, 1, 5 + commentIndex)[0];
  const at = new Date(new Date(entry.publishedAt).getTime() + COMMENT_DELAYS_MINUTES[commentIndex] * 60 * 1000);
  const extraLikes = pickFamilies(postIndex, 2, 2 + commentIndex * 2).map((likeName) => like(likeName, at));

  await getTenantDb(lead.demoSchoolId).collection('academiccommunications').updateOne(
    { _id: entry.communicationId },
    {
      $push: {
        comments: {
          _id: new ObjectId(),
          userId: familyUserId(name),
          name,
          body: post.comments[commentIndex],
          likes: [],
          createdAt: at,
          updatedAt: at,
        },
        likes: { $each: extraLikes },
      },
    },
  );
}

async function processLead(lead, now) {
  const published = new Map((lead.feedPosts || []).map((entry) => [entry.key, entry]));

  for (const [postIndex, post] of DEMO_DAILY_POSTS.entries()) {
    const dueAt = scheduledAt(lead.createdAt, post);
    if (dueAt > now) {
      continue;
    }

    const entry = published.get(post.key);
    if (!entry) {
      const claimed = await DemoLead.updateOne(
        { _id: lead._id, 'feedPosts.key': { $ne: post.key } },
        { $push: { feedPosts: { key: post.key, communicationId: null, publishedAt: dueAt, commentsAdded: 0 } } },
      );
      if (!claimed.modifiedCount) {
        continue;
      }
      try {
        const communicationId = await publishPost(lead, post, postIndex, {
          sentAt: dueAt,
          sendPush: now.getTime() - dueAt.getTime() <= PUSH_GRACE_MS,
        });
        await DemoLead.updateOne(
          { _id: lead._id, 'feedPosts.key': post.key },
          { $set: { 'feedPosts.$.communicationId': communicationId } },
        );
        console.info(`[DEMO_FEED] published ${post.key} school=${lead.demoSchoolId}`);
      } catch (error) {
        await DemoLead.updateOne({ _id: lead._id }, { $pull: { feedPosts: { key: post.key } } });
        console.warn(`[DEMO_FEED] publish failed ${post.key} school=${lead.demoSchoolId}: ${error.message}`);
      }
      continue;
    }

    const commentIndex = entry.commentsAdded || 0;
    if (!entry.communicationId || commentIndex >= post.comments.length) {
      continue;
    }
    const commentDueAt = new Date(new Date(entry.publishedAt).getTime() + COMMENT_DELAYS_MINUTES[commentIndex] * 60 * 1000);
    if (commentDueAt > now) {
      continue;
    }
    const claimed = await DemoLead.updateOne(
      { _id: lead._id, feedPosts: { $elemMatch: { key: post.key, commentsAdded: commentIndex } } },
      { $inc: { 'feedPosts.$.commentsAdded': 1 } },
    );
    if (claimed.modifiedCount) {
      await addComment(lead, entry, post, postIndex, commentIndex);
    }
  }
}

async function publishDueDemoFeedPosts(now = new Date()) {
  const leads = await DemoLead.find({
    status: 'ready',
    parentUserId: { $ne: null },
    createdAt: { $gte: new Date(now.getTime() - 8 * DAY_MS) },
  }).select('_id demoSchoolId parentUserId createdAt feedPosts').lean();

  for (const lead of leads) {
    try {
      await processLead(lead, now);
    } catch (error) {
      console.warn(`[DEMO_FEED] lead ${lead._id} failed: ${error.message}`);
    }
  }
}

module.exports = {
  bogotaDayNumber,
  bogotaHour,
  publishDueDemoFeedPosts,
  scheduledAt,
};
