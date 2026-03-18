require('dotenv').config();
const { connectDB } = require('../src/config/db');
const Student = require('../src/models/student.model');
const Wallet = require('../src/models/wallet.model');
const { getPreapproval } = require('../src/services/mercadopago.service');

(async () => {
  await connectDB();
  const student = await Student.findOne({ name: /^Oliver Visbal$/i }).lean();
  if (!student) {
    console.log(JSON.stringify({ ok: false, message: 'student not found' }, null, 2));
    process.exit(1);
  }
  const wallet = await Wallet.findOne({ studentId: student._id }).lean();
  const preapprovalId = String(wallet?.autoDebitAgreementId || '').trim();
  if (!preapprovalId) {
    console.log(JSON.stringify({ ok: false, message: 'no preapproval id in wallet' }, null, 2));
    process.exit(1);
  }

  const preapproval = await getPreapproval(preapprovalId);
  console.log(JSON.stringify({
    ok: true,
    preapprovalId,
    walletStatus: wallet?.autoDebitAgreementStatus || null,
    mpStatus: preapproval?.status || null,
    reason: preapproval?.reason || null,
    external_reference: preapproval?.external_reference || null,
    payer_email: preapproval?.payer_email || null,
    init_point: preapproval?.init_point || null,
    back_url: preapproval?.back_url || null,
    auto_recurring: preapproval?.auto_recurring || null,
  }, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
