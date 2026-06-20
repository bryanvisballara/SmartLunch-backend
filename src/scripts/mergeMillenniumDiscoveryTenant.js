require('dotenv').config();

const mongoose = require('mongoose');
const {
  connectDB,
  deleteSchoolTenant,
  runWithSchoolContext,
} = require('../config/db');
require('../models');

const AcademicStructure = require('../models/academicStructure.model');
const { canonicalizeGradeFeeSettingsForStructure, normalizeText } = require('../utils/feeGradeMatching');
const { resolveSchoolYearDates } = require('../utils/academicFeeConfigurationBackfill');

const SOURCE_SCHOOL_ID = 'discovery_t3a0h';
const SOURCE_DB_NAME = 'discovery_t3a0h';
const TARGET_SCHOOL_ID = 'Millennium School';
const TARGET_DB_NAME = 'millennium_school';
const DRY_RUN = process.argv.includes('--dry-run');

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeUsername(value) {
  return normalizeText(value).toLowerCase();
}

function remapObjectId(value, idMap) {
  if (!value) {
    return value;
  }

  const mapped = idMap.get(String(value));
  return mapped || value;
}

function remapDocumentIds(document, fieldNames, idMap) {
  const nextDocument = { ...document };
  fieldNames.forEach((fieldName) => {
    if (nextDocument[fieldName]) {
      nextDocument[fieldName] = remapObjectId(nextDocument[fieldName], idMap);
    }
  });
  return nextDocument;
}

async function buildStudentIdMap(sourceDb, targetDb) {
  const sourceStudents = await sourceDb.collection('students').find({ deletedAt: null }).toArray();
  const targetStudents = await targetDb.collection('students').find({ deletedAt: null }).toArray();
  const targetByDocument = new Map();
  const targetByNameGrade = new Map();

  targetStudents.forEach((student) => {
    const documentNumber = normalizeText(student.documentNumber);
    if (documentNumber) {
      targetByDocument.set(documentNumber, student._id);
    }

    const nameGradeKey = `${normalizeText(student.name).toLowerCase()}::${normalizeText(student.grade).toLowerCase()}`;
    if (nameGradeKey !== '::') {
      targetByNameGrade.set(nameGradeKey, student._id);
    }
  });

  const studentIdMap = new Map();
  let unmatched = 0;

  let unmatchedStudents = [];

  sourceStudents.forEach((student) => {
    const documentNumber = normalizeText(student.documentNumber);
    const nameGradeKey = `${normalizeText(student.name).toLowerCase()}::${normalizeText(student.grade).toLowerCase()}`;
    const targetId = (documentNumber && targetByDocument.get(documentNumber))
      || targetByNameGrade.get(nameGradeKey);

    if (targetId) {
      studentIdMap.set(String(student._id), targetId);
    } else {
      unmatched += 1;
      unmatchedStudents.push(student);
    }
  });

  return { studentIdMap, unmatched, unmatchedStudents, sourceCount: sourceStudents.length, targetCount: targetStudents.length };
}

async function insertMissingStudents({ targetDb, unmatchedStudents, studentIdMap, session }) {
  if (!unmatchedStudents.length) {
    return { inserted: 0 };
  }

  if (DRY_RUN) {
    return { inserted: unmatchedStudents.length, dryRun: true };
  }

  let inserted = 0;
  for (const student of unmatchedStudents) {
    const sourceId = String(student._id);
    const nextStudent = { ...student, schoolId: TARGET_SCHOOL_ID };
    delete nextStudent._id;
    const result = await targetDb.collection('students').insertOne(nextStudent, { session });
    studentIdMap.set(sourceId, result.insertedId);
    inserted += 1;
  }

  return { inserted };
}

