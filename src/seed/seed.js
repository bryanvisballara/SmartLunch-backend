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
    ]);

    const passwordHash = await bcrypt.hash('123456', 10);

    const [admin, vendor, parent] = await User.create([
      {
        schoolId,
        name: 'Admin SmartLunch',
        email: 'admin@smartlunch.com',
        passwordHash,
        role: 'admin',
      },
      {
        schoolId,
        name: 'Vendor SmartLunch',
        email: 'vendor@smartlunch.com',
        passwordHash,
        role: 'vendor',
      },
      {
        schoolId,
        name: 'Parent SmartLunch',
        email: 'parent@smartlunch.com',
        passwordHash,
        role: 'parent',
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

    console.log('Seed completed successfully.');
    console.log('Users:');
    console.log('  admin@smartlunch.com / 123456');
    console.log('  vendor@smartlunch.com / 123456');
    console.log('  parent@smartlunch.com / 123456');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seed();
