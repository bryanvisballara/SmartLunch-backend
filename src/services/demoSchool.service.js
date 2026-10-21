const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  mongoose,
  connectDB,
  deleteSchoolTenant,
  getRegisteredModelNames,
  resolveRegisteredModel,
  resolveSchoolDbName,
  runWithSchoolContext,
  shouldUseControlDbForSchool,
  slugifySchoolId,
} = require('../config/db');
const DemoLead = require('../models/demoLead.model');
const DemoScheduledPush = require('../models/demoScheduledPush.model');
const { processStoredCampusMaterialFiles } = require('../utils/campusMaterialUpload');
const { buildWelcomeImage, buildPensionImage, buildActivityImage } = require('./demoFeedImages.service');
const { sendDemoWelcomeEmail } = require('./demoEmails.service');

fs.readdirSync(path.join(__dirname, '../models'))
  .filter((file) => file.endsWith('.model.js'))
  .forEach((file) => require(path.join('../models', file)));

const { ObjectId } = mongoose.Types;

const DEMO_SCHOOL_PREFIX = 'demo_';
const DEMO_LIFETIME_DAYS = Number(process.env.DEMO_SCHOOL_LIFETIME_DAYS || 7);
const TEMPLATE_SCHOOL_ID = String(process.env.DEMO_TEMPLATE_SCHOOL_ID || 'comergio_demo_kns8p').trim();
const TEMPLATE_STUDENT_NAMES = {
  kinder: String(process.env.DEMO_TEMPLATE_KINDER_STUDENT || 'allison visbal sequera').trim(),
  first: String(process.env.DEMO_TEMPLATE_FIRST_GRADE_STUDENT || 'oliver visbal sequera').trim(),
};
const TEMPLATE_LABELS = { kinder: 'Kinder 3', first: '1B' };
const CLASSMATE_CODE_PATTERN = /^DEMO-/i;
const STAFF_EXCLUDED_ROLES = ['parent', 'student', 'super_admin'];
const PUSH_DELAYS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

const SCHOOL_LEVEL_COLLECTIONS = [
  'academicfeeconfigurations',
  'academiccalendarassignments',
  'campuscoexistencepolicies',
  'campuscourses',
  'campusposts',
  'categories',
  'products',
  'stores',
  'hrpurchaseareas',
  'hrsupplyitems',
  'hrplannercycles',
  'academiccommunicationauthors',
];

const PER_STUDENT_COLLECTIONS = [
  'academiccharges',
  'academicchargepayments',
  'campusgradeentries',
  'nursingvisits',
  'psychologycases',
  'studentmedicalprofilerevisions',
  'studentbillingprofiles',
  'wallets',
  'wallettransactions',
];

function isDemoSchoolId(schoolId) {
  return String(schoolId || '').trim().startsWith(DEMO_SCHOOL_PREFIX);
}

function buildDemoSchoolId(schoolName) {
  const slug = slugifySchoolId(schoolName).slice(0, 32).replace(/_+$/g, '') || 'colegio';
  const suffix = crypto.randomBytes(3).toString('hex').slice(0, 5);
  return `${DEMO_SCHOOL_PREFIX}${slug}_${suffix}`;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || '', lastName: '' };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }
  return { firstName: parts.slice(0, parts.length - 2).join(' '), lastName: parts.slice(-2).join(' ') };
}

function isObjectIdLike(value) {
  return value instanceof ObjectId || value?._bsontype === 'ObjectId';
}

function transformDeep(value, { idMap, textReplacements }) {
  if (value == null) {
    return value;
  }
  if (isObjectIdLike(value)) {
    const mapped = idMap.get(String(value));
    return mapped ? new ObjectId(mapped) : value;
  }
  if (value instanceof Date || Buffer.isBuffer(value) || value?._bsontype === 'Binary') {
    return value;
  }
  if (typeof value === 'string') {
    if (idMap.has(value)) {
      return idMap.get(value);
    }
    return textReplacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformDeep(item, { idMap, textReplacements }));
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'signatureImage') {
        output[key] = '';
        continue;
      }
      output[key] = transformDeep(item, { idMap, textReplacements });
    }
    return output;
  }
  return value;
}

function getRawDb(schoolId) {
  return mongoose.connection.client.db(resolveSchoolDbName(schoolId));
}

