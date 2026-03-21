const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Product = require('../models/product.model');
const InventoryRequest = require('../models/inventoryRequest.model');
const InventoryMovement = require('../models/inventoryMovement.model');
const { queueApprovalPendingNotificationForAdmins } = require('../services/notification.service');

const router = express.Router();

router.use(authMiddleware);

async function applyInventoryMutation({
  schoolId,
  userId,
  storeId,
  targetStoreId,
  productId,
  type,
  quantity,
  notes,
  session,
}) {
  if (type === 'in') {
    const result = await Product.updateOne(
      { _id: productId, schoolId, storeId, deletedAt: null },
      { $inc: { stock: quantity } },
      { session }
    );

    if (result.matchedCount === 0) {
      return { status: 404, body: { message: 'Product not found for in request' } };
    }
  }

  if (type === 'out') {
    const product = await Product.findOne({ _id: productId, schoolId, storeId, deletedAt: null }).session(session);
    if (!product || product.stock < quantity) {
      return { status: 400, body: { message: 'Insufficient stock to approve out request' } };
    }

    await Product.updateOne(
      { _id: productId, schoolId, storeId, deletedAt: null },
      { $inc: { stock: -quantity } },
      { session }
    );
  }

  if (type === 'transfer') {
    if (!targetStoreId) {
      return { status: 400, body: { message: 'targetStoreId is required for transfer request' } };
    }

    const sourceProduct = await Product.findOne({ _id: productId, schoolId, storeId, deletedAt: null }).session(session);
    if (!sourceProduct || sourceProduct.stock < quantity) {
      return { status: 400, body: { message: 'Insufficient stock to transfer' } };
    }

    await Product.updateOne(
      { _id: productId, schoolId, storeId, deletedAt: null },
      { $inc: { stock: -quantity } },
      { session }
    );

    // Destination stock must also be persisted even if destination uses a different product _id.
    let targetProduct = await Product.findOne({
      schoolId,
      storeId: targetStoreId,
      $or: [
        { sharedProductId: String(sourceProduct.sharedProductId || sourceProduct._id) },
        {
          categoryId: sourceProduct.categoryId,
          name: sourceProduct.name,
        },
      ],
      deletedAt: null,
    }).session(session);

    if (!targetProduct) {
      targetProduct = await Product.create(
        [
          {
            schoolId,
            sharedProductId: String(sourceProduct.sharedProductId || sourceProduct._id),
            name: sourceProduct.name,
            categoryId: sourceProduct.categoryId,
            storeId: targetStoreId,
            price: sourceProduct.price,
            cost: sourceProduct.cost,
            stock: 0,
            inventoryAlertStock: sourceProduct.inventoryAlertStock,
            imageUrl: sourceProduct.imageUrl,
            tags: sourceProduct.tags,
            status: sourceProduct.status,
          },
        ],
        { session }
      ).then((created) => created[0]);
    }

    await Product.updateOne({ _id: targetProduct._id }, { $inc: { stock: quantity } }, { session });
  }

  await InventoryMovement.create(
    [
      {
        schoolId,
        storeId,
        targetStoreId,
        productId,
        type,
        quantity,
        createdBy: userId,
        notes,
      },
    ],
    { session }
  );

  return { status: 200, body: null };
}

async function approveInventoryRequest({ schoolId, userId, requestId }) {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const request = await InventoryRequest.findOne({ _id: requestId, schoolId, status: 'pending' }).session(session);
    if (!request) {
      await session.abortTransaction();
      return { status: 404, body: { message: 'Pending request not found' } };
    }

    const applyResult = await applyInventoryMutation({
      schoolId,
      userId,
      storeId: request.storeId,
      targetStoreId: request.targetStoreId,
      productId: request.productId,
      type: request.type,
      quantity: request.quantity,
      notes: request.notes,
      session,
    });

    if (applyResult.status !== 200) {
      await session.abortTransaction();
      return applyResult;
    }

    request.status = 'approved';
    request.approvedBy = userId;
    request.approvedAt = new Date();
    await request.save({ session });

    await session.commitTransaction();

    return { status: 200, body: request };
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    return { status: 500, body: { message: error.message } };
  } finally {
    if (session) {
      session.endSession();
    }
  }
}