async function buildUserIdMap(sourceDb, targetDb) {
  const sourceUsers = await sourceDb.collection('users').find({ deletedAt: null }).toArray();
  const targetUsers = await targetDb.collection('users').find({ deletedAt: null }).toArray();
  const targetByEmail = new Map();
  const targetByUsername = new Map();
  const targetByDocument = new Map();

  targetUsers.forEach((user) => {
    const email = normalizeEmail(user.email);
    const username = normalizeUsername(user.username);
    const documentNumber = normalizeText(user.documentNumber);
    if (email) targetByEmail.set(email, user._id);
    if (username) targetByUsername.set(username, user._id);
    if (documentNumber) targetByDocument.set(documentNumber, user._id);
  });

  const userIdMap = new Map();
  const usersToInsert = [];

  sourceUsers.forEach((user) => {
    const email = normalizeEmail(user.email);
    const username = normalizeUsername(user.username);
    const documentNumber = normalizeText(user.documentNumber);
    const targetId = (email && targetByEmail.get(email))
      || (username && targetByUsername.get(username))
      || (documentNumber && targetByDocument.get(documentNumber));

    if (targetId) {
      userIdMap.set(String(user._id), targetId);
      return;
    }

    usersToInsert.push({
      ...user,
      schoolId: TARGET_SCHOOL_ID,
    });
  });

  return { userIdMap, usersToInsert };
}

async function mergeFeeConfiguration({ sourceDb, targetDb, structureGrades, session }) {
  const sourceFee = await sourceDb.collection('academicfeeconfigurations').findOne({ schoolId: SOURCE_SCHOOL_ID });
  if (!sourceFee) {
    return { updated: false, reason: 'source_fee_missing' };
  }

  const canonicalGradeSettings = canonicalizeGradeFeeSettingsForStructure(
    sourceFee.gradeSettings || [],
    structureGrades,
  );
  const schoolYearDates = resolveSchoolYearDates(sourceFee.academicYear || String(new Date().getFullYear()));
  const nextFee = {
    ...sourceFee,
    _id: undefined,
    schoolId: TARGET_SCHOOL_ID,
    gradeSettings: canonicalGradeSettings,
    schoolYearStartDate: schoolYearDates.schoolYearStartDate,
    schoolYearEndDate: schoolYearDates.schoolYearEndDate,
  };
  delete nextFee._id;

  if (DRY_RUN) {
    return { updated: true, dryRun: true, gradeCount: canonicalGradeSettings.length };
  }

  await targetDb.collection('academicfeeconfigurations').deleteMany({ schoolId: TARGET_SCHOOL_ID }, { session });
  await targetDb.collection('academicfeeconfigurations').insertOne(nextFee, { session });
  return { updated: true, gradeCount: canonicalGradeSettings.length };
}

async function mergeBillingProfiles({ sourceDb, targetDb, studentIdMap, session }) {
  const sourceProfiles = await sourceDb.collection('studentbillingprofiles').find({ schoolId: SOURCE_SCHOOL_ID }).toArray();
  let updated = 0;

  for (const sourceProfile of sourceProfiles) {
    const targetStudentId = remapObjectId(sourceProfile.studentId, studentIdMap);
    if (!targetStudentId) {
      continue;
    }

    const payload = {
      ...sourceProfile,
      schoolId: TARGET_SCHOOL_ID,
      studentId: targetStudentId,
    };
    delete payload._id;

    if (DRY_RUN) {
      updated += 1;
      continue;
    }

    const result = await targetDb.collection('studentbillingprofiles').updateOne(
      { schoolId: TARGET_SCHOOL_ID, studentId: targetStudentId },
      { $set: payload },
      { session },
    );
    if (result.matchedCount > 0) {
      updated += 1;
    }
  }

  return { updated, total: sourceProfiles.length };
}

async function replaceCollectionFromSource({
  sourceDb,
  targetDb,
  collectionName,
  idFields = [],
  userIdMap = new Map(),
  studentIdMap = new Map(),
  session,
}) {
  const sourceDocs = await sourceDb.collection(collectionName).find({ schoolId: SOURCE_SCHOOL_ID }).toArray();
  if (!sourceDocs.length) {
    return { copied: 0 };
  }

  const nextDocs = sourceDocs.map((document) => {
    let nextDocument = {
      ...document,
      schoolId: TARGET_SCHOOL_ID,
    };
    delete nextDocument._id;
    nextDocument = remapDocumentIds(nextDocument, idFields, userIdMap);
    nextDocument = remapDocumentIds(nextDocument, idFields, studentIdMap);
    return nextDocument;
  });

  if (DRY_RUN) {
    return { copied: nextDocs.length, dryRun: true };
  }

  await targetDb.collection(collectionName).deleteMany({ schoolId: TARGET_SCHOOL_ID }, { session });
  if (nextDocs.length) {
    await targetDb.collection(collectionName).insertMany(nextDocs, { session });
  }

  return { copied: nextDocs.length };
}

