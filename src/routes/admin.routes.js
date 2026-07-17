const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const multer = require('multer');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const Store = require('../models/store.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const WalletTopupRequest = require('../models/walletTopupRequest.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const ParentPaymentMethod = require('../models/parentPaymentMethod.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const Notification = require('../models/notification.model');
const DeviceToken = require('../models/deviceToken.model');
const PasswordResetCode = require('../models/passwordResetCode.model');
const MeriendaSubscription = require('../models/meriendaSubscription.model');
const MeriendaWaitlist = require('../models/meriendaWaitlist.model');
const MeriendaFailedPayment = require('../models/meriendaFailedPayment.model');
const Order = require('../models/order.model');
const FixedCost = require('../models/fixedCost.model');
const Supplier = require('../models/supplier.model');
const AccountingFeeSetting = require('../models/accountingFeeSetting.model');
const AcademicGradePromotionRequest = require('../models/academicGradePromotionRequest.model');
const AcademicFeeConfiguration = require('../models/academicFeeConfiguration.model');
const StudentBillingProfile = require('../models/studentBillingProfile.model');
const {
  uploadImageMiddleware,
  processAndStoreUploadedImage,
  normalizeStoredImageUrl,
  deriveThumbUrlFromImageUrl,
  validateIncomingImageUrl,
} = require('../utils/imageUpload');
const { upsertStudentAccount } = require('../utils/studentAccount');
const { invalidateSchoolMenuCache } = require('../services/menuCache.service');
const { ensureStudentCohortMembership } = require('../services/communityFeed.service');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin', 'rectoria', 'direccion'));

const DEFAULT_ACCOUNTING_FEE_SETTINGS = {
  dataphonePercent: 0,
  dataphoneFixedFee: 0,
  dataphoneRetentionPercent: 0,
  qrPercent: 0,
};

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || '').trim());
}

function normalizeDocumentType(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['CC', 'TI', 'CE', 'PP', 'NIT'].includes(normalized) ? normalized : '';
}

function normalizeDocumentNumber(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

const ADMIN_MANAGED_USER_ROLES = ['parent', 'vendor', 'admin', 'rectoria', 'direccion', 'merienda_operator', 'academic_secretary', 'admissions', 'billing', 'human_resources', 'coordination', 'teacher', 'nursing', 'psychology', 'school_route'];
const HARD_DELETE_USER_ROLES = ADMIN_MANAGED_USER_ROLES.filter((role) => role !== 'parent');
function normalizeText(value) {
  return String(value || '').trim();
}

async function releaseDeletedInstitutionalUsername({ schoolId, username, excludedUserId = null }) {
  const normalizedUsername = String(username || '').toLowerCase().trim();
  if (!normalizedUsername) {
    return null;
  }

  const filter = { username: normalizedUsername };
  if (excludedUserId) {
    filter._id = { $ne: excludedUserId };
  }

  const existing = await User.findOne(filter).select('_id schoolId role deletedAt').lean();
  if (!existing) {
    return null;
  }

  const canRelease =
    String(existing.schoolId) === String(schoolId) &&
    existing.deletedAt &&
    HARD_DELETE_USER_ROLES.includes(String(existing.role));

  if (!canRelease) {
    return existing;
  }

  await User.deleteOne({ _id: existing._id, schoolId, deletedAt: { $ne: null } });
  return null;
}

function normalizeCoordinationScope(value) {
  return String(value || '').trim();
}

function normalizeStringArray(values) {
  if (Array.isArray(values)) {
    return Array.from(new Set(values.map((item) => normalizeText(item)).filter(Boolean)));
  }

  return Array.from(
    new Set(
      String(values || '')
        .split(',')
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  );
}

function normalizeBenefitRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, index) => {
      const discountType = normalizeText(rule?.discountType) === 'fixed' ? 'fixed' : 'percent';
      return {
        label: normalizeText(rule?.label) || `Beneficio ${index + 1}`,
        startDay: Math.min(31, Math.max(1, Number(rule?.startDay || 1))),
        endDay: Math.min(31, Math.max(1, Number(rule?.endDay || 10))),
        discountType,
        discountPercent: discountType === 'percent' ? Math.min(100, Math.max(0, Number(rule?.discountPercent || 0))) : 0,
        fixedAmountsByGrade: normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {}),
      };
    })
    .filter((rule) => rule.endDay >= rule.startDay)
    .sort((left, right) => left.startDay - right.startDay || right.discountPercent - left.discountPercent);
}

function normalizeBenefitFixedAmountsByGrade(rawAmounts = {}) {
  const entries = rawAmounts instanceof Map ? Array.from(rawAmounts.entries()) : Object.entries(rawAmounts || {});
  return entries.reduce((accumulator, [grade, amount]) => {
    const normalizedGrade = normalizeText(grade).toLowerCase();
    if (!normalizedGrade) {
      return accumulator;
    }

    accumulator[normalizedGrade] = Math.max(0, Math.round(Number(amount || 0)));
    return accumulator;
  }, {});
}

function getCurrentAcademicYear() {
  return String(new Date().getFullYear());
}

function findGradeFeeSetting(configuration, grade) {
  const settings = Array.isArray(configuration?.gradeSettings) ? configuration.gradeSettings : [];
  const normalizedGrade = normalizeText(grade).toLowerCase();
  return settings.find((item) => normalizeText(item?.grade).toLowerCase() === normalizedGrade) || null;
}

function getPromotedGradeValue(rawGrade) {
  const grade = normalizeText(rawGrade);
  if (!grade) {
    return '';
  }

  const normalized = grade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const preschoolMap = {
    prejardin: 'Jardin',
    jardin: 'Transicion',
    transicion: '1',
  };

  if (preschoolMap[normalized]) {
    return preschoolMap[normalized];
  }

  const numericMatch = grade.match(/^(\d{1,2})(.*)$/);
  if (!numericMatch) {
    return '';
  }

  const numericGrade = Number(numericMatch[1]);
  if (!Number.isFinite(numericGrade) || numericGrade >= 11) {
    return '';
  }

  return `${numericGrade + 1}${numericMatch[2] || ''}`.trim();
}

function serializeAcademicGradePromotionRequest(item) {
  if (!item) {
    return null;
  }

  return {
    _id: item._id,
    status: normalizeText(item.status) || 'pending',
    requestedAt: item.requestedAt || item.createdAt || null,
    requestedByName: normalizeText(item.requestedByName),
    reviewedAt: item.reviewedAt || null,
    reviewedByName: normalizeText(item.reviewedByName),
    reviewNotes: normalizeText(item.reviewNotes),
    totalStudents: Number(item.totalStudents || 0),
    promotableStudents: Number(item.promotableStudents || 0),
    skippedStudents: Number(item.skippedStudents || 0),
    appliedStudents: Number(item.appliedStudents || 0),
    preview: Array.isArray(item.preview) ? item.preview : [],
  };
}

function normalizeNonNegativeNumber(value, { max = null } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  if (max !== null && parsed > max) {
    return null;
  }

  return parsed;
}

function toObjectIdOrNull(value) {
  const normalized = String(value || '').trim();
  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    return null;
  }

  return new mongoose.Types.ObjectId(normalized);
}

const BOGOTA_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;

function getBogotaShiftedDate(date = new Date()) {
  return new Date(date.getTime() + BOGOTA_UTC_OFFSET_MS);
}

function bogotaLocalToUtcDate(year, monthIndex, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, second, millisecond) - BOGOTA_UTC_OFFSET_MS);
}

