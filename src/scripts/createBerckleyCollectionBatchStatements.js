require('dotenv').config();

const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models/index');

const SchoolBillingStatement = require('../models/schoolBillingStatement.model');
const Order = require('../models/order.model');

const SCHOOL_ID = 'International Berckley School';
const COLLECTION_DAYS = ['2026-04-18', '2026-05-29'];

async function main() {
  const { getSchoolDisplayName } = require('../utils/schoolDisplayName');
  const ordersRouter = require('../routes/orders.routes');

  await connectDB();

  await runWithSchoolContext(SCHOOL_ID, async () => {
    const schoolName = await getSchoolDisplayName(SCHOOL_ID);
    const deleted = await SchoolBillingStatement.deleteMany({ schoolId: SCHOOL_ID });
    await Order.updateMany(
      { schoolId: SCHOOL_ID, paymentMethod: 'school_billing' },
      { $set: { schoolBillingStatementId: null } }
    );

    const createdStatements = [];
    for (const collectedDay of COLLECTION_DAYS) {
      const statement = await ordersRouter.createSchoolBillingStatementFromCollectionBatch({
        schoolId: SCHOOL_ID,
        schoolName,
        userId: null,
        userName: 'Bryan Visbal',
        collectedDay,
        billingFor: '',
        billingResponsible: '',
      });
      createdStatements.push(statement);
    }

    console.log('Deleted previous statements:', deleted.deletedCount);
    createdStatements.forEach((statement) => {
      console.log({
        statementNumber: statement.statementNumber,
        orderCount: statement.orderCount,
        totalAmount: statement.totalAmount,
        createdAt: statement.createdAt,
      });
    });
  });
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
