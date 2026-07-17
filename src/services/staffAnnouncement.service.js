const User = require('../models/user.model');
const StaffAnnouncement = require('../models/staffAnnouncement.model');
const StaffAnnouncementRecipient = require('../models/staffAnnouncementRecipient.model');
const { queueNotificationsForParents } = require('./notification.service');

const STAFF_ANNOUNCEMENT_TARGET_ROLES = [
  'teacher',
  'psychology',
  'nursing',
  'academic_secretary',
  'admissions',
  'coordination',
  'billing',
];

function normalizeText(value) {
  return String(value || '').trim();
}

function uniqueObjectIds(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || '');
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeTargetRoles(targetRoles, fallback = STAFF_ANNOUNCEMENT_TARGET_ROLES) {
  const allowed = new Set(STAFF_ANNOUNCEMENT_TARGET_ROLES);
  const selected = (Array.isArray(targetRoles) ? targetRoles : [])
    .map((role) => normalizeText(role))
    .filter((role) => allowed.has(role));
  return selected.length ? Array.from(new Set(selected)) : [...fallback];
}

function serializeAnnouncement(announcement, extras = {}) {
  if (!announcement) {
    return null;
  }

  return {
    id: String(announcement._id),
    title: normalizeText(announcement.title),
    body: normalizeText(announcement.body),
    senderUserId: announcement.senderUserId ? String(announcement.senderUserId) : '',
    senderName: normalizeText(announcement.senderName),
    senderRole: normalizeText(announcement.senderRole),
    targetRoles: Array.isArray(announcement.targetRoles) ? announcement.targetRoles : [],
    sourceType: normalizeText(announcement.sourceType) || 'manual',
    sourceId: announcement.sourceId ? String(announcement.sourceId) : null,
    status: normalizeText(announcement.status) || 'published',
    publishedAt: announcement.publishedAt || announcement.createdAt || null,
    createdAt: announcement.createdAt || null,
    updatedAt: announcement.updatedAt || null,
    ...extras,
  };
}

async function resolveRecipientsForRoles({ schoolId, targetRoles, excludeUserId = null }) {
  const roles = normalizeTargetRoles(targetRoles);
  const users = await User.find({
    schoolId,
    role: { $in: roles },
    status: 'active',
    deletedAt: null,
  })
    .select('_id name username role')
    .lean();

  const excludeKey = excludeUserId ? String(excludeUserId) : '';
  return users.filter((user) => String(user._id) !== excludeKey);
}

async function publishStaffAnnouncement({
  schoolId,
  senderUserId,
  senderName = '',
  senderRole = '',
  title,
  body,
  targetRoles = STAFF_ANNOUNCEMENT_TARGET_ROLES,
  sourceType = 'manual',
  sourceId = null,
  notifyPush = true,
}) {
  const normalizedTitle = normalizeText(title);
  const normalizedBody = normalizeText(body);
  if (!normalizedTitle || !normalizedBody) {
    throw new Error('Título y mensaje son requeridos.');
  }

  const roles = normalizeTargetRoles(targetRoles);
  const recipients = await resolveRecipientsForRoles({
    schoolId,
    targetRoles: roles,
    excludeUserId: senderUserId,
  });

  const announcement = await StaffAnnouncement.create({
    schoolId,
    title: normalizedTitle,
    body: normalizedBody,
    senderUserId,
    senderName: normalizeText(senderName),
    senderRole: normalizeText(senderRole),
    targetRoles: roles,
    sourceType: sourceType === 'hr_planner_cycle' ? 'hr_planner_cycle' : 'manual',
    sourceId: sourceId || null,
    status: 'published',
    publishedAt: new Date(),
  });

  if (recipients.length) {
    await StaffAnnouncementRecipient.insertMany(
      recipients.map((user) => ({
        schoolId,
        announcementId: announcement._id,
        userId: user._id,
        roleSnapshot: normalizeText(user.role),
        nameSnapshot: normalizeText(user.name) || normalizeText(user.username) || 'Usuario',
        readAt: null,
      })),
      { ordered: false }
    );
  }

  if (notifyPush && recipients.length) {
    try {
      await queueNotificationsForParents({
        schoolId,
        parentIds: uniqueObjectIds(recipients.map((user) => user._id)),
        title: `Comunicado: ${normalizedTitle}`,
        body: normalizedBody.slice(0, 180),
        payload: {
          type: 'staff_announcement',
          announcementId: String(announcement._id),
        },
      });
    } catch (error) {
      console.warn(`[staff-announcements] push failed: ${error.message}`);
    }
  }

  return announcement;
}

async function publishPlannerAsStaffAnnouncement({
  schoolId,
  senderUserId,
  senderName = '',
  senderRole = '',
  cycle,
}) {
  if (!cycle) {
    return null;
  }

  const deadline = cycle.submissionDeadline
    ? new Date(cycle.submissionDeadline).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    : 'sin fecha límite';

  const instructions = normalizeText(cycle.instructions);
  const bodyParts = [
    `Se publicó el planner "${normalizeText(cycle.title)}".`,
    `Fecha límite de envío: ${deadline}.`,
  ];
  if (instructions) {
    bodyParts.push(`Indicaciones: ${instructions}`);
  }
  bodyParts.push('Revisa la sección Solicitud de recursos para completar tu planner.');

  return publishStaffAnnouncement({
    schoolId,
    senderUserId,
    senderName,
    senderRole,
    title: `Planner: ${normalizeText(cycle.title)}`,
    body: bodyParts.join('\n\n'),
    targetRoles: ['teacher'],
    sourceType: 'hr_planner_cycle',
    sourceId: cycle._id,
  });
}

module.exports = {
  STAFF_ANNOUNCEMENT_TARGET_ROLES,
  serializeAnnouncement,
  normalizeTargetRoles,
  publishStaffAnnouncement,
  publishPlannerAsStaffAnnouncement,
};