function normalizeBogotaDate(value) {
  const normalizedText = String(value || '').trim();
  let base;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedText)) {
    const [yearText, monthText, dayText] = normalizedText.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const dayOfMonth = Number(dayText);
    base = bogotaLocalToUtcDate(year, month - 1, dayOfMonth);
  } else {
    base = value ? new Date(value) : new Date();
  }

  if (Number.isNaN(base.getTime())) {
    return null;
  }

  const shifted = getBogotaShiftedDate(base);
  return bogotaLocalToUtcDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
}

function toBogotaWeekStartDate(value) {
  const normalizedDay = normalizeBogotaDate(value);
  if (!normalizedDay) {
    return null;
  }

  const shifted = getBogotaShiftedDate(normalizedDay);
  const day = shifted.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;

  return bogotaLocalToUtcDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + diff
  );
}

function monthKeyFromDate(date) {
  const shifted = getBogotaShiftedDate(date);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function normalizeObjectIdList(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  const dedup = new Set();
  const ids = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!mongoose.Types.ObjectId.isValid(normalized) || dedup.has(normalized)) {
      continue;
    }

    dedup.add(normalized);
    ids.push(new mongoose.Types.ObjectId(normalized));
  }

  return ids;
}

router.get('/academic-grade-promotions', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const status = normalizeText(req.query?.status);
    const filter = { schoolId };
    if (['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }

    const items = await AcademicGradePromotionRequest.find(filter).sort({ requestedAt: -1, createdAt: -1 }).lean();
    return res.status(200).json(items.map(serializeAcademicGradePromotionRequest));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/academic-grade-promotions/:id/approve', async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const requestId = toObjectIdOrNull(req.params.id);
    if (!requestId) {
      return res.status(400).json({ message: 'Solicitud invalida.' });
    }

    const requestRecord = await AcademicGradePromotionRequest.findOne({ _id: requestId, schoolId });
    if (!requestRecord) {
      return res.status(404).json({ message: 'No se encontró la solicitud.' });
    }

    if (requestRecord.status !== 'pending') {
      return res.status(400).json({ message: 'La solicitud ya fue atendida.' });
    }

    const students = await Student.find({ schoolId, deletedAt: null });
    const configuration = await AcademicFeeConfiguration.findOne({ schoolId }).lean();
    let appliedStudents = 0;

    for (const student of students) {
      const nextGrade = getPromotedGradeValue(student.grade);
      if (!nextGrade) {
        continue;
      }

      student.grade = nextGrade;
      await student.save();
      await ensureStudentCohortMembership(student, schoolId);
      appliedStudents += 1;

      const billingProfile = await StudentBillingProfile.findOne({ schoolId, studentId: student._id });
      if (!billingProfile) {
        continue;
      }

      const gradeFeeSetting = findGradeFeeSetting(configuration, nextGrade);
      billingProfile.grade = nextGrade;
      billingProfile.academicYear = normalizeText(configuration?.academicYear) || getCurrentAcademicYear();
      billingProfile.enrollmentBonusAmount = Number(gradeFeeSetting?.enrollmentBonus || 0);
      billingProfile.annualTuitionAmount = Number(gradeFeeSetting?.enrollmentFee || 0);
      billingProfile.monthlyTuitionAmount = Number(gradeFeeSetting?.monthlyTuition || 0);
      billingProfile.dueDay = Math.min(28, Math.max(1, Number(gradeFeeSetting?.dueDay || 10)));
      billingProfile.benefitRules = normalizeBenefitRules(gradeFeeSetting?.benefitRules || []);
      await billingProfile.save();
    }

    requestRecord.status = 'approved';
    requestRecord.reviewNotes = normalizeText(req.body?.reviewNotes);
    requestRecord.reviewedAt = new Date();
    requestRecord.reviewedByUserId = userId;
    requestRecord.reviewedByName = normalizeText(name) || 'Rectoría';
    requestRecord.appliedStudents = appliedStudents;
    await requestRecord.save();

    return res.status(200).json({
      message: 'Promoción general aprobada y aplicada a la base académica.',
      item: serializeAcademicGradePromotionRequest(requestRecord),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/academic-grade-promotions/:id/reject', async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const requestId = toObjectIdOrNull(req.params.id);
    if (!requestId) {
      return res.status(400).json({ message: 'Solicitud invalida.' });
    }

    const requestRecord = await AcademicGradePromotionRequest.findOne({ _id: requestId, schoolId });
    if (!requestRecord) {
      return res.status(404).json({ message: 'No se encontró la solicitud.' });
    }

    if (requestRecord.status !== 'pending') {
      return res.status(400).json({ message: 'La solicitud ya fue atendida.' });
    }

    requestRecord.status = 'rejected';
    requestRecord.reviewNotes = normalizeText(req.body?.reviewNotes);
    requestRecord.reviewedAt = new Date();
    requestRecord.reviewedByUserId = userId;
    requestRecord.reviewedByName = normalizeText(name) || 'Rectoría';
    requestRecord.appliedStudents = 0;
    await requestRecord.save();

    return res.status(200).json({
      message: 'Solicitud de promoción general rechazada.',
      item: serializeAcademicGradePromotionRequest(requestRecord),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

function normalizeImageUrl(value, includeImageData) {
  if (includeImageData) {
    return normalizeStoredImageUrl(value);
  }
  return normalizeStoredImageUrl(value);
}

function normalizeProductName(value) {
  return String(value || '').trim().toLowerCase();
}

const normalizeLegacyHeader = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const normalizeLegacyName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const parseLegacyBalance = (value) => {
  const input = String(value ?? '').trim();
  if (!input) {
    return 0;
  }

  let cleaned = input.replace(/\s+/g, '').replace(/\$/g, '');

  if (cleaned.includes('.') && !cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pickLegacyValue = (row, keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  const normalizedEntries = Object.entries(row || {}).map(([key, value]) => [normalizeLegacyHeader(key), value]);
  for (const key of keys) {
    const found = normalizedEntries.find(([normalized]) => normalized === normalizeLegacyHeader(key));
    if (found) {
      return found[1];
    }
  }

  return '';
};

const uploadSingleImage = uploadImageMiddleware.single('image');

router.post('/uploads/image', (req, res) => {
  uploadSingleImage(req, res, async (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: 'La imagen supera el limite permitido. Usa una imagen mas liviana.',
      });
    }

    if (error) {
      return res.status(400).json({ message: error.message || 'No se pudo cargar la imagen.' });
    }

    try {
      const folder = req.body?.folder || 'products';
      const preferredName = req.body?.preferredName || req.file?.originalname;
      const saved = await processAndStoreUploadedImage({
        file: req.file,
        folder,
        preferredName,
      });

      return res.status(201).json({
        ...saved,
        imageUrl: saved.url,
      });
    } catch (processingError) {
      return res.status(400).json({ message: processingError.message });
    }
  });
});

router.get('/categories', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const categories = await Category.find({ schoolId, deletedAt: null })
      .select('_id name imageUrl thumbUrl status createdAt updatedAt')
      .sort({ name: 1 })
      .lean();
    return res.status(200).json(
      categories.map((category) => ({
        ...category,
        imageUrl: normalizeImageUrl(category.imageUrl, false),
        thumbUrl: normalizeStoredImageUrl(category.thumbUrl) || deriveThumbUrlFromImageUrl(category.imageUrl),
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { name, imageUrl = '', thumbUrl = '' } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const category = await Category.create({
      schoolId,
      name: String(name).trim(),
      imageUrl: validateIncomingImageUrl(imageUrl),
      thumbUrl: validateIncomingImageUrl(thumbUrl) || deriveThumbUrlFromImageUrl(imageUrl),
      status: 'active',
    });

    await invalidateSchoolMenuCache(schoolId);

    return res.status(201).json(category);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Category already exists' });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/categories/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { name, status, imageUrl, thumbUrl } = req.body;

    const category = await Category.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'name is required' });
      }
      category.name = String(name).trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      if (!['active', 'inactive'].includes(String(status))) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      category.status = String(status);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'imageUrl')) {
      category.imageUrl = validateIncomingImageUrl(imageUrl);
      if (!Object.prototype.hasOwnProperty.call(req.body, 'thumbUrl')) {
        category.thumbUrl = deriveThumbUrlFromImageUrl(imageUrl);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'thumbUrl')) {
      category.thumbUrl = validateIncomingImageUrl(thumbUrl);
    }

    await category.save();
    await invalidateSchoolMenuCache(schoolId);
    return res.status(200).json(category);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Category already exists' });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const category = await Category.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.deletedAt = new Date();
    category.status = 'inactive';
    await category.save();
    await invalidateSchoolMenuCache(schoolId);

    return res.status(200).json({ message: 'Category deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/suppliers', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const suppliers = await Supplier.find({ schoolId, deletedAt: null })
      .populate('productIds', '_id name status')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json(
      suppliers.map((supplier) => ({
        ...supplier,
        productIds: Array.isArray(supplier.productIds)
          ? supplier.productIds
            .filter((product) => product && product._id)
            .map((product) => ({
              _id: String(product._id),
              name: product.name || 'Producto',
              status: product.status || 'active',
            }))
          : [],
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/suppliers', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      name,
      contactName = '',
      phone = '',
      email = '',
      notes = '',
      productIds = [],
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const normalizedProductIds = normalizeObjectIdList(productIds);

    const supplier = await Supplier.create({
      schoolId,
      name: String(name).trim(),
      contactName: String(contactName || '').trim(),
      phone: String(phone || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      notes: String(notes || '').trim(),
      productIds: normalizedProductIds,
      status: 'active',
    });

    const populated = await Supplier.findById(supplier._id)
      .populate('productIds', '_id name status')
      .lean();

    return res.status(201).json(populated);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Supplier already exists' });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/suppliers/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const supplier = await Supplier.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ message: 'name is required' });
      }
      supplier.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'contactName')) {
      supplier.contactName = String(req.body.contactName || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
      supplier.phone = String(req.body.phone || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      supplier.email = String(req.body.email || '').trim().toLowerCase();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
      supplier.notes = String(req.body.notes || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const status = String(req.body.status || '').trim();
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      supplier.status = status;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'productIds')) {
      supplier.productIds = normalizeObjectIdList(req.body.productIds || []);
    }

    await supplier.save();
    const populated = await Supplier.findById(supplier._id)
      .populate('productIds', '_id name status')
      .lean();

    return res.status(200).json(populated);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Supplier already exists' });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/suppliers/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const supplier = await Supplier.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    supplier.deletedAt = new Date();
    supplier.status = 'inactive';
    await supplier.save();

    return res.status(200).json({ message: 'Supplier deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/accounting-fees', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const setting = await AccountingFeeSetting.findOne({ schoolId }).lean();
    return res.status(200).json({
      ...DEFAULT_ACCOUNTING_FEE_SETTINGS,
      ...(setting || {}),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/accounting-fees', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const dataphonePercent = normalizeNonNegativeNumber(req.body?.dataphonePercent, { max: 100 });
    const dataphoneFixedFee = normalizeNonNegativeNumber(req.body?.dataphoneFixedFee);
    const dataphoneRetentionPercent = normalizeNonNegativeNumber(req.body?.dataphoneRetentionPercent, { max: 100 });
    const qrPercent = normalizeNonNegativeNumber(req.body?.qrPercent, { max: 100 });

    if (
      dataphonePercent === null
      || dataphoneFixedFee === null
      || dataphoneRetentionPercent === null
      || qrPercent === null
    ) {
      return res.status(400).json({ message: 'Invalid fee values. Use non-negative numbers and percent values up to 100.' });
    }

    const saved = await AccountingFeeSetting.findOneAndUpdate(
      { schoolId },
      {
        $set: {
          schoolId,
          dataphonePercent,
          dataphoneFixedFee,
          dataphoneRetentionPercent,
          qrPercent,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json(saved);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/fixed-costs', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { storeId = '', type = '', month = '' } = req.query;

    const filter = {
      schoolId,
      deletedAt: null,
      status: 'active',
    };

    const normalizedStoreId = String(storeId || '').trim();
    if (normalizedStoreId) {
      filter.$or = [{ storeId: null }, { storeId: normalizedStoreId }];
    }

    const normalizedType = String(type || '').trim().toLowerCase();
    if (normalizedType) {
      if (!['fixed', 'variable'].includes(normalizedType)) {
        return res.status(400).json({ message: 'Invalid type. Use fixed or variable' });
      }
      filter.type = normalizedType;
    }

    const normalizedMonth = String(month || '').trim();
    filter.monthKey = /^\d{4}-\d{2}$/.test(normalizedMonth)
      ? normalizedMonth
      : monthKeyFromDate(new Date());

    const fixedCosts = await FixedCost.find(filter)
      .populate('storeId', 'name')
      .populate('supplierId', 'name')
      .sort({ weekStart: -1, createdAt: -1 })
      .lean();

    return res.status(200).json(fixedCosts);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/fixed-costs', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      name,
      amount,
      storeId = null,
      type = 'fixed',
      weekStart,
      supplierId = null,
      supplierOtherName = '',
    } = req.body;

    if (Number(amount) < 0) {
      return res.status(400).json({ message: 'amount must be >= 0' });
    }

    const normalizedType = String(type || '').trim().toLowerCase();
    if (!['fixed', 'variable'].includes(normalizedType)) {
      return res.status(400).json({ message: 'Invalid type. Use fixed or variable' });
    }

    let normalizedName = String(name || '').trim();
    let normalizedSupplierId = null;
    let normalizedSupplierName = '';

    if (normalizedType === 'variable') {
      const supplierIdText = String(supplierId || '').trim();
      const supplierOtherText = String(supplierOtherName || '').trim();

      if (supplierIdText && supplierIdText !== 'other') {
        if (!mongoose.Types.ObjectId.isValid(supplierIdText)) {
          return res.status(400).json({ message: 'Invalid supplierId' });
        }

        const foundSupplier = await Supplier.findOne({
          _id: supplierIdText,
          schoolId,
          deletedAt: null,
        }).select('_id name').lean();

        if (!foundSupplier) {
          return res.status(404).json({ message: 'Supplier not found' });
        }

        normalizedSupplierId = foundSupplier._id;
        normalizedSupplierName = String(foundSupplier.name || '').trim();
        normalizedName = normalizedSupplierName || normalizedName;
      } else if (supplierIdText === 'other') {
        if (!supplierOtherText) {
          return res.status(400).json({ message: 'supplierOtherName is required when supplier is other' });
        }

        normalizedSupplierName = supplierOtherText;
        normalizedName = supplierOtherText;
      }
    }

    if (!normalizedName) {
      return res.status(400).json({ message: 'name is required' });
    }

    const normalizedEffectiveDate = normalizeBogotaDate(weekStart);
    if (!normalizedEffectiveDate) {
      return res.status(400).json({ message: 'Invalid weekStart date' });
    }

    const normalizedWeekStart = toBogotaWeekStartDate(normalizedEffectiveDate);
    if (!normalizedWeekStart) {
      return res.status(400).json({ message: 'Invalid weekStart date' });
    }

    const fixedCost = await FixedCost.create({
      schoolId,
      storeId: storeId || null,
      name: normalizedName,
      supplierId: normalizedSupplierId,
      supplierName: normalizedSupplierName,
      amount: Number(amount || 0),
      type: normalizedType,
      effectiveDate: normalizedEffectiveDate,
      weekStart: normalizedWeekStart,
      monthKey: monthKeyFromDate(normalizedEffectiveDate),
      status: 'active',
    });

    const populated = await FixedCost.findById(fixedCost._id)
      .populate('storeId', 'name')
      .populate('supplierId', 'name')
      .lean();
    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/fixed-costs/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const result = await FixedCost.updateOne(
      { _id: req.params.id, schoolId, deletedAt: null },
      {
        $set: {
          deletedAt: new Date(),
          status: 'inactive',
        },
      }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: 'Fixed cost not found' });
    }

    return res.status(200).json({ message: 'Fixed cost deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/stores', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const stores = await Store.find({ schoolId, deletedAt: null }).sort({ name: 1 }).lean();
    return res.status(200).json(stores);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { includeInactive = 'true', status = 'active' } = req.query;

    const filter = {
      schoolId,
      deletedAt: null,
    };

    if (includeInactive !== 'true') {
      filter.status = status;
    }

    const productSelect = '_id name price cost stock inventoryAlertStock status storeId categoryId imageUrl thumbUrl shortDescription';

    const products = await Product.find(filter)
      .select(productSelect)
      .populate({ path: 'categoryId', select: 'name', options: { lean: true } })
      .populate({ path: 'storeId', select: 'name', options: { lean: true } })
      .lean();

    const normalized = products
      .map((product) => ({
        ...product,
        imageUrl: normalizeImageUrl(product.imageUrl, false),
        thumbUrl: normalizeStoredImageUrl(product.thumbUrl) || deriveThumbUrlFromImageUrl(product.imageUrl),
        categoryName: product.categoryId?.name || 'Sin categoria',
        categoryId: String(product.categoryId?._id || product.categoryId || ''),
        storeName: product.storeId?.name || '',
        storeId: String(product.storeId?._id || product.storeId || ''),
      }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));

    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/stores', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { name, location = '' } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const store = await Store.create({
      schoolId,
      name: String(name).trim(),
      location: String(location || '').trim(),
      status: 'active',
    });

    return res.status(201).json(store);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/stores/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { name, location, status } = req.body;

    const store = await Store.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'name is required' });
      }
      store.name = String(name).trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'location')) {
      store.location = String(location || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      if (!['active', 'inactive'].includes(String(status))) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      store.status = String(status);
    }

    await store.save();
    return res.status(200).json(store);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/stores/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const store = await Store.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    store.deletedAt = new Date();
    store.status = 'inactive';
    await store.save();

    return res.status(200).json({ message: 'Store deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { schoolId, role: requesterRole } = req.user;
    const { role } = req.query;

    const filter = {
      schoolId,
      deletedAt: null,
    };

    if (role) {
      filter.role = role;
    }

    const users = await User.find(filter)
      .select('_id name username email phone documentType documentNumber role status createdAt assignedStoreId coordinationScope assignedSubjects')
      .sort({ createdAt: -1 })
      .lean();

    const validAssignedStoreIds = Array.from(new Set(
      users
        .map((item) => String(item?.assignedStoreId || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )).map((id) => new mongoose.Types.ObjectId(id));

    const stores = validAssignedStoreIds.length > 0
      ? await Store.find({ _id: { $in: validAssignedStoreIds }, schoolId, deletedAt: null })
        .select('_id name status')
        .lean()
      : [];

    const storeById = stores.reduce((accumulator, store) => {
      accumulator[String(store._id)] = {
        _id: store._id,
        name: store.name,
        status: store.status,
      };
      return accumulator;
    }, {});

    const normalizedUsers = users.map((item) => {
      const assignedStoreId = String(item?.assignedStoreId || '').trim();
      const assignedStore = assignedStoreId ? storeById[assignedStoreId] || null : null;

      return {
        ...item,
        coordinationScope: item.coordinationScope || '',
        assignedSubjects: Array.isArray(item.assignedSubjects) ? item.assignedSubjects : [],
        assignedStoreId: assignedStore?._id || null,
        assignedStore,
      };
    });

    return res.status(200).json(normalizedUsers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { schoolId, role: requesterRole } = req.user;
  const { name, username, email, phone, password, role, assignedStoreId, documentType, documentNumber, coordinationScope = '', assignedSubjects = [] } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({ message: 'name, username, password and role are required' });
    }

    if (!ADMIN_MANAGED_USER_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const normalizedCoordinationScope = normalizeCoordinationScope(coordinationScope);
    const normalizedAssignedSubjects = normalizeStringArray(assignedSubjects);

    if (String(role) === 'coordination' && !normalizedCoordinationScope) {
      return res.status(400).json({ message: 'coordinationScope is required for coordination users' });
    }

    let resolvedAssignedStoreId = null;
    if (String(role) === 'vendor') {
      if (!assignedStoreId) {
        return res.status(400).json({ message: 'assignedStoreId is required for vendor users' });
      }

      const store = await Store.findOne({ _id: assignedStoreId, schoolId, deletedAt: null, status: 'active' }).select('_id name status');
      if (!store) {
        return res.status(400).json({ message: 'Assigned store not found or inactive' });
      }

      resolvedAssignedStoreId = store._id;
    }

    const normalizedUsername = String(username).toLowerCase().trim();
    const normalizedEmail = normalizeEmail(email) || (isValidEmail(normalizedUsername) ? normalizedUsername : '');
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const normalizedDocumentNumber = normalizeDocumentNumber(documentNumber);

    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Invalid email' });
    }

    if (String(role) === 'parent') {
      if (!normalizedEmail) {
        return res.status(400).json({ message: 'email is required for parent users' });
      }

      if (!normalizedDocumentType || normalizedDocumentNumber.length < 5) {
        return res.status(400).json({ message: 'documentType and documentNumber are required for parent users' });
      }
    }

    const existing = await releaseDeletedInstitutionalUsername({ schoolId, username: normalizedUsername });
    if (existing) {
      return res.status(409).json({ message: 'Username already registered' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      schoolId,
      name: String(name).trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      phone: String(phone || '').trim(),
      documentType: normalizedDocumentType,
      documentNumber: normalizedDocumentNumber,
      assignedStoreId: resolvedAssignedStoreId,
      coordinationScope: String(role) === 'coordination' ? normalizedCoordinationScope : '',
      assignedSubjects: String(role) === 'teacher' ? normalizedAssignedSubjects : [],
      passwordHash,
      role,
      status: 'active',
    });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      role: user.role,
      coordinationScope: user.coordinationScope || '',
      assignedSubjects: Array.isArray(user.assignedSubjects) ? user.assignedSubjects : [],
      status: user.status,
      assignedStoreId: user.assignedStoreId || null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/users/import-legacy-parents', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      rows = [],
      defaultPassword = 'Comergio2026*',
    } = req.body || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'rows is required and must be a non-empty array' });
    }

    if (rows.length > 20000) {
      return res.status(400).json({ message: 'rows limit exceeded (max 20000)' });
    }

    const summary = {
      totalRows: rows.length,
      createdParents: 0,
      updatedParents: 0,
      skippedRows: 0,
      usernameConflicts: 0,
      errors: 0,
    };

    const conflictExamples = [];
    const passwordHash = await bcrypt.hash(String(defaultPassword), 10);

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};

      try {
        const name = String(row.name || row.acudiente || row.parentName || '').trim();
        const username = String(row.username || row.user || row.nombreUsuario || '').toLowerCase().trim();
        const phone = String(row.phone || row.telefono || row.celular || '').trim();

        if (!name || !username) {
          summary.skippedRows += 1;
          continue;
        }

        const existing = await User.findOne({ username });

        if (!existing) {
          await User.create({
            schoolId,
            name,
            username,
            phone,
            passwordHash,
            role: 'parent',
            status: 'active',
          });
          summary.createdParents += 1;
          continue;
        }

        if (String(existing.schoolId) !== String(schoolId) || String(existing.role) !== 'parent') {
          summary.usernameConflicts += 1;
          summary.skippedRows += 1;
          if (conflictExamples.length < 20) {
            conflictExamples.push({
              row: index + 1,
              username,
              reason: String(existing.schoolId) !== String(schoolId)
                ? 'username pertenece a otro colegio'
                : `username pertenece a rol ${existing.role}`,
            });
          }
          continue;
        }

        existing.name = name;
        existing.phone = phone;
        existing.status = 'active';
        existing.deletedAt = null;
        await existing.save();
        summary.updatedParents += 1;
      } catch (rowError) {
        summary.errors += 1;
      }
    }

    return res.status(200).json({
      message: 'Migracion de papas completada',
      summary,
      conflictExamples,
      defaultPassword,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const { schoolId, role: requesterRole } = req.user;
  const { name, username, email, phone, role, status, password, assignedStoreId, documentType, documentNumber, coordinationScope, assignedSubjects } = req.body;

    const user = await User.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'name is required' });
      }
      user.name = String(name).trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'username')) {
      if (!username || !String(username).trim()) {
        return res.status(400).json({ message: 'username is required' });
      }
      const normalizedUsername = String(username).toLowerCase().trim();
      const existing = await releaseDeletedInstitutionalUsername({ schoolId, username: normalizedUsername, excludedUserId: user._id });
      if (existing) {
        return res.status(409).json({ message: 'Username already registered' });
      }
      user.username = normalizedUsername;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
      user.phone = String(phone || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const normalizedEmail = normalizeEmail(email);
      if (normalizedEmail && !isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: 'Invalid email' });
      }
      user.email = normalizedEmail;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'documentType')) {
      if (String(documentType || '').trim() && !normalizeDocumentType(documentType)) {
        return res.status(400).json({ message: 'Invalid document type' });
      }
      user.documentType = normalizeDocumentType(documentType);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'documentNumber')) {
      const normalizedDocumentNumber = normalizeDocumentNumber(documentNumber);
      if (String(documentNumber || '').trim() && normalizedDocumentNumber.length < 5) {
        return res.status(400).json({ message: 'Invalid document number' });
      }
      user.documentNumber = normalizedDocumentNumber;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'role')) {
      if (!ADMIN_MANAGED_USER_ROLES.includes(String(role))) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      user.role = String(role);
    }

    const targetRole = Object.prototype.hasOwnProperty.call(req.body, 'role') ? String(role) : String(user.role);
    const normalizedCoordinationScope = normalizeCoordinationScope(coordinationScope);
    const normalizedAssignedSubjects = normalizeStringArray(assignedSubjects);

    if (targetRole === 'parent') {
      if (!user.email) {
        return res.status(400).json({ message: 'email is required for parent users' });
      }

      if (!user.documentType || String(user.documentNumber || '').length < 5) {
        return res.status(400).json({ message: 'documentType and documentNumber are required for parent users' });
      }
    }

    if (targetRole === 'vendor') {
      const nextAssignedStoreId = Object.prototype.hasOwnProperty.call(req.body, 'assignedStoreId')
        ? assignedStoreId
        : user.assignedStoreId;

      if (!nextAssignedStoreId) {
        return res.status(400).json({ message: 'assignedStoreId is required for vendor users' });
      }

      const store = await Store.findOne({ _id: nextAssignedStoreId, schoolId, deletedAt: null, status: 'active' }).select('_id');
      if (!store) {
        return res.status(400).json({ message: 'Assigned store not found or inactive' });
      }

      user.assignedStoreId = store._id;
    } else {
      user.assignedStoreId = null;
    }

    if (targetRole === 'coordination') {
      const nextCoordinationScope = Object.prototype.hasOwnProperty.call(req.body, 'coordinationScope')
        ? normalizedCoordinationScope
        : String(user.coordinationScope || '');

      if (!nextCoordinationScope) {
        return res.status(400).json({ message: 'coordinationScope is required for coordination users' });
      }

      user.coordinationScope = nextCoordinationScope;
    } else {
      user.coordinationScope = '';
    }

    if (targetRole === 'teacher') {
      user.assignedSubjects = Object.prototype.hasOwnProperty.call(req.body, 'assignedSubjects')
        ? normalizedAssignedSubjects
        : Array.isArray(user.assignedSubjects) ? user.assignedSubjects : [];
    } else {
      user.assignedSubjects = [];
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      if (!['active', 'inactive'].includes(String(status))) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      user.status = String(status);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'password') && String(password || '').trim()) {
      user.passwordHash = await bcrypt.hash(String(password), 10);
    }

    await user.save();

    return res.status(200).json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      role: user.role,
      coordinationScope: user.coordinationScope || '',
      assignedSubjects: Array.isArray(user.assignedSubjects) ? user.assignedSubjects : [],
      status: user.status,
      assignedStoreId: user.assignedStoreId || null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { schoolId, userId, role: requesterRole } = req.user;
    const user = await User.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (String(user._id) === String(userId)) {
      return res.status(400).json({ message: 'No puedes eliminar tu propio usuario admin' });
    }

    if (HARD_DELETE_USER_ROLES.includes(String(user.role))) {
      await User.deleteOne({ _id: user._id, schoolId });
      return res.status(200).json({ message: 'User deleted' });
    }

    user.deletedAt = new Date();
    user.status = 'inactive';
    user.deletionRequestedByUser = false;
    user.deletionRequestedAt = null;
    await user.save();

    return res.status(200).json({ message: 'User deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/deleted-accounts', async (req, res) => {
  try {
    const { schoolId } = req.user;

    const deletedParents = await User.find({
      schoolId,
      role: 'parent',
      deletionRequestedByUser: true,
      deletedAt: { $ne: null },
    })
      .select('_id name username email phone createdAt deletedAt deletionRequestedAt status deletionFeedback deletionFeedbackSubmittedAt')
      .sort({ deletedAt: -1, createdAt: -1 })
      .lean();

    if (deletedParents.length === 0) {
      return res.status(200).json([]);
    }

    const parentIds = deletedParents.map((parent) => parent._id);
    const links = await ParentStudentLink.find({ schoolId, parentId: { $in: parentIds } })
      .populate('studentId', 'name schoolCode grade status deletedAt createdAt')
      .lean();

    const studentIds = Array.from(
      new Set(
        links
          .map((link) => link?.studentId?._id)
          .filter(Boolean)
          .map((id) => String(id))
      )
    ).map((id) => new mongoose.Types.ObjectId(id));

    const [orderSummaries, rechargeSummaries] = await Promise.all([
      studentIds.length > 0
        ? Order.aggregate([
          { $match: { schoolId, studentId: { $in: studentIds } } },
          {
            $group: {
              _id: '$studentId',
              count: { $sum: 1 },
              totalAmount: { $sum: '$total' },
              lastAt: { $max: '$createdAt' },
            },
          },
        ])
        : [],
      studentIds.length > 0
        ? WalletTransaction.aggregate([
          {
            $match: {
              schoolId,
              studentId: { $in: studentIds },
              type: 'recharge',
              amount: { $gt: 0 },
            },
          },
          {
            $group: {
              _id: '$studentId',
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' },
              lastAt: { $max: '$createdAt' },
            },
          },
        ])
        : [],
    ]);

    const orderSummaryByStudentId = new Map(orderSummaries.map((item) => [String(item._id), item]));
    const rechargeSummaryByStudentId = new Map(rechargeSummaries.map((item) => [String(item._id), item]));

    const studentsByParentId = links.reduce((accumulator, link) => {
      const parentId = String(link.parentId || '');
      const student = link.studentId;
      if (!parentId || !student?._id) {
        return accumulator;
      }

      const studentId = String(student._id);
      const orderSummary = orderSummaryByStudentId.get(studentId) || null;
      const rechargeSummary = rechargeSummaryByStudentId.get(studentId) || null;

      if (!accumulator[parentId]) {
        accumulator[parentId] = [];
      }

      accumulator[parentId].push({
        _id: student._id,
        name: student.name || 'Alumno',
        schoolCode: student.schoolCode || '',
        grade: student.grade || '',
        status: student.status || 'inactive',
        deletedAt: student.deletedAt || null,
        linkedStatus: link.status || 'active',
        createdAt: student.createdAt || null,
        orderCount: Number(orderSummary?.count || 0),
        orderTotalAmount: Number(orderSummary?.totalAmount || 0),
        lastOrderAt: orderSummary?.lastAt || null,
        rechargeCount: Number(rechargeSummary?.count || 0),
        rechargeTotalAmount: Number(rechargeSummary?.totalAmount || 0),
        lastRechargeAt: rechargeSummary?.lastAt || null,
      });

      return accumulator;
    }, {});

    const response = deletedParents.map((parent) => {
      const students = (studentsByParentId[String(parent._id)] || []).sort((left, right) =>
        String(left.name || '').localeCompare(String(right.name || ''), 'es')
      );

      return {
        ...parent,
        students,
        studentCount: students.length,
        orderCountTotal: students.reduce((sum, student) => sum + Number(student.orderCount || 0), 0),
        orderTotalAmount: students.reduce((sum, student) => sum + Number(student.orderTotalAmount || 0), 0),
        rechargeCountTotal: students.reduce((sum, student) => sum + Number(student.rechargeCount || 0), 0),
        rechargeTotalAmount: students.reduce((sum, student) => sum + Number(student.rechargeTotalAmount || 0), 0),
      };
    });

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/deleted-accounts/:parentId/students/:studentId/orders', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const parentId = toObjectIdOrNull(req.params.parentId);
    const studentId = toObjectIdOrNull(req.params.studentId);

    if (!parentId || !studentId) {
      return res.status(400).json({ message: 'parentId or studentId is invalid' });
    }

    const deletedParent = await User.findOne({
      _id: parentId,
      schoolId,
      role: 'parent',
      deletionRequestedByUser: true,
      deletedAt: { $ne: null },
    }).select('_id');

    if (!deletedParent) {
      return res.status(404).json({ message: 'Deleted parent account not found' });
    }

    const link = await ParentStudentLink.findOne({ schoolId, parentId, studentId }).select('_id');
    if (!link) {
      return res.status(404).json({ message: 'Linked student not found for this deleted account' });
    }

    const orders = await Order.find({ schoolId, studentId })
      .populate('storeId', 'name')
      .populate('vendorId', 'name username')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(
      orders.map((order) => ({
        ...order,
        storeName: order.storeId?.name || '',
        vendorName: order.vendorId?.name || order.vendorId?.username || '',
        storeId: order.storeId?._id || order.storeId || null,
        vendorId: order.vendorId?._id || order.vendorId || null,
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/deleted-accounts/:parentId/students/:studentId/recharges', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const parentId = toObjectIdOrNull(req.params.parentId);
    const studentId = toObjectIdOrNull(req.params.studentId);

    if (!parentId || !studentId) {
      return res.status(400).json({ message: 'parentId or studentId is invalid' });
    }

    const deletedParent = await User.findOne({
      _id: parentId,
      schoolId,
      role: 'parent',
      deletionRequestedByUser: true,
      deletedAt: { $ne: null },
    }).select('_id');

    if (!deletedParent) {
      return res.status(404).json({ message: 'Deleted parent account not found' });
    }

    const link = await ParentStudentLink.findOne({ schoolId, parentId, studentId }).select('_id');
    if (!link) {
      return res.status(404).json({ message: 'Linked student not found for this deleted account' });
    }

    const recharges = await WalletTransaction.find({
      schoolId,
      studentId,
      type: 'recharge',
      amount: { $gt: 0 },
    })
      .populate('createdBy', 'name username role')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(
      recharges.map((item) => ({
        ...item,
        createdByName: item.createdBy?.name || item.createdBy?.username || '',
        createdByRole: item.createdBy?.role || '',
        createdBy: item.createdBy?._id || item.createdBy || null,
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/deleted-accounts/:parentId/permanent', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const parentId = toObjectIdOrNull(req.params.parentId);

    if (!parentId) {
      return res.status(400).json({ message: 'parentId is invalid' });
    }

    const deletedParent = await User.findOne({
      _id: parentId,
      schoolId,
      role: 'parent',
      deletionRequestedByUser: true,
      deletedAt: { $ne: null },
    }).select('_id');

    if (!deletedParent) {
      return res.status(404).json({ message: 'Deleted parent account not found' });
    }

    const parentLinks = await ParentStudentLink.find({ schoolId, parentId }).select('studentId').lean();
    const studentIds = Array.from(new Set(parentLinks.map((link) => String(link.studentId || '')).filter(Boolean))).map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    if (studentIds.length > 0) {
      const otherParentLinks = await ParentStudentLink.find({
        schoolId,
        studentId: { $in: studentIds },
        parentId: { $ne: parentId },
      })
        .populate('studentId', 'name schoolCode grade')
        .lean();

      if (otherParentLinks.length > 0) {
        return res.status(409).json({
          message: 'No se puede eliminar definitivamente porque uno o más alumnos siguen vinculados a otro acudiente.',
          sharedStudents: otherParentLinks.map((link) => ({
            _id: link.studentId?._id || null,
            name: link.studentId?.name || 'Alumno',
            schoolCode: link.studentId?.schoolCode || '',
            grade: link.studentId?.grade || '',
          })),
        });
      }
    }

    const results = await Promise.all([
      DeviceToken.deleteMany({ schoolId, userId: parentId }),
      ParentPaymentMethod.deleteMany({ schoolId, parentUserId: parentId }),
      PaymentTransaction.deleteMany({ schoolId, parentId }),
      Notification.deleteMany({ schoolId, parentId }),
      PasswordResetCode.deleteMany({ schoolId, userId: parentId }),
      MeriendaSubscription.deleteMany({ schoolId, parentUserId: parentId }),
      MeriendaWaitlist.deleteMany({ schoolId, parentUserId: parentId }),
      MeriendaFailedPayment.deleteMany({ schoolId, parentUserId: parentId }),
      ParentStudentLink.deleteMany({ schoolId, parentId }),
      studentIds.length > 0 ? Order.deleteMany({ schoolId, studentId: { $in: studentIds } }) : { deletedCount: 0 },
      studentIds.length > 0 ? WalletTransaction.deleteMany({ schoolId, studentId: { $in: studentIds } }) : { deletedCount: 0 },
      studentIds.length > 0 ? WalletTopupRequest.deleteMany({ schoolId, studentId: { $in: studentIds } }) : { deletedCount: 0 },
      studentIds.length > 0 ? PaymentTransaction.deleteMany({ schoolId, studentId: { $in: studentIds } }) : { deletedCount: 0 },
      studentIds.length > 0 ? Notification.deleteMany({ schoolId, studentId: { $in: studentIds } }) : { deletedCount: 0 },
      studentIds.length > 0 ? Wallet.deleteMany({ schoolId, studentId: { $in: studentIds } }) : { deletedCount: 0 },
      studentIds.length > 0 ? Student.deleteMany({ schoolId, _id: { $in: studentIds } }) : { deletedCount: 0 },
      User.deleteOne({ schoolId, _id: parentId }),
    ]);

    return res.status(200).json({
      message: 'Cuenta eliminada definitivamente de MongoDB.',
      summary: {
        deletedParentCount: Number(results[16]?.deletedCount || 0),
        deletedStudentCount: Number(results[15]?.deletedCount || 0),
        deletedOrderCount: Number(results[9]?.deletedCount || 0),
        deletedRechargeCount: Number(results[10]?.deletedCount || 0),
        deletedRechargeRequestCount: Number(results[11]?.deletedCount || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/students', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      name,
      schoolCode = '',
      grade = '',
      course = '',
      dailyLimit = 0,
      blockedProducts = [],
      blockedCategories = [],
      parentId = null,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const student = await Student.create({
      schoolId,
      name: String(name).trim(),
      schoolCode: String(schoolCode || '').trim(),
      grade: String(grade || '').trim(),
      course: String(course || '').trim(),
      dailyLimit: Number(dailyLimit || 0),
      blockedProducts,
      blockedCategories,
      status: 'active',
    });

    await Wallet.create({
      schoolId,
      studentId: student._id,
      balance: 0,
    });

    if (parentId) {
      await ParentStudentLink.findOneAndUpdate(
        { schoolId, parentId, studentId: student._id },
        { schoolId, parentId, studentId: student._id, relationship: 'parent', status: 'active' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    try {
      await upsertStudentAccount({ schoolId, student });
    } catch (accountError) {
      console.warn('[STUDENT_ACCOUNT_UPSERT_ERROR]', accountError?.message || accountError);
    }

    return res.status(201).json(student);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/students/import-legacy', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { rows = [], mode = 'set' } = req.body || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'rows is required and must be a non-empty array' });
    }

    if (rows.length > 20000) {
      return res.status(400).json({ message: 'rows limit exceeded (max 20000)' });
    }

    const normalizedMode = String(mode || 'set').toLowerCase();
    if (!['set', 'increment'].includes(normalizedMode)) {
      return res.status(400).json({ message: 'Invalid mode. Use set or increment' });
    }

    const summary = {
      totalRows: rows.length,
      createdStudents: 0,
      updatedStudents: 0,
      createdWallets: 0,
      updatedWallets: 0,
      skippedRows: 0,
      duplicateNameRows: 0,
      errors: 0,
    };

    const duplicateExamples = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};

      try {
        const name = normalizeLegacyName(
          pickLegacyValue(row, ['name', 'alumno', 'nombre', 'nombrealumno', 'student', 'studentname'])
        );
        const grade = String(
          pickLegacyValue(row, ['grade', 'curso', 'grado']) || ''
        ).trim();
        const balance = parseLegacyBalance(
          pickLegacyValue(row, [
            'balance',
            'saldo',
            'saldoencreditos',
            'saldoencredito',
            'saldoencuenta',
            'creditos',
            'saldocreditos',
          ])
        );

        if (!name) {
          summary.skippedRows += 1;
          continue;
        }

        const matches = await Student.find({
          schoolId,
          deletedAt: null,
          name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
        })
          .select('_id name')
          .lean();

        if (matches.length > 1) {
          summary.duplicateNameRows += 1;
          summary.skippedRows += 1;
          if (duplicateExamples.length < 20) {
            duplicateExamples.push({ row: index + 1, name });
          }
          continue;
        }

        let student = null;

        if (matches.length === 1) {
          student = await Student.findOneAndUpdate(
            { _id: matches[0]._id, schoolId, deletedAt: null },
            {
              $set: {
                grade,
                status: 'active',
              },
            },
            { new: true }
          );
          summary.updatedStudents += 1;
        } else {
          student = await Student.create({
            schoolId,
            name,
            schoolCode: '',
            grade,
            dailyLimit: 0,
            blockedProducts: [],
            blockedCategories: [],
            status: 'active',
          });
          summary.createdStudents += 1;
        }

        const wallet = await Wallet.findOne({ schoolId, studentId: student._id });
        if (!wallet) {
          await Wallet.create({
            schoolId,
            studentId: student._id,
            balance,
            status: 'active',
          });
          summary.createdWallets += 1;
        } else {
          const nextBalance = normalizedMode === 'increment'
            ? Number(wallet.balance || 0) + Number(balance || 0)
            : Number(balance || 0);

          wallet.balance = nextBalance;
          wallet.status = 'active';
          await wallet.save();
          summary.updatedWallets += 1;
        }
      } catch (rowError) {
        summary.errors += 1;
      }
    }

    return res.status(200).json({
      message: 'Migracion completada',
      summary,
      duplicateExamples,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/students/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      name,
      schoolCode,
      grade,
      course,
      dailyLimit,
      status,
      blockedProducts,
      blockedCategories,
      parentId,
    } = req.body;

    const student = await Student.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'name is required' });
      }
      student.name = String(name).trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'schoolCode')) {
      student.schoolCode = String(schoolCode || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'grade')) {
      student.grade = String(grade || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'course')) {
      student.course = String(course || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'dailyLimit')) {
      student.dailyLimit = Number(dailyLimit || 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      if (!['active', 'inactive'].includes(String(status))) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      student.status = String(status);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'blockedProducts')) {
      student.blockedProducts = Array.isArray(blockedProducts) ? blockedProducts : [];
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'blockedCategories')) {
      student.blockedCategories = Array.isArray(blockedCategories) ? blockedCategories : [];
    }

    await student.save();
    if (
      Object.prototype.hasOwnProperty.call(req.body, 'grade')
      || Object.prototype.hasOwnProperty.call(req.body, 'course')
    ) {
      await ensureStudentCohortMembership(student, schoolId);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'parentId')) {
      if (parentId) {
        const parent = await User.findOne({ _id: parentId, schoolId, role: 'parent', deletedAt: null });
        if (!parent) {
          return res.status(404).json({ message: 'Parent not found' });
        }

        await ParentStudentLink.findOneAndUpdate(
          { schoolId, parentId, studentId: student._id },
          { schoolId, parentId, studentId: student._id, relationship: 'parent', status: 'active' },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        await ParentStudentLink.updateMany(
          { schoolId, studentId: student._id, status: 'active' },
          { status: 'inactive' }
        );
      }
    }

    return res.status(200).json(student);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/students/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const student = await Student.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.deletedAt = new Date();
    student.status = 'inactive';
    await student.save();

    await ParentStudentLink.updateMany(
      { schoolId, studentId: student._id, status: 'active' },
      { status: 'inactive' }
    );

    return res.status(200).json({ message: 'Student deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/products', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      name,
      categoryId,
      price,
      cost = 0,
      stock = 0,
      initialStockStoreId = '',
      initialStockStoreIds = [],
      createInAllStores = false,
      inventoryAlertStock = 10,
      imageUrl = '',
      thumbUrl = '',
      shortDescription = '',
      tags = [],
      status = 'active',
      supplierId = null,
    } = req.body;

    if (!name || !categoryId || Number(price) < 0) {
      return res.status(400).json({ message: 'name, categoryId and valid price are required' });
    }

    if (Number(cost) < 0 || Number(stock) < 0 || Number(inventoryAlertStock) < 0) {
      return res.status(400).json({ message: 'Invalid cost, stock or inventoryAlertStock' });
    }

    const stores = await Store.find({ schoolId, deletedAt: null }).select('_id').lean();
    if (stores.length === 0) {
      return res.status(400).json({ message: 'No stores available to create the product' });
    }

    const initialStockValue = Number(stock || 0);
    const normalizedSupplierIdText = String(supplierId || '').trim();
    let supplierRecord = null;
    if (normalizedSupplierIdText) {
      if (!mongoose.Types.ObjectId.isValid(normalizedSupplierIdText)) {
        return res.status(400).json({ message: 'Invalid supplierId' });
      }

      supplierRecord = await Supplier.findOne({
        _id: normalizedSupplierIdText,
        schoolId,
        deletedAt: null,
      }).select('_id').lean();

      if (!supplierRecord) {
        return res.status(404).json({ message: 'Supplier not found' });
      }
    }

    const validStoreIds = new Set(stores.map((store) => String(store._id)));
    const legacyStoreId = String(initialStockStoreId || '').trim();
    const normalizedStoreIds = Array.isArray(initialStockStoreIds)
      ? Array.from(new Set(initialStockStoreIds.map((id) => String(id || '').trim()).filter(Boolean)))
      : [];

    const shouldCreateInAllStores =
      createInAllStores === true ||
      normalizedStoreIds.includes('all') ||
      normalizedStoreIds.includes('__all__');

    let selectedStoreIds;
    if (shouldCreateInAllStores) {
      selectedStoreIds = Array.from(validStoreIds);
    } else if (normalizedStoreIds.length > 0) {
      selectedStoreIds = normalizedStoreIds;
    } else if (legacyStoreId) {
      selectedStoreIds = [legacyStoreId];
    } else if (stores.length === 1) {
      selectedStoreIds = [String(stores[0]._id)];
    } else {
      selectedStoreIds = [];
    }

    if (selectedStoreIds.some((id) => !validStoreIds.has(id))) {
      return res.status(400).json({ message: 'Invalid initial stock destination store' });
    }

    if (selectedStoreIds.length === 0) {
      return res.status(400).json({ message: 'Selecciona al menos una tienda para crear el producto' });
    }

    const normalizedName = normalizeProductName(name);
    const existingLogicalProduct = await Product.findOne({
      schoolId,
      categoryId,
      deletedAt: null,
      name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
      .select('_id sharedProductId')
      .lean();

    const sharedProductId = String(existingLogicalProduct?.sharedProductId || existingLogicalProduct?._id || new mongoose.Types.ObjectId());

    const basePayload = {
      schoolId,
      name: String(name).trim(),
      sharedProductId,
      categoryId,
      price: Number(price),
      cost: Number(cost || 0),
      inventoryAlertStock: Number(inventoryAlertStock ?? 10),
      imageUrl: validateIncomingImageUrl(imageUrl),
      thumbUrl: validateIncomingImageUrl(thumbUrl) || deriveThumbUrlFromImageUrl(imageUrl),
      shortDescription: String(shortDescription || '').trim(),
      tags,
      status,
    };

    const existingInSelectedStores = await Product.find({
      schoolId,
      categoryId,
      storeId: { $in: selectedStoreIds },
      deletedAt: null,
      name: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
      .select('_id storeId')
      .lean();

    const existingStoreIds = new Set(existingInSelectedStores.map((item) => String(item.storeId)));
    const missingStoreIds = selectedStoreIds.filter((storeId) => !existingStoreIds.has(String(storeId)));

    const productsPayload = missingStoreIds.map((storeId) => ({
      ...basePayload,
      storeId,
      stock: initialStockValue,
    }));

    let createdProducts = [];
    if (productsPayload.length > 0) {
      createdProducts = await Product.insertMany(productsPayload);
    }

    if (supplierRecord) {
      const supplierProductIds = [
        ...createdProducts.map((product) => product._id),
        ...existingInSelectedStores.map((product) => product._id),
      ];

      if (supplierProductIds.length > 0) {
        await Supplier.updateOne(
          { _id: supplierRecord._id, schoolId, deletedAt: null },
          { $addToSet: { productIds: { $each: supplierProductIds } } }
        );
      }
    }

    // Keep sharedProductId aligned across existing same logical products.
    await Product.updateMany(
      {
        schoolId,
        categoryId,
        deletedAt: null,
        name: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      },
      { $set: { sharedProductId } }
    );

    await invalidateSchoolMenuCache(schoolId);

    return res.status(201).json({
      createdCount: createdProducts.length,
      skippedCount: existingStoreIds.size,
      sharedProductId,
      products: createdProducts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/products/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      name,
      categoryId,
      storeId,
      price,
      cost,
      stock,
      inventoryAlertStock,
      imageUrl,
      thumbUrl,
      shortDescription,
      status,
      tags,
    } = req.body;

    const product = await Product.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: 'name is required' });
      }
      product.name = String(name).trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'categoryId')) {
      product.categoryId = categoryId;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'storeId')) {
      product.storeId = storeId;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'price')) {
      if (Number(price) < 0) {
        return res.status(400).json({ message: 'Invalid price' });
      }
      product.price = Number(price);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'cost')) {
      if (Number(cost) < 0) {
        return res.status(400).json({ message: 'Invalid cost' });
      }
      product.cost = Number(cost);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'stock')) {
      if (Number(stock) < 0) {
        return res.status(400).json({ message: 'Invalid stock' });
      }
      product.stock = Number(stock);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'inventoryAlertStock')) {
      if (Number(inventoryAlertStock) < 0) {
        return res.status(400).json({ message: 'Invalid inventoryAlertStock' });
      }
      product.inventoryAlertStock = Number(inventoryAlertStock);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'imageUrl')) {
      product.imageUrl = validateIncomingImageUrl(imageUrl);
      if (!Object.prototype.hasOwnProperty.call(req.body, 'thumbUrl')) {
        product.thumbUrl = deriveThumbUrlFromImageUrl(imageUrl);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'thumbUrl')) {
      product.thumbUrl = validateIncomingImageUrl(thumbUrl);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'shortDescription')) {
      product.shortDescription = String(shortDescription || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      if (!['active', 'inactive'].includes(String(status))) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      product.status = String(status);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'tags')) {
      product.tags = Array.isArray(tags) ? tags : [];
    }

    await product.save();
    await invalidateSchoolMenuCache(schoolId);
    return res.status(200).json(product);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const product = await Product.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.deletedAt = new Date();
    product.status = 'inactive';
    await product.save();
    await invalidateSchoolMenuCache(schoolId);

    return res.status(200).json({ message: 'Product deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/links', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const links = await ParentStudentLink.find({ schoolId, status: 'active' })
      .populate('parentId', 'name username')
      .populate('studentId', 'name schoolCode')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(links);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/links', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { parentId, studentId, relationship = 'parent' } = req.body;

    if (!parentId || !studentId) {
      return res.status(400).json({ message: 'parentId and studentId are required' });
    }

    const parent = await User.findOne({ _id: parentId, schoolId, role: 'parent', deletedAt: null });
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const link = await ParentStudentLink.findOneAndUpdate(
      { schoolId, parentId, studentId },
      { schoolId, parentId, studentId, relationship, status: 'active' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .populate('parentId', 'name username')
      .populate('studentId', 'name schoolCode');

    return res.status(200).json(link);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
