function buildStudentDailySpendMatch({ schoolId, studentId, from, to }) {
  const createdAt = { $gte: from };
  if (to) {
    createdAt.$lt = to;
  }

  return {
    schoolId,
    studentId,
    createdAt,
    $or: [
      { status: 'completed' },
      { orderType: 'preorder', preorderStatus: 'pending' },
    ],
  };
}

async function sumStudentDailySpend(Order, {
  schoolId,
  studentId,
  from,
  to,
  session = null,
} = {}) {
  const query = Order.aggregate([
    { $match: buildStudentDailySpendMatch({ schoolId, studentId, from, to }) },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);

  if (session) {
    query.session(session);
  }

  const result = await query;
  return Number(result?.[0]?.total || 0);
}

module.exports = {
  buildStudentDailySpendMatch,
  sumStudentDailySpend,
};