router.post('/request', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const { storeId, targetStoreId = null, productId, type, quantity, notes, items } = req.body;

    if (!storeId || !type) {
      return res.status(400).json({ message: 'storeId and type are required' });
    }

    if (type === 'transfer' && !targetStoreId) {
      return res.status(400).json({ message: 'targetStoreId is required for transfer requests' });
    }

    const payloadItems = Array.isArray(items) && items.length > 0
      ? items
      : [{ productId, quantity, notes }];

    const invalidItem = payloadItems.find((item) => !item?.productId || Number(item?.quantity) <= 0);
    if (invalidItem) {
      return res.status(400).json({ message: 'Each item requires productId and positive quantity' });
    }

    const documents = payloadItems.map((item) => ({
      batchId: crypto.randomUUID(),
      schoolId,
      storeId,
      targetStoreId,
      productId: item.productId,
      type,
      quantity: Number(item.quantity),
      requestedBy: userId,
      notes: item.notes || notes,
    }));

    const batchId = documents[0].batchId;
    for (const document of documents) {
      document.batchId = batchId;
    }

    const requests = await InventoryRequest.insertMany(documents);

    if (role === 'vendor') {
      try {
        const requestCount = Number(requests.length || 0);
        const typeLabelMap = {
          in: 'ingreso',
          out: 'egreso',
          transfer: 'traslado',
        };
        const typeLabel = typeLabelMap[type] || 'inventario';

        await queueApprovalPendingNotificationForAdmins({
          schoolId,
          title: 'Nueva autorizacion pendiente',
          body: `Vendedor solicito ${requestCount} movimiento(s) de ${typeLabel}.`,
          payload: {
            type: 'approval.inventory.pending',
            batchId,
            requestType: String(type || ''),
            requestsCount: requestCount,
            storeId: String(storeId || ''),
            targetStoreId: String(targetStoreId || ''),
            requestedBy: String(userId || ''),
          },
        });
      } catch (notificationError) {
        console.warn(`[APPROVAL_PUSH_WARNING] inventory batch=${batchId} error=${notificationError.message}`);
      }
    }

    return res.status(201).json({
      count: requests.length,
      requests,
    });
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

router.post('/apply', roleMiddleware('admin'), async (req, res) => {
  let session;
  try {
    const { schoolId, userId } = req.user;
    const { storeId, targetStoreId = null, type, notes, items } = req.body;

    if (!storeId || !type || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'storeId, type and items are required' });
    }

    if (type === 'transfer' && !targetStoreId) {
      return res.status(400).json({ message: 'targetStoreId is required for transfer requests' });
    }

    const invalidItem = items.find((item) => !item?.productId || Number(item?.quantity) <= 0);
    if (invalidItem) {
      return res.status(400).json({ message: 'Each item requires productId and positive quantity' });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    for (const item of items) {
      const result = await applyInventoryMutation({
        schoolId,
        userId,
        storeId,
        targetStoreId,
        productId: item.productId,
        type,
        quantity: Number(item.quantity),
        notes: item.notes || notes,
        session,
      });

      if (result.status !== 200) {
        await session.abortTransaction();
        return res.status(result.status).json(result.body);
      }
    }

    await session.commitTransaction();

    return res.status(200).json({
      message: 'Inventory movement applied successfully',
      count: items.length,
      type,
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    return res.status(500).json({ message: error.message });
  } finally {
    if (session) {
      session.endSession();
    }
  }
});

router.post('/reject/:id', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const request = await InventoryRequest.findOne({ _id: req.params.id, schoolId, status: 'pending' });

    if (!request) {
      return res.status(404).json({ message: 'Pending request not found' });
    }

    request.status = 'rejected';
    request.rejectedBy = userId;
    request.rejectedAt = new Date();
    await request.save();

    return res.status(200).json(request);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { status = 'pending', type, storeId } = req.query;

    const filter = { schoolId };
    if (status) {
      filter.status = status;
    }
    if (type) {
      filter.type = type;
    }
    if (storeId) {
      filter.storeId = storeId;
    }

    if (role === 'vendor') {
      filter.requestedBy = userId;
    }

    const requests = await InventoryRequest.find(filter)
      .populate('productId', 'name')
      .populate('storeId', 'name')
      .populate('targetStoreId', 'name')
      .populate('requestedBy', 'name username')
      .populate('approvedBy', 'name username')
      .populate('rejectedBy', 'name username')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json(requests);
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