async function mergeNotifications({ sourceDb, targetDb, userIdMap, studentIdMap, session }) {
  return replaceCollectionFromSource({
    sourceDb,
    targetDb,
    collectionName: 'notifications',
    idFields: ['userId', 'parentId', 'studentId', 'recipientId', 'actorId'],
    userIdMap,
    studentIdMap,
    session,
  });
}

async function mergeParentStudentLinks({ sourceDb, targetDb, userIdMap, studentIdMap, session }) {
  const sourceLinks = await sourceDb.collection('parentstudentlinks').find({ schoolId: SOURCE_SCHOOL_ID }).toArray();
  let upserted = 0;

  for (const link of sourceLinks) {
    const parentId = remapObjectId(link.parentId, userIdMap);
    const studentId = remapObjectId(link.studentId, studentIdMap);
    if (!parentId || !studentId) {
      continue;
    }

    const payload = {
      ...link,
      schoolId: TARGET_SCHOOL_ID,
      parentId,
      studentId,
    };
    delete payload._id;

    if (DRY_RUN) {
      upserted += 1;
      continue;
    }

    await targetDb.collection('parentstudentlinks').updateOne(
      { schoolId: TARGET_SCHOOL_ID, parentId, studentId },
      { $set: payload },
      { upsert: true, session },
    );
    upserted += 1;
  }

  return { upserted, total: sourceLinks.length };
}

async function insertMissingUsers({ targetDb, usersToInsert, userIdMap, session }) {
  if (!usersToInsert.length) {
    return { inserted: 0 };
  }

  if (DRY_RUN) {
    return { inserted: usersToInsert.length, dryRun: true };
  }

  let inserted = 0;
  for (const user of usersToInsert) {
    const sourceId = String(user._id);
    const nextUser = { ...user, schoolId: TARGET_SCHOOL_ID };
    delete nextUser._id;
    const result = await targetDb.collection('users').insertOne(nextUser, { session });
    userIdMap.set(sourceId, result.insertedId);
    inserted += 1;
  }

  return { inserted };
}

async function mergeAcademicStructure({ sourceDb, targetDb, session }) {
  const sourceStructure = await sourceDb.collection('academicstructures').findOne({ schoolId: SOURCE_SCHOOL_ID });
  if (!sourceStructure) {
    return { updated: false };
  }

  const payload = {
    ...sourceStructure,
    schoolId: TARGET_SCHOOL_ID,
    schoolName: normalizeText(sourceStructure.schoolName) || TARGET_SCHOOL_ID,
  };
  delete payload._id;

  if (DRY_RUN) {
    return { updated: true, dryRun: true };
  }

  await targetDb.collection('academicstructures').deleteMany({ schoolId: TARGET_SCHOOL_ID }, { session });
  await targetDb.collection('academicstructures').insertOne(payload, { session });
  return { updated: true };
}

async function normalizeTargetSchoolIds(targetDb, session) {
  const collections = await targetDb.listCollections().toArray();
  let updatedCollections = 0;

  for (const { name: collectionName } of collections) {
    if (DRY_RUN) {
      const count = await targetDb.collection(collectionName).countDocuments({
        schoolId: { $in: [SOURCE_SCHOOL_ID, 'discovery_t3a0h'] },
      });
      if (count > 0) updatedCollections += 1;
      continue;
    }

    const result = await targetDb.collection(collectionName).updateMany(
      { schoolId: SOURCE_SCHOOL_ID },
      { $set: { schoolId: TARGET_SCHOOL_ID } },
      { session },
    );
    if (result.modifiedCount > 0) {
      updatedCollections += 1;
    }
  }

  return { updatedCollections };
}

