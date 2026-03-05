const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Product = require('../models/product.model');
const InventoryRequest = require('../models/inventoryRequest.model');
const InventoryMovement = require('../models/inventoryMovement.model');

const router = express.Router();

router.use(authMiddleware);

async function approveInventoryRequest({ schoolId, userId, requestId }) {
  const request = await InventoryRequest.findOne({ _id: requestId, schoolId, status: 'pending' });
  if (!request) {
    return { status: 404, body: { message: 'Pending request not found' } };
  }

  if (request.type === 'in') {
    await Product.updateOne({ _id: request.productId, schoolId, storeId: request.storeId }, { $inc: { stock: request.quantity } });
  }

  if (request.type === 'out') {
    const product = await Product.findOne({ _id: request.productId, schoolId, storeId: request.storeId });
    if (!product || product.stock < request.quantity) {
      return { status: 400, body: { message: 'Insufficient stock to approve out request' } };
    }

    await Product.updateOne({ _id: request.productId, schoolId, storeId: request.storeId }, { $inc: { stock: -request.quantity } });
  }

  if (request.type === 'transfer') {
    if (!request.targetStoreId) {
      return { status: 400, body: { message: 'targetStoreId is required for transfer request' } };
    }

    const sourceProduct = await Product.findOne({ _id: request.productId, schoolId, storeId: request.storeId });
    if (!sourceProduct || sourceProduct.stock < request.quantity) {
      return { status: 400, body: { message: 'Insufficient stock to transfer' } };
    }

    await Product.updateOne({ _id: request.productId, schoolId, storeId: request.storeId }, { $inc: { stock: -request.quantity } });

    await Product.updateOne(
      { _id: request.productId, schoolId, storeId: request.targetStoreId },
      { $inc: { stock: request.quantity } }
    );
  }

  request.status = 'approved';
  request.approvedBy = userId;
  request.approvedAt = new Date();
  await request.save();

  await InventoryMovement.create({
    schoolId,
    storeId: request.storeId,
    targetStoreId: request.targetStoreId,
    productId: request.productId,
    type: request.type,
    quantity: request.quantity,
    createdBy: userId,
    notes: request.notes,
  });

  return { status: 200, body: request };
}

router.post('/request', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { storeId, targetStoreId = null, productId, type, quantity, notes } = req.body;

    if (!storeId || !productId || !type || !quantity) {
      return res.status(400).json({ message: 'storeId, productId, type and quantity are required' });
    }

    const request = await InventoryRequest.create({
      schoolId,
      storeId,
      targetStoreId,
      productId,
      type,
      quantity,
      requestedBy: userId,
      notes,
    });

    return res.status(201).json(request);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/approve/:id', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const result = await approveInventoryRequest({ schoolId, userId, requestId: req.params.id });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/approve', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ message: 'requestId is required' });
    }

    const result = await approveInventoryRequest({ schoolId, userId, requestId });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { storeId } = req.query;

    const filter = { schoolId, deletedAt: null };
    if (storeId) {
      filter.storeId = storeId;
    }

    const inventory = await Product.find(filter)
      .select('name storeId categoryId stock price status')
      .sort({ stock: 1, name: 1 });

    return res.status(200).json(inventory);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
