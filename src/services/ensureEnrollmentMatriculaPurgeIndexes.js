const EnrollmentMatriculaPurgeRequest = require('../models/enrollmentMatriculaPurgeRequest.model');

/**
 * Older environments had a unique index on { schoolId, actionType } for ALL pending
 * requests. That blocked more than one individual "Solicitar borrado" at a time.
 * Keep only the bulk-action uniqueness (clear_consents / clear_signatures).
 */
async function ensureEnrollmentMatriculaPurgeIndexes() {
  const collection = EnrollmentMatriculaPurgeRequest.collection;
  const indexes = await collection.indexes();
  const legacy = indexes.find((index) => {
    if (index.name !== 'schoolId_1_actionType_1' || !index.unique) {
      return false;
    }
    const filter = index.partialFilterExpression || {};
    const actionType = filter.actionType;
    // Legacy: status pending only (no actionType restriction).
    return filter.status === 'pending' && !actionType;
  });

  if (legacy) {
    await collection.dropIndex('schoolId_1_actionType_1');
  }

  await collection.createIndex(
    { schoolId: 1, actionType: 1 },
    {
      unique: true,
      name: 'schoolId_1_actionType_1',
      background: true,
      partialFilterExpression: {
        status: 'pending',
        actionType: { $in: ['clear_consents', 'clear_signatures'] },
      },
    },
  );
}

module.exports = {
  ensureEnrollmentMatriculaPurgeIndexes,
};