async function remapTargetCharges({ targetDb, studentIdMap, userIdMap, session }) {
  const billingProfiles = await targetDb.collection('studentbillingprofiles').find({ schoolId: TARGET_SCHOOL_ID }).toArray();
  const billingProfileByStudent = new Map(billingProfiles.map((profile) => [String(profile.studentId), profile._id]));
  const charges = await targetDb.collection('academiccharges').find({ schoolId: TARGET_SCHOOL_ID }).toArray();
  let updated = 0;

  for (const charge of charges) {
    const studentId = remapObjectId(charge.studentId, studentIdMap);
    const parentId = remapObjectId(charge.parentId, userIdMap);
    const billingProfileId = billingProfileByStudent.get(String(studentId)) || charge.billingProfileId;

    if (DRY_RUN) {
      updated += 1;
      continue;
    }

    await targetDb.collection('academiccharges').updateOne(
      { _id: charge._id },
      {
        $set: {
          schoolId: TARGET_SCHOOL_ID,
          studentId,
          parentId,
          billingProfileId,
        },
      },
      { session },
    );
    updated += 1;
  }

  return { updated, total: charges.length };
}

async function runMerge() {
  const sourceDb = mongoose.connection.client.db(SOURCE_DB_NAME);
  const targetDb = mongoose.connection.client.db(TARGET_DB_NAME);

  const structure = await runWithSchoolContext(TARGET_SCHOOL_ID, async () => (
    AcademicStructure.findOne({ schoolId: TARGET_SCHOOL_ID }).lean()
  ));
  const structureGrades = structure?.grades || [];

  const { studentIdMap, unmatched, unmatchedStudents, sourceCount, targetCount } = await buildStudentIdMap(sourceDb, targetDb);
  const { userIdMap, usersToInsert } = await buildUserIdMap(sourceDb, targetDb);

  const summary = {
    dryRun: DRY_RUN,
    sourceSchoolId: SOURCE_SCHOOL_ID,
    targetSchoolId: TARGET_SCHOOL_ID,
    students: { sourceCount, targetCount, mapped: studentIdMap.size, unmatched },
    insertedStudents: await insertMissingStudents({ targetDb, unmatchedStudents, studentIdMap, session: null }),
    users: { mapped: userIdMap.size, toInsert: usersToInsert.length },
    insertedUsers: await insertMissingUsers({ targetDb, usersToInsert, userIdMap }),
    feeConfiguration: await mergeFeeConfiguration({ sourceDb, targetDb, structureGrades, session: null }),
    billingProfiles: await mergeBillingProfiles({ sourceDb, targetDb, studentIdMap, session: null }),
    academicStructure: await mergeAcademicStructure({ sourceDb, targetDb, session: null }),
    parentLinks: await mergeParentStudentLinks({ sourceDb, targetDb, userIdMap, studentIdMap, session: null }),
    notifications: await mergeNotifications({ sourceDb, targetDb, userIdMap, studentIdMap, session: null }),
    admissionApplicants: await replaceCollectionFromSource({
      sourceDb,
      targetDb,
      collectionName: 'admissionapplicants',
      idFields: ['assignedUserId', 'studentId', 'parentId'],
      userIdMap,
      studentIdMap,
      session: null,
    }),
    superAdminSettings: await replaceCollectionFromSource({
      sourceDb,
      targetDb,
      collectionName: 'superadminschoolsettings',
      session: null,
    }),
    communicationAuthors: await replaceCollectionFromSource({
      sourceDb,
      targetDb,
      collectionName: 'academiccommunicationauthors',
      idFields: ['userId'],
      userIdMap,
      session: null,
    }),
    chargeRemap: await remapTargetCharges({ targetDb, studentIdMap, userIdMap, session: null }),
    normalizedSchoolIds: await normalizeTargetSchoolIds(targetDb, null),
  };

  summary.users.mapped = userIdMap.size;

  if (!DRY_RUN) {
    summary.deletedSourceTenant = await deleteSchoolTenant(SOURCE_SCHOOL_ID);
  }

  return summary;
}

async function run() {
  await connectDB();

  try {
    const summary = await runMerge();
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.connection.close();
  }
}

run().catch(async (error) => {
  console.error('Millennium tenant merge failed:', error);
  try {
    await mongoose.connection.close();
  } catch (_closeError) {
    // ignore
  }
  process.exit(1);
});
