const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const User = require('../models/user.model');
const StaffAnnouncement = require('../models/staffAnnouncement.model');
const StaffAnnouncementRecipient = require('../models/staffAnnouncementRecipient.model');
const {
  STAFF_ANNOUNCEMENT_TARGET_ROLES,
  serializeAnnouncement,
  normalizeTargetRoles,
  publishStaffAnnouncement,
} = require('../services/staffAnnouncement.service');

const router = express.Router();

router.use(authMiddleware);

const senderRoles = ['rectoria', 'coordination', 'admin', 'direccion'];
const inboxRoles = [
  'teacher',
  'psychology',
  'nursing',
  'academic_secretary',
  'admissions',
  'coordination',
  'billing',
  'rectoria',
  'admin',
  'direccion',
];

function normalizeText(value) {
  return String(value || '').trim();
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function roleLabel(role) {
  const labels = {
    teacher: 'Docente',
    psychology: 'Psicología',
    nursing: 'Enfermería',
    academic_secretary: 'Secretaría académica',
    admissions: 'Admisiones',
    coordination: 'Coordinación',
    billing: 'Cartera',
    rectoria: 'Rectoría',
    admin: 'Admin',
    direccion: 'Dirección',
  };
  return labels[normalizeText(role)] || normalizeText(role) || 'Usuario';
}

router.get('/meta', roleMiddleware(senderRoles), async (req, res) => {
  return res.status(200).json({
    targetRoles: STAFF_ANNOUNCEMENT_TARGET_ROLES.map((role) => ({
      value: role,
      label: roleLabel(role),
    })),
  });
});

router.get('/unread-count', roleMiddleware(inboxRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const unreadCount = await StaffAnnouncementRecipient.countDocuments({
      schoolId,
      userId,
      readAt: null,
    });
    return res.status(200).json({ unreadCount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/inbox', roleMiddleware(inboxRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const recipients = await StaffAnnouncementRecipient.find({ schoolId, userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const announcementIds = recipients.map((entry) => entry.announcementId);
    const announcements = await StaffAnnouncement.find({
      schoolId,
      _id: { $in: announcementIds },
      status: 'published',
    }).lean();
    const announcementById = new Map(announcements.map((item) => [String(item._id), item]));

    const items = recipients
      .map((recipient) => {
        const announcement = announcementById.get(String(recipient.announcementId));
        if (!announcement) {
          return null;
        }
        return serializeAnnouncement(announcement, {
          readAt: recipient.readAt || null,
          isRead: Boolean(recipient.readAt),
          recipientId: String(recipient._id),
        });
      })
      .filter(Boolean);

    return res.status(200).json({ announcements: items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/:announcementId/read', roleMiddleware(inboxRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { announcementId } = req.params;
    if (!isValidObjectId(announcementId)) {
      return res.status(400).json({ message: 'Comunicado inválido.' });
    }

    const recipient = await StaffAnnouncementRecipient.findOneAndUpdate(
      {
        schoolId,
        announcementId,
        userId,
        readAt: null,
      },
      { $set: { readAt: new Date() } },
      { new: true }
    );

    if (!recipient) {
      const existing = await StaffAnnouncementRecipient.findOne({ schoolId, announcementId, userId }).lean();
      if (!existing) {
        return res.status(404).json({ message: 'Comunicado no encontrado.' });
      }
      return res.status(200).json({
        announcementId: String(announcementId),
        readAt: existing.readAt,
        alreadyRead: true,
      });
    }

    return res.status(200).json({
      announcementId: String(announcementId),
      readAt: recipient.readAt,
      alreadyRead: false,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/sent', roleMiddleware(senderRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const announcements = await StaffAnnouncement.find({ schoolId, status: 'published' })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean();

    const announcementIds = announcements.map((item) => item._id);
    const recipients = await StaffAnnouncementRecipient.find({
      schoolId,
      announcementId: { $in: announcementIds },
    })
      .select('announcementId readAt')
      .lean();

    const statsByAnnouncement = new Map();
    recipients.forEach((entry) => {
      const key = String(entry.announcementId);
      const current = statsByAnnouncement.get(key) || { total: 0, read: 0 };
      current.total += 1;
      if (entry.readAt) {
        current.read += 1;
      }
      statsByAnnouncement.set(key, current);
    });

    return res.status(200).json({
      announcements: announcements.map((item) => {
        const stats = statsByAnnouncement.get(String(item._id)) || { total: 0, read: 0 };
        return serializeAnnouncement(item, {
          recipientCount: stats.total,
          readCount: stats.read,
          unreadCount: Math.max(0, stats.total - stats.read),
        });
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/:announcementId/recipients', roleMiddleware(senderRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { announcementId } = req.params;
    if (!isValidObjectId(announcementId)) {
      return res.status(400).json({ message: 'Comunicado inválido.' });
    }

    const announcement = await StaffAnnouncement.findOne({ _id: announcementId, schoolId }).lean();
    if (!announcement) {
      return res.status(404).json({ message: 'Comunicado no encontrado.' });
    }

    const readStatus = normalizeText(req.query.readStatus);
    const filter = { schoolId, announcementId };
    if (readStatus === 'read') {
      filter.readAt = { $ne: null };
    } else if (readStatus === 'unread') {
      filter.readAt = null;
    }

    const recipients = await StaffAnnouncementRecipient.find(filter)
      .sort({ roleSnapshot: 1, nameSnapshot: 1 })
      .lean();

    return res.status(200).json({
      announcement: serializeAnnouncement(announcement),
      recipients: recipients.map((entry) => ({
        id: String(entry._id),
        userId: String(entry.userId),
        name: normalizeText(entry.nameSnapshot) || 'Usuario',
        role: normalizeText(entry.roleSnapshot),
        roleLabel: roleLabel(entry.roleSnapshot),
        readAt: entry.readAt || null,
        isRead: Boolean(entry.readAt),
      })),
      summary: {
        total: recipients.length,
        read: recipients.filter((entry) => entry.readAt).length,
        unread: recipients.filter((entry) => !entry.readAt).length,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/', roleMiddleware(senderRoles), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const sender = await User.findOne({ _id: userId, schoolId }).select('name username role').lean();
    const announcement = await publishStaffAnnouncement({
      schoolId,
      senderUserId: userId,
      senderName: normalizeText(sender?.name) || normalizeText(sender?.username) || 'Equipo directivo',
      senderRole: normalizeText(sender?.role) || normalizeText(role),
      title: req.body.title,
      body: req.body.body,
      targetRoles: normalizeTargetRoles(req.body.targetRoles),
      sourceType: 'manual',
    });

    return res.status(201).json({ announcement: serializeAnnouncement(announcement) });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'No se pudo publicar el comunicado.' });
  }
});

module.exports = router;