async function insertMany(db, collectionName, docs) {
  if (!docs.length) {
    return 0;
  }
  await db.collection(collectionName).insertMany(docs, { ordered: false });
  return docs.length;
}

function matchesTemplateCourse(targets, templateKey) {
  const normalized = (targets || []).map((target) => String(target || '').trim().toLowerCase());
  if (templateKey === 'kinder') {
    return normalized.some((target) => target.includes('kinder'));
  }
  return normalized.some((target) => target === '1' || target.startsWith('1:') || /(^|[^0-9])1b\b/.test(target));
}

async function loadTemplate(sourceDb) {
  const templateStudents = {};
  for (const [key, name] of Object.entries(TEMPLATE_STUDENT_NAMES)) {
    const student = await sourceDb.collection('students').findOne({
      schoolId: TEMPLATE_SCHOOL_ID,
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    });
    if (!student) {
      throw new Error(`No se encontró el estudiante plantilla "${name}" en ${TEMPLATE_SCHOOL_ID}.`);
    }
    const links = await sourceDb.collection('parentstudentlinks').find({ studentId: student._id }).toArray();
    const parentIds = links.map((link) => String(link.parentId));
    const parents = parentIds.length
      ? await sourceDb.collection('users').find({ _id: { $in: links.map((link) => link.parentId) } }).project({ name: 1 }).toArray()
      : [];
    templateStudents[key] = { student, parentIds, parentNames: parents.map((parent) => parent.name).filter(Boolean) };
  }
  return templateStudents;
}

