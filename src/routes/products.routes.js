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

function normalizeNameForDedupe(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildParentProductDedupeKey(product) {
  const sharedProductId = String(product?.sharedProductId || '').trim();
  if (sharedProductId) {
    return `shared:${sharedProductId}`;
  }

  const categoryId = String(product?.categoryId?._id || product?.categoryId || '').trim();
  const name = normalizeNameForDedupe(product?.name);
  return `fallback:${categoryId}:${name}`;
}

function pickPreferredParentProduct(currentProduct, candidateProduct) {
  const currentStock = Number(currentProduct?.stock || 0);
  const candidateStock = Number(candidateProduct?.stock || 0);
  const currentHasStock = currentStock > 0;
  const candidateHasStock = candidateStock > 0;

  if (candidateHasStock && !currentHasStock) {
    return candidateProduct;
  }

  if (candidateHasStock && currentHasStock && candidateStock > currentStock) {
    return candidateProduct;
  }

  const currentPrice = Number(currentProduct?.price || 0);
  const candidatePrice = Number(candidateProduct?.price || 0);
  if (Number.isFinite(candidatePrice) && Number.isFinite(currentPrice) && candidatePrice < currentPrice) {
    return candidateProduct;
  }

  return currentProduct;
}

function dedupeProductsForParent(products) {
  const byKey = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const key = buildParentProductDedupeKey(product);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, product);
      continue;
    }

    byKey.set(key, pickPreferredParentProduct(current, product));
  }

  return Array.from(byKey.values());
}

router.get('/', async (req, res) => {
  try {
    const { schoolId: tokenSchoolId, role } = req.user;
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
      String(role || ''),
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

    const selectFields = '_id name price stock status storeId categoryId sharedProductId imageUrl thumbUrl shortDescription';

    const query = Product.find(filter)
      .select(selectFields)
      .populate({ path: 'categoryId', select: 'name', options: { lean: true } })
      .populate({ path: 'storeId', select: 'name', options: { lean: true } })
      .sort({ name: 1 });

    if (usePagination) {
      query.skip((pageNumber - 1) * limitNumber).limit(limitNumber);
    }

    const products = await query.lean();

    const sourceProducts = role === 'parent' ? dedupeProductsForParent(products) : products;

    const normalized = sourceProducts.map((product) => ({
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