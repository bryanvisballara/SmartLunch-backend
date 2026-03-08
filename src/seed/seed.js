require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Wallet = require('../models/wallet.model');
const Store = require('../models/store.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const MeriendaSubscription = require('../models/meriendaSubscription.model');
const MeriendaFailedPayment = require('../models/meriendaFailedPayment.model');
const MeriendaSchedule = require('../models/meriendaSchedule.model');
const MeriendaOperation = require('../models/meriendaOperation.model');
const MeriendaSnack = require('../models/meriendaSnack.model');
const MeriendaIntakeRecord = require('../models/meriendaIntakeRecord.model');

async function seed() {
  try {
    const connection = await connectDB();
    console.log(`MongoDB connected (${connection.name})`);

    const schoolId = 'smartlunch-demo';

    await Promise.all([
      User.deleteMany({ schoolId }),
      Student.deleteMany({ schoolId }),
      ParentStudentLink.deleteMany({ schoolId }),
      Wallet.deleteMany({ schoolId }),
      Store.deleteMany({ schoolId }),
      Category.deleteMany({ schoolId }),
      Product.deleteMany({ schoolId }),
      MeriendaSubscription.deleteMany({ schoolId }),
      MeriendaFailedPayment.deleteMany({ schoolId }),
      MeriendaSchedule.deleteMany({ schoolId }),
      MeriendaOperation.deleteMany({ schoolId }),
      MeriendaSnack.deleteMany({ schoolId }),
      MeriendaIntakeRecord.deleteMany({ schoolId }),
    ]);

    const passwordHash = await bcrypt.hash('123456', 10);

    const [admin, vendor, parent, meriendaOperator] = await User.create([
      {
        schoolId,
        name: 'Admin SmartLunch',
        username: 'admin',
        passwordHash,
        role: 'admin',
      },
      {
        schoolId,
        name: 'Vendor SmartLunch',
        username: 'vendor',
        passwordHash,
        role: 'vendor',
      },
      {
        schoolId,
        name: 'Parent SmartLunch',
        username: 'parent',
        passwordHash,
        role: 'parent',
      },
      {
        schoolId,
        name: 'Operario Meriendas',
        username: 'operario',
        passwordHash,
        role: 'merienda_operator',
      },
    ]);

    const [studentA, studentB] = await Student.create([
      {
        schoolId,
        name: 'Juan Perez',
        schoolCode: 'ALU-001',
        grade: '5A',
        dailyLimit: 20000,
      },
      {
        schoolId,
        name: 'Sofia Perez',
        schoolCode: 'ALU-002',
        grade: '3B',
        dailyLimit: 18000,
      },
    ]);

    await ParentStudentLink.create([
      { schoolId, parentId: parent._id, studentId: studentA._id },
      { schoolId, parentId: parent._id, studentId: studentB._id },
    ]);

    await Wallet.create([
      { schoolId, studentId: studentA._id, balance: 50000 },
      { schoolId, studentId: studentB._id, balance: 35000 },
    ]);

    const store = await Store.create({
      schoolId,
      name: 'Cafeteria Principal',
      location: 'Bloque A',
      status: 'active',
    });

    const [catBebidas, catSnacks] = await Category.create([
      { schoolId, name: 'Bebidas' },
      { schoolId, name: 'Snacks' },
    ]);

    await Product.create([
      { schoolId, name: 'Jugo Hit', categoryId: catBebidas._id, storeId: store._id, price: 3000, stock: 120 },
      { schoolId, name: 'Agua', categoryId: catBebidas._id, storeId: store._id, price: 2000, stock: 100 },
      { schoolId, name: 'Galletas', categoryId: catSnacks._id, storeId: store._id, price: 2500, stock: 90 },
      { schoolId, name: 'Sandwich', categoryId: catSnacks._id, storeId: store._id, price: 7000, stock: 60 },
    ]);

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [subA, subB] = await MeriendaSubscription.create([
      {
        schoolId,
        parentUserId: parent._id,
        parentName: parent.name,
        parentUsername: parent.username,
        childName: studentA.name,
        childGrade: studentA.grade,
        childDocument: 'CC-ALU-001',
        parentRecommendations: 'Prefiere porciones pequenas y pausas cortas entre bocados.',
        childAllergies: 'Restriccion alimentaria leve al mani.',
        paymentStatus: true,
        currentPeriodMonth: month,
        status: 'active',
        lastPaymentAt: now,
      },
      {
        schoolId,
        parentUserId: parent._id,
        parentName: parent.name,
        parentUsername: parent.username,
        childName: studentB.name,
        childGrade: studentB.grade,
        childDocument: 'CC-ALU-002',
        parentRecommendations: 'Motivarla con ejemplos visuales antes de cada bocado.',
        childAllergies: 'Sin restricciones alimentarias reportadas.',
        paymentStatus: true,
        currentPeriodMonth: month,
        status: 'active',
        lastPaymentAt: now,
      },
    ]);

    await MeriendaIntakeRecord.create({
      schoolId,
      subscriptionId: subA._id,
      month,
      date: `${month}-${String(now.getDate()).padStart(2, '0')}`,
      ateStatus: 'ate',
      observations: 'Comio bien toda la porcion, buen comportamiento.',
      handledByUserId: meriendaOperator._id,
      handledByName: meriendaOperator.name,
    });

    console.log('Seed completed successfully.');
    console.log('Users:');
    console.log('  admin / 123456');
    console.log('  vendor / 123456');
    console.log('  parent / 123456');
    console.log('  operario / 123456');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seed();
