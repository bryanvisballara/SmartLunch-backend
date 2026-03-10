const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const Product = require('../models/product.model');
const { DEFAULT_TTL_SECONDS, getMenuCache, setMenuCache } = require('../services/menuCache.service');
const { deriveThumbUrlFromImageUrl, normalizeStoredImageUrl } = require('../utils/imageUpload');
require('../models/category.model');
require('../models/store.model');

const router = express.Router();

router.use(authMiddleware);

function normalizeImageUrl(value, includeImageData) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) {
    return '';
  }

  if (imageUrl.startsWith('data:')) {
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
      page = '',
      limit = '',
    } = req.query;
    const shouldIncludeImageData = String(includeImageData || 'false').toLowerCase() === 'true';

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

    const pageNumber = Number.parseInt(String(page || ''), 10);
    const limitNumber = Number.parseInt(String(limit || ''), 10);
    const usePagination = Number.isInteger(pageNumber) && Number.isInteger(limitNumber) && pageNumber > 0 && limitNumber > 0;

    const cacheKey = [
      tokenSchoolId,
      String(storeId || ''),
      String(categoryId || ''),
      String(status || ''),
      String(includeInactive || ''),
      String(includeImageData || ''),
      usePagination ? String(pageNumber) : 'np',
      usePagination ? String(limitNumber) : 'nl',
    ].join(':');

    const cachedPayload = await getMenuCache(cacheKey);
    if (cachedPayload) {
      res.setHeader('X-Menu-Cache', 'HIT');
      return res.status(200).json(cachedPayload);
    }

    const selectFields = '_id name price stock status storeId categoryId imageUrl thumbUrl shortDescription';

    const query = Product.find(filter)
      .select(selectFields)
      .populate({ path: 'categoryId', select: 'name', options: { lean: true } })
      .populate({ path: 'storeId', select: 'name', options: { lean: true } })
      .sort({ name: 1 });

    if (usePagination) {
      query.skip((pageNumber - 1) * limitNumber).limit(limitNumber);
    }

    const products = await query.lean();

    const normalized = products.map((product) => ({
      ...product,
      imageUrl: normalizeImageUrl(product.imageUrl, shouldIncludeImageData),
      thumbUrl: normalizeStoredImageUrl(product.thumbUrl) || deriveThumbUrlFromImageUrl(product.imageUrl),
      categoryName: product.categoryId?.name || 'Sin categoria',
      categoryId: String(product.categoryId?._id || product.categoryId || ''),
      storeName: product.storeId?.name || '',
      storeId: String(product.storeId?._id || product.storeId || ''),
    }));

    await setMenuCache(cacheKey, normalized, DEFAULT_TTL_SECONDS);
    res.setHeader('X-Menu-Cache', 'MISS');

    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;