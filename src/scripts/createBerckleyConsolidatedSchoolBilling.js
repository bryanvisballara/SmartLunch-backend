require('dotenv').config();

const { connectDB, runWithSchoolContext } = require('../config/db');
require('../models/index');

const SCHOOL_ID = 'International Berckley School';
const FROM = '2026-03-01';
const TO = '2026-05-31';

async function main() {
  const { getSchoolDisplayName } = require('../utils/schoolDisplayName');
  const ordersRouter = require('../routes/orders.routes');

  await connectDB();

  await runWithSchoolContext(SCHOOL_ID, async () => {
    const schoolName = await getSchoolDisplayName(SCHOOL_ID);
    const statement = await ordersRouter.createConsolidatedSchoolBillingStatement({
      schoolId: SCHOOL_ID,
      schoolName,
      userId: null,
      userName: 'Recuperación histórica',
      from: FROM,
      to: TO,
      billingFor: 'Cuenta consolidada colegio',
      billingResponsible: 'Administración cafetería',
    });

    console.log('Created consolidated statement:', {
      id: String(statement._id),
      statementNumber: statement.statementNumber,
      orderCount: statement.orderCount,
      totalAmount: statement.totalAmount,
      createdAt: statement.createdAt,
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