async function copySchoolLevelData({ sourceDb, targetDb, schoolId, schoolName }) {
  const retag = (doc) => ({ ...doc, schoolId });

  const structure = await sourceDb.collection('academicstructures').findOne({ schoolId: TEMPLATE_SCHOOL_ID });
  if (!structure) {
    throw new Error('El colegio plantilla no tiene estructura académica.');
  }
  await targetDb.collection('academicstructures').insertOne({ ...retag(structure), schoolName });

  const snapshot = await sourceDb.collection('schoolcreationsnapshots').findOne({ schoolId: TEMPLATE_SCHOOL_ID });
  await targetDb.collection('schoolcreationsnapshots').insertOne({
    ...(snapshot ? retag(snapshot) : { _id: new ObjectId(), schoolId }),
    schoolName,
    payload: snapshot?.payload ? { ...snapshot.payload, schoolName } : { schoolName },
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const settings = await sourceDb.collection('superadminschoolsettings').findOne({ schoolId: TEMPLATE_SCHOOL_ID });
  if (settings) {
    await targetDb.collection('superadminschoolsettings').insertOne({
      ...retag(settings),
      notes: 'Colegio demo creado desde la landing.',
      pricePerStudent: 0,
      billingParty: { ...(settings.billingParty || {}), legalName: schoolName, nit: '', dv: '', email: '', phone: '' },
      updatedBy: 'demo',
      updatedAt: new Date(),
    });
  }

  for (const collectionName of SCHOOL_LEVEL_COLLECTIONS) {
    const docs = await sourceDb.collection(collectionName).find({ schoolId: TEMPLATE_SCHOOL_ID }).toArray();
    await insertMany(targetDb, collectionName, docs.map(retag));
  }

  const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(18).toString('hex'), 10);
  const staff = await sourceDb.collection('users').find({
    schoolId: TEMPLATE_SCHOOL_ID,
    role: { $nin: STAFF_EXCLUDED_ROLES },
    deletedAt: null,
  }).toArray();
  await insertMany(targetDb, 'users', staff.map((user) => ({
    ...retag(user),
    email: '',
    passwordHash: randomPasswordHash,
    accessPassword: '',
    authSessions: [],
    webauthn: { registrationChallenge: null, authenticationChallenge: null, credentials: [] },
  })));
  const staffIds = new Set(staff.map((user) => String(user._id)));

  const memberships = await sourceDb.collection('campusmemberships').find({ schoolId: TEMPLATE_SCHOOL_ID }).toArray();
  await insertMany(
    targetDb,
    'campusmemberships',
    memberships.filter((membership) => staffIds.has(String(membership.userId))).map(retag),
  );

  const classmates = await sourceDb.collection('students').find({
    schoolId: TEMPLATE_SCHOOL_ID,
    schoolCode: CLASSMATE_CODE_PATTERN,
  }).toArray();
  await insertMany(targetDb, 'students', classmates.map((student) => ({ ...retag(student), userId: null })));
  const classmateIds = new Set(classmates.map((student) => String(student._id)));

  const classmateGrades = await sourceDb.collection('campusgradeentries').find({
    schoolId: TEMPLATE_SCHOOL_ID,
    studentId: { $in: classmates.map((student) => student._id) },
  }).toArray();
  await insertMany(targetDb, 'campusgradeentries', classmateGrades.map(retag));

  return { staff, classmateIds };
}

async function cloneTemplateChild({
  sourceDb,
  targetDb,
  schoolId,
  template,
  childName,
  childIndex,
  parentUserId,
  contactName,
  contactPhone,
}) {
  const sourceStudent = template.student;
  const newStudentId = new ObjectId();
  const idMap = new Map([[String(sourceStudent._id), String(newStudentId)]]);
  template.parentIds.forEach((parentId) => idMap.set(parentId, String(parentUserId)));

  const textReplacements = [
    [new RegExp(escapeRegex(sourceStudent.name), 'gi'), childName],
    ...template.parentNames.map((name) => [new RegExp(escapeRegex(name), 'gi'), contactName]),
  ];

  const perStudentDocs = {};
  for (const collectionName of PER_STUDENT_COLLECTIONS) {
    const docs = await sourceDb.collection(collectionName).find({
      schoolId: TEMPLATE_SCHOOL_ID,
      studentId: sourceStudent._id,
    }).toArray();
    docs.forEach((doc) => idMap.set(String(doc._id), String(new ObjectId())));
    perStudentDocs[collectionName] = docs;
  }

  for (const [collectionName, docs] of Object.entries(perStudentDocs)) {
    await insertMany(targetDb, collectionName, docs.map((doc) => ({
      ...transformDeep(doc, { idMap, textReplacements }),
      schoolId,
    })));
  }

  const { firstName, lastName } = splitName(childName);
  const studentDoc = transformDeep(sourceStudent, { idMap, textReplacements });
  await targetDb.collection('students').insertOne({
    ...studentDoc,
    _id: newStudentId,
    schoolId,
    userId: null,
    name: childName,
    firstName,
    lastName,
    schoolCode: `DEMO-H${childIndex + 1}`,
    documentNumber: String(1000000000 + Math.floor(Math.random() * 8999999999)),
    imageUrl: '',
    thumbUrl: '',
    medicalProfile: {
      ...(studentDoc.medicalProfile || {}),
      emergencyMedicalContactName: contactName,
      emergencyMedicalContactPhone: contactPhone,
      signatureImage: '',
      signedAt: null,
      signedByParentId: null,
      signedByParentName: '',
      medicationAuthorization: {
        ...(studentDoc.medicalProfile?.medicationAuthorization || {}),
        authorizedBy: contactName,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await targetDb.collection('parentstudentlinks').insertOne({
    _id: new ObjectId(),
    schoolId,
    parentId: parentUserId,
    studentId: newStudentId,
    relationship: 'parent',
    isPrimaryContact: true,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { studentId: newStudentId, sourceStudentId: sourceStudent._id };
}

async function attachChildrenToSharedDocs({ sourceDb, targetDb, schoolId, classmateIds, clonedChildren, childNamesById }) {
  const keepClassmateOrClone = (sourceStudentId) => classmateIds.has(String(sourceStudentId));
  const clonesBySource = new Map();
  clonedChildren.forEach((child) => {
    const key = String(child.sourceStudentId);
    clonesBySource.set(key, [...(clonesBySource.get(key) || []), child]);
  });

  const expand = (items, nameField) => items.flatMap((item) => {
    const sourceKey = String(item.studentId);
    if (clonesBySource.has(sourceKey)) {
      return clonesBySource.get(sourceKey).map((child) => ({
        ...item,
        _id: new ObjectId(),
        studentId: child.studentId,
        [nameField]: childNamesById.get(String(child.studentId)),
      }));
    }
    return keepClassmateOrClone(item.studentId) ? [item] : [];
  });

  const sessions = await sourceDb.collection('campusattendancesessions').find({ schoolId: TEMPLATE_SCHOOL_ID }).toArray();
  await insertMany(targetDb, 'campusattendancesessions', sessions.map((session) => ({
    ...session,
    schoolId,
    records: expand(session.records || [], 'studentNameSnapshot'),
  })));

  const routes = await sourceDb.collection('campusschoolroutes').find({ schoolId: TEMPLATE_SCHOOL_ID }).toArray();
  await insertMany(targetDb, 'campusschoolroutes', routes.map((route) => ({
    ...route,
    schoolId,
    stops: expand(route.stops || [], 'studentNameSnapshot').map((stop, index) => ({ ...stop, order: index + 1 })),
  })));
}

async function copyCourseCommunications({ sourceDb, targetDb, schoolId, parentUserId, templateKeysInUse }) {
  const communications = await sourceDb.collection('academiccommunications').find({
    schoolId: TEMPLATE_SCHOOL_ID,
    audienceType: 'course',
    sentAt: { $ne: null },
  }).toArray();

  const relevant = communications.filter((item) => (
    [...templateKeysInUse].some((key) => matchesTemplateCourse(item.courseTargets, key))
  ));

  await insertMany(targetDb, 'academiccommunications', relevant.map((item) => ({
    ...item,
    schoolId,
    recipientParentIds: [parentUserId],
    parentTargets: [],
    studentTargets: [],
    recipientStudentIds: [],
    likes: [],
    comments: [],
    deliverySummary: null,
  })));
}

async function uploadFeedImage({ schoolId, buffer, fileName, createdByUserId }) {
  const [stored] = await processStoredCampusMaterialFiles([{
    buffer,
    originalname: fileName,
    mimetype: 'image/jpeg',
    size: buffer.length,
  }], {
    folder: 'academic-communications',
    useDatabaseInProduction: true,
    schoolId,
    createdByUserId,
  });
  return stored?.url || '';
}

async function createDemoFeedPosts({ targetDb, schoolId, schoolName, parentUserId, staff }) {
  const secretary = staff.find((user) => user.role === 'academic_secretary')
    || staff.find((user) => user.role === 'rectoria')
    || staff[0];
  const billing = staff.find((user) => user.role === 'billing') || secretary;
  const teacher = staff.find((user) => user.role === 'teacher') || secretary;
  const defaultAuthor = await targetDb.collection('academiccommunicationauthors').findOne({ schoolId, isDefault: true });

  const [welcomeBuffer, pensionBuffer, activityBuffer] = await Promise.all([
    buildWelcomeImage(schoolName),
    buildPensionImage(),
    buildActivityImage(),
  ]);

  const [welcomeUrl, pensionUrl, activityUrl] = await runWithSchoolContext(schoolId, () => Promise.all([
    uploadFeedImage({ schoolId, buffer: welcomeBuffer, fileName: 'bienvenidos-nuevo-ano-escolar.jpg', createdByUserId: secretary?._id }),
    uploadFeedImage({ schoolId, buffer: pensionBuffer, fileName: 'paga-la-pension-en-un-boton.jpg', createdByUserId: billing?._id }),
    uploadFeedImage({ schoolId, buffer: activityBuffer, fileName: 'actividad-en-clase.jpg', createdByUserId: teacher?._id }),
  ]));

  const now = Date.now();
  const basePost = {
    schoolId,
    audienceType: 'general',
    gradeTargets: [],
    courseTargets: [],
    cohortKey: '',
    academicYear: '',
    authorStudentId: null,
    parentTargets: [],
    studentTargets: [],
    recipientParentIds: [parentUserId],
    recipientStudentIds: [],
    emailSubject: '',
    likes: [],
    comments: [],
    channels: { feed: true, push: false, email: false },
    deliverySummary: null,
    __v: 0,
  };
  const image = (src, alt) => [{ _id: new ObjectId(), kind: 'image', src, thumbUrl: src, alt }];

  const posts = [
    {
      ...basePost,
      _id: new ObjectId(),
      createdByUserId: secretary?._id,
      createdByName: secretary?.name || '',
      authorId: defaultAuthor?._id || null,
      authorName: defaultAuthor?.name || 'Secretaría académica',
      authorPhotoUrl: defaultAuthor?.photoUrl || '',
      authorThumbUrl: defaultAuthor?.thumbUrl || '',
      publisherRole: 'secretary',
      title: `${/^colegio\b/i.test(schoolName) ? 'Comunidad del' : 'Comunidad del colegio'} ${schoolName}, ¡bienvenidos a un nuevo año escolar!`,
      body: 'Iniciamos un nuevo año lleno de aprendizajes, retos y alegrías. Gracias por confiar en nosotros: este año estaremos más conectados que nunca con cada familia desde la app.',
      media: image(welcomeUrl, 'Familias llegando al colegio en el primer día de clases'),
      sentAt: new Date(now),
    },
    {
      ...basePost,
      _id: new ObjectId(),
      createdByUserId: billing?._id,
      createdByName: billing?.name || '',
      authorId: defaultAuthor?._id || null,
      authorName: defaultAuthor?.name || 'Cartera',
      authorPhotoUrl: defaultAuthor?.photoUrl || '',
      authorThumbUrl: defaultAuthor?.thumbUrl || '',
      publisherRole: 'secretary',
      title: 'Ahora paga más fácil la pensión del colegio, ¡presionando un solo botón!',
      body: 'Entra a Pagos, revisa la pensión pendiente y págala en segundos desde tu celular. Sin filas, sin transferencias y con tu comprobante al instante.',
      media: image(pensionUrl, 'Madre pagando la pensión desde su celular'),
      sentAt: new Date(now - 60 * 60 * 1000),
    },
    {
      ...basePost,
      _id: new ObjectId(),
      createdByUserId: teacher?._id,
      createdByName: teacher?.name || '',
      authorId: null,
      authorName: teacher?.name ? `${teacher.name} - Docente` : 'Docente',
      authorPhotoUrl: teacher?.campusPhotoUrl || '',
      authorThumbUrl: teacher?.campusPhotoThumbUrl || '',
      publisherRole: 'teacher',
      title: '¡Qué semana tan creativa!',
      body: 'Hoy los niños trabajaron en equipo en nuestra actividad de arte y ciencia. Se divirtieron muchísimo creando y descubriendo juntos. ¡Estamos muy orgullosos de ellos!',
      media: image(activityUrl, 'Niños felices haciendo una actividad en clase'),
      sentAt: new Date(now - 3 * 60 * 60 * 1000),
    },
  ].map((post) => ({ ...post, createdAt: post.sentAt, updatedAt: post.sentAt }));

  await insertMany(targetDb, 'academiccommunications', posts);
}

const CRITICAL_INDEX_MODELS = ['User', 'Student', 'ParentStudentLink', 'Wallet', 'AcademicCommunicationAsset'];

async function ensureTenantIndexes(schoolId) {
  for (const modelName of CRITICAL_INDEX_MODELS) {
    await resolveRegisteredModel(modelName, schoolId).createIndexes();
  }
  // Compiling the remaining models lets Mongoose build their indexes in the background.
  getRegisteredModelNames().forEach((modelName) => resolveRegisteredModel(modelName, schoolId));
}

async function createDemoSchool({
  schoolName,
  city,
  contactName,
  email,
  phone,
  password,
  children,
  requestIp = '',
}) {
  await connectDB();
  const normalizedSchoolName = String(schoolName || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedContactName = titleCase(contactName);
  const childNames = children.map((child) => titleCase(child)).filter(Boolean);
  const schoolId = buildDemoSchoolId(normalizedSchoolName);
  if (shouldUseControlDbForSchool(schoolId)) {
    throw new Error('No se pudo reservar la base de datos del colegio demo.');
  }

  const templateKeys = childNames.map((_name, index) => (index % 2 === 0 ? 'kinder' : 'first'));
  const lead = await DemoLead.create({
    schoolName: normalizedSchoolName,
    city: String(city || '').trim(),
    contactName: normalizedContactName,
    email: normalizedEmail,
    phone: String(phone || '').trim(),
    children: childNames.map((name, index) => ({ name, gradeLabel: TEMPLATE_LABELS[templateKeys[index]] })),
    demoSchoolId: schoolId,
    status: 'provisioning',
    requestIp,
    expiresAt: new Date(Date.now() + DEMO_LIFETIME_DAYS * 24 * 60 * 60 * 1000),
  });

  const sourceDb = getRawDb(TEMPLATE_SCHOOL_ID);
  const targetDb = getRawDb(schoolId);

  try {
    const templates = await loadTemplate(sourceDb);
    const { staff, classmateIds } = await copySchoolLevelData({
      sourceDb,
      targetDb,
      schoolId,
      schoolName: normalizedSchoolName,
    });

    if (staff.some((user) => String(user.username || '').toLowerCase() === normalizedEmail)) {
      const error = new Error('Ese correo ya está en uso dentro del colegio demo. Usa otro correo.');
      error.statusCode = 409;
      throw error;
    }

    const parentUserId = new ObjectId();
    await targetDb.collection('users').insertOne({
      _id: parentUserId,
      schoolId,
      name: normalizedContactName,
      username: normalizedEmail,
      email: normalizedEmail,
      phone: String(phone || '').trim(),
      address: '',
      documentType: '',
      documentNumber: '',
      campusPhotoUrl: '',
      campusPhotoThumbUrl: '',
      assignedStoreId: null,
      passwordHash: await bcrypt.hash(String(password).trim(), 10),
      accessPassword: '',
      role: 'parent',
      linkedStudentId: null,
      coordinationScope: '',
      assignedSubjects: [],
      status: 'active',
      deletedAt: null,
      authSessions: [],
      webauthn: { registrationChallenge: null, authenticationChallenge: null, credentials: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    });

    const clonedChildren = [];
    const childNamesById = new Map();
    for (const [index, childName] of childNames.entries()) {
      const cloned = await cloneTemplateChild({
        sourceDb,
        targetDb,
        schoolId,
        template: templates[templateKeys[index]],
        childName,
        childIndex: index,
        parentUserId,
        contactName: normalizedContactName,
        contactPhone: String(phone || '').trim(),
      });
      clonedChildren.push(cloned);
      childNamesById.set(String(cloned.studentId), childName);
    }

    await attachChildrenToSharedDocs({ sourceDb, targetDb, schoolId, classmateIds, clonedChildren, childNamesById });
    await copyCourseCommunications({
      sourceDb,
      targetDb,
      schoolId,
      parentUserId,
      templateKeysInUse: new Set(templateKeys),
    });
    await createDemoFeedPosts({ targetDb, schoolId, schoolName: normalizedSchoolName, parentUserId, staff });
    await ensureTenantIndexes(schoolId);

    lead.status = 'ready';
    lead.parentUserId = parentUserId;
    lead.children = lead.children.map((child, index) => ({
      name: child.name,
      gradeLabel: child.gradeLabel,
      studentId: clonedChildren[index]?.studentId || null,
    }));
    await lead.save();

    sendDemoWelcomeEmail({
      leadId: lead._id,
      email: normalizedEmail,
      contactName: normalizedContactName,
      schoolName: normalizedSchoolName,
      children: lead.children,
    })
      .then(() => DemoLead.updateOne({ _id: lead._id }, { $set: { welcomeEmailSentAt: new Date() } }))
      .catch((error) => console.warn(`[DEMO] welcome email failed lead=${lead._id}: ${error.message}`));

    return {
      leadId: lead._id,
      schoolId,
      schoolName: normalizedSchoolName,
      username: normalizedEmail,
      children: lead.children.map((child) => ({ name: child.name, gradeLabel: child.gradeLabel })),
    };
  } catch (error) {
    lead.status = 'failed';
    lead.errorMessage = String(error.message || error).slice(0, 500);
    await lead.save().catch(() => {});
    await targetDb.dropDatabase().catch(() => {});
    throw error;
  }
}

async function findDemoLeadBySchoolId(schoolId) {
  if (!isDemoSchoolId(schoolId)) {
    return null;
  }
  return DemoLead.findOne({ demoSchoolId: schoolId, status: 'ready' });
}

async function recordDemoLogin({ schoolId, userId }) {
  const lead = await findDemoLeadBySchoolId(schoolId);
  if (!lead || String(lead.parentUserId) !== String(userId)) {
    return;
  }
  const now = new Date();
  await DemoLead.updateOne(
    { _id: lead._id },
    {
      $set: { lastLoginAt: now, ...(lead.firstLoginAt ? {} : { firstLoginAt: now }) },
      $inc: { loginCount: 1 },
    },
  );
}

async function scheduleDemoWelcomePushes({ schoolId, userId }) {
  const lead = await findDemoLeadBySchoolId(schoolId);
  if (!lead || lead.pushesScheduledAt || String(lead.parentUserId) !== String(userId)) {
    return false;
  }

  const claimed = await DemoLead.findOneAndUpdate(
    { _id: lead._id, pushesScheduledAt: null },
    { $set: { pushesScheduledAt: new Date() } },
    { new: true },
  );
  if (!claimed) {
    return false;
  }

  const firstChild = claimed.children[0];
  const childFirstName = String(firstChild?.name || 'tu hijo').split(/\s+/)[0];
  const gradeEntry = firstChild?.studentId
    ? await runWithSchoolContext(schoolId, () => resolveRegisteredModel('CampusGradeEntry', schoolId)
      .findOne({ schoolId, studentId: firstChild.studentId, score: { $ne: null } })
      .sort({ score: -1, gradedAt: -1 })
      .lean())
    : null;
  const course = gradeEntry
    ? await runWithSchoolContext(schoolId, () => resolveRegisteredModel('CampusCourse', schoolId)
      .findOne({ _id: gradeEntry.courseId })
      .select('subject')
      .lean())
    : null;
  const subject = course?.subject || 'Matemáticas';
  const score = Number(gradeEntry?.score || 92);

  const now = Date.now();
  const messages = [
    {
      kind: 'pension',
      title: 'Recordatorio amable de pensión 💙',
      body: `Hola ${claimed.contactName.split(/\s+/)[0]}, la pensión de ${childFirstName} ya está disponible. Puedes pagarla en segundos con un solo botón desde Pagos.`,
      payload: { type: 'demo.pension_reminder', url: '/parent/finance' },
    },
    {
      kind: 'cafeteria',
      title: 'Recarga la cafetería de ' + childFirstName,
      body: `Asegura las meriendas de ${childFirstName} esta semana: recarga su cuenta de cafetería en un toque y define su tope diario.`,
      payload: { type: 'demo.cafeteria_topup', url: '/parent/cafeteria' },
    },
    {
      kind: 'grade',
      title: `Nueva calificación en ${subject}`,
      body: `${childFirstName} obtuvo ${score} en ${subject}. Revisa el detalle y los comentarios del docente en Académico.`,
      payload: { type: 'demo.new_grade', url: '/parent/academic' },
    },
  ];

  const existingKinds = await DemoScheduledPush.distinct('kind', {
    demoLeadId: claimed._id,
    status: { $in: ['pending', 'sent'] },
  });
  const toInsert = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => !existingKinds.includes(message.kind))
    .map(({ message, index }) => ({
      ...message,
      demoLeadId: claimed._id,
      schoolId,
      parentUserId: claimed.parentUserId,
      studentId: firstChild?.studentId || null,
      sendAt: new Date(now + PUSH_DELAYS_MS[index]),
    }));

  if (toInsert.length) {
    await DemoScheduledPush.insertMany(toInsert);
  }
  return true;
}

async function deleteDemo(leadId, { reason = 'deleted' } = {}) {
  const lead = await DemoLead.findById(leadId);
  if (!lead) {
    const error = new Error('Demo no encontrada');
    error.statusCode = 404;
    throw error;
  }
  if (lead.demoSchoolId && isDemoSchoolId(lead.demoSchoolId) && !['expired', 'deleted'].includes(lead.status)) {
    try {
      await deleteSchoolTenant(lead.demoSchoolId);
    } catch (error) {
      if (error.statusCode !== 404) {
        throw error;
      }
    }
  }
  await DemoScheduledPush.deleteMany({ demoLeadId: lead._id, status: 'pending' });
  lead.status = reason === 'expired' ? 'expired' : 'deleted';
  lead.deletedAt = new Date();
  await lead.save();
  return lead;
}

module.exports = {
  isDemoSchoolId,
  createDemoSchool,
  recordDemoLogin,
  scheduleDemoWelcomePushes,
  deleteDemo,
  DEMO_LIFETIME_DAYS,
};
