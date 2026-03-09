const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const Product = require('../models/product.model');
require('../models/category.model');
require('../models/store.model');

const router = express.Router();

router.use(authMiddleware);

function normalizeImageUrl(value, includeImageData) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) {
    return '';
  }

  if (!includeImageData && imageUrl.startsWith('data:')) {
    return '';
  }

  return imageUrl;
}

router.get('/', async (req, res) => {
  try {
    const { schoolId: tokenSchoolId } = req.user;
    const {
      schoolId: requestedSchoolId,
      storeId,
      categoryId,
      status = 'active',
      includeInactive = 'false',
      includeImageData = 'false',
    } = req.query;

    if (requestedSchoolId && requestedSchoolId !== tokenSchoolId) {
      return res.status(403).json({ message: 'Forbidden schoolId' });
    }

    const filter = {
      schoolId: tokenSchoolId,
      deletedAt: null,
    };

    if (storeId) {
      filter.storeId = storeId;
    }

    if (categoryId) {
      filter.categoryId = categoryId;
    }

    if (includeInactive !== 'true') {
      filter.status = status;
    }

    const products = await Product.find(filter)
      .select('_id name price stock status storeId categoryId imageUrl shortDescription')
      .populate({ path: 'categoryId', select: 'name', options: { lean: true } })
      .populate({ path: 'storeId', select: 'name', options: { lean: true } })
      .sort({ name: 1 })
      .lean();

    const normalized = products.map((product) => ({
      ...product,
      imageUrl: normalizeImageUrl(product.imageUrl, includeImageData === 'true'),
      categoryName: product.categoryId?.name || 'Sin categoria',
      categoryId: String(product.categoryId?._id || product.categoryId || ''),
      storeName: product.storeId?.name || '',
      storeId: String(product.storeId?._id || product.storeId || ''),
    }));

    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;