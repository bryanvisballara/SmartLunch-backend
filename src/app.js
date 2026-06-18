const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');

require('./models');
const AdmissionMarketingAsset = require('./models/admissionMarketingAsset.model');
const AcademicCommunicationAsset = require('./models/academicCommunicationAsset.model');
const { findOneAcrossTenantSchoolDbs } = require('./config/db');
const { isCloudinaryEnabled } = require('./utils/imageUpload');

const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/students.routes');
const walletRoutes = require('./routes/wallet.routes');
const orderRoutes = require('./routes/orders.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const productsRoutes = require('./routes/products.routes');
const storesRoutes = require('./routes/stores.routes');
const dailyClosureRoutes = require('./routes/dailyClosure.routes');
const statsRoutes = require('./routes/stats.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const adminRoutes = require('./routes/admin.routes');
const meriendasRoutes = require('./routes/meriendas.routes');
const parentRoutes = require('./routes/parent.routes');
const paymentsRoutes = require('./routes/payments.routes');
const campusRoutes = require('./routes/campus.routes');
const nursingRoutes = require('./routes/nursing.routes');
const psychologyRoutes = require('./routes/psychology.routes');
const hrRoutes = require('./routes/hr.routes');
const academicSecretaryRoutes = require('./routes/academicSecretary.routes');
const admissionsRoutes = require('./routes/admissions.routes');
const schoolCreationRoutes = require('./routes/schoolCreation.routes');
const superAdminRoutes = require('./routes/superAdmin.routes');
const schoolContextMiddleware = require('./middleware/schoolContextMiddleware');

const app = express();

const uploadsRootPath = String(process.env.UPLOADS_ROOT_PATH || '').trim() || path.resolve(process.cwd(), 'public', 'assets');
const bundledAssetsRootPath = path.resolve(process.cwd(), 'public', 'assets');
const staticAssetRootPaths = Array.from(new Set([
  path.resolve(uploadsRootPath),
  bundledAssetsRootPath,
]));

function isPathInsideRoot(absolutePath, rootPath) {
  return absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
}

async function resolveStaticAssetPath(assetPath) {
  const requestedPath = path.normalize(decodeURIComponent(assetPath)).replace(/^[/\\]+/, '');

  for (const rootPath of staticAssetRootPaths) {
    const absolutePath = path.resolve(rootPath, requestedPath);
    if (!isPathInsideRoot(absolutePath, rootPath)) {
      return { invalid: true };
    }

    try {
      await fs.access(absolutePath);
      return { absolutePath };
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return { absolutePath: '' };
}

function setStaticAssetHeaders(res) {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
}

// Render runs behind a proxy; trust first hop so rate-limit/IP detection works.
app.set('trust proxy', 1);

// API responses should be fresh to avoid browser conditional caching (304),
// which can break Axios flows expecting 2xx payloads.
app.set('etag', false);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://comergio.com',
  'https://www.comergio.com',
];

const defaultOriginRegexes = [
  /^https:\/\/[a-z0-9-]+\.hostingersite\.com$/i,
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
];

const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

const allowedOriginRegexes = (process.env.CORS_ORIGIN_REGEX || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      console.warn(`Ignoring invalid CORS_ORIGIN_REGEX pattern: ${pattern}`);
      return null;
    }
  })
  .filter(Boolean)
  .concat(defaultOriginRegexes);

function isAllowedOrigin(origin) {
  return (
    allowedOrigins.includes(origin) ||
    allowedOriginRegexes.some((regex) => regex.test(origin))
  );
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      // Return false instead of throwing to avoid surfacing as a 500 response.
      return callback(null, false);
    },
  })
);
app.use(helmet());
app.use(
  compression({
    threshold: 1024,
  })
);
app.use((req, res, next) => {
  if (String(req.path || '').startsWith('/assets/') || String(req.path || '').startsWith('/uploads/')) {
    return next();
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));
app.use(schoolContextMiddleware);
app.use(['/assets/admissions-marketing/:fileName', '/uploads/admissions-marketing/:fileName'], async (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    return next();
  }

  const fileName = String(req.params?.fileName || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(fileName)) {
    return res.status(400).json({ message: 'Invalid asset path' });
  }

  try {
    let asset = await AdmissionMarketingAsset.findOne({ fileName }).select('data mimeType sizeBytes').exec();
    if (!asset) {
      const tenantAsset = await findOneAcrossTenantSchoolDbs(() => AdmissionMarketingAsset.findOne({ fileName }).select('data mimeType sizeBytes').exec());
      asset = tenantAsset?.doc || null;
    }
    if (!asset?.data) {
      return next();
    }

    const imageBuffer = Buffer.from(asset.data);
    res.setHeader('Content-Type', asset.mimeType || 'image/jpeg');
    res.setHeader('Content-Length', String(imageBuffer.length));
    setStaticAssetHeaders(res);

    if (method === 'HEAD') {
      return res.end();
    }

    return res.send(imageBuffer);
  } catch (error) {
    return next(error);
  }
});
app.use(['/assets/academic-communications/:fileName', '/uploads/academic-communications/:fileName'], async (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    return next();
  }

  const fileName = String(req.params?.fileName || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(fileName)) {
    return res.status(400).json({ message: 'Invalid asset path' });
  }

  try {
    let asset = await AcademicCommunicationAsset.findOne({ fileName }).select('data mimeType sizeBytes').exec();
    if (!asset) {
      const tenantAsset = await findOneAcrossTenantSchoolDbs(() => AcademicCommunicationAsset.findOne({ fileName }).select('data mimeType sizeBytes').exec());
      asset = tenantAsset?.doc || null;
    }
    if (!asset?.data) {
      return next();
    }

    const imageBuffer = Buffer.from(asset.data);
    res.setHeader('Content-Type', asset.mimeType || 'image/jpeg');
    res.setHeader('Content-Length', String(imageBuffer.length));
    setStaticAssetHeaders(res);

    if (method === 'HEAD') {
      return res.end();
    }

    return res.send(imageBuffer);
  } catch (error) {
    return next(error);
  }
});
app.use(['/assets', '/uploads'], async (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  const wantsJpeg = ['jpg', 'jpeg'].includes(String(req.query?.format || '').toLowerCase());
  const assetPath = String(req.path || '');

  if (!['GET', 'HEAD'].includes(method) || !wantsJpeg || !/\.webp$/i.test(assetPath)) {
    return next();
  }

  try {
    const resolvedAsset = await resolveStaticAssetPath(assetPath);
    if (resolvedAsset.invalid) {
      return res.status(400).json({ message: 'Invalid asset path' });
    }
    if (!resolvedAsset.absolutePath) {
      return next();
    }

    const imageBuffer = await fs.readFile(resolvedAsset.absolutePath);
    const jpegBuffer = await sharp(imageBuffer)
      .rotate()
      .jpeg({ quality: Number(process.env.IOS_WEBP_JPEG_QUALITY || 86), mozjpeg: true })
      .toBuffer();

    res.setHeader('Content-Type', 'image/jpeg');
    setStaticAssetHeaders(res);

    if (method === 'HEAD') {
      res.setHeader('Content-Length', String(jpegBuffer.length));
      return res.end();
    }

    return res.send(jpegBuffer);
  } catch (error) {
    return next(error);
  }
});
for (const staticAssetRootPath of staticAssetRootPaths) {
  app.use(
    '/assets',
    express.static(staticAssetRootPath, {
      maxAge: '1y',
      immutable: true,
      setHeaders: setStaticAssetHeaders,
    })
  );
}

// Legacy alias for previously generated /uploads URLs.
for (const staticAssetRootPath of staticAssetRootPaths) {
  app.use(
    '/uploads',
    express.static(staticAssetRootPath, {
      maxAge: '1y',
      immutable: true,
      setHeaders: setStaticAssetHeaders,
    })
  );
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'comergio-api',
    time: new Date(),
    cloudinaryEnabled: isCloudinaryEnabled(),
  });
});

app.use('/auth', limiter, authRoutes);
app.use('/students', studentRoutes);
app.use('/wallet', walletRoutes);
app.use('/orders', limiter, orderRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/products', productsRoutes);
app.use('/stores', storesRoutes);
app.use('/daily-closure', dailyClosureRoutes);
app.use('/stats', statsRoutes);
app.use('/kpi', statsRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/meriendas', meriendasRoutes);
app.use('/meriendas', meriendasRoutes);
app.use('/parent', parentRoutes);
app.use('/campus', campusRoutes);
app.use('/nursing', nursingRoutes);
app.use('/psychology', psychologyRoutes);
app.use('/hr', hrRoutes);
app.use('/academic-secretary/admissions', admissionsRoutes);
app.use('/academic-secretary', academicSecretaryRoutes);
app.use('/school-creation', limiter, schoolCreationRoutes);
app.use('/super-admin', superAdminRoutes);
app.use('/payments', paymentsRoutes);
app.use('/webhooks', paymentsRoutes);

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'La imagen es muy grande. Intenta con una foto mas liviana.' });
  }

  if (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Unexpected server error' });
  }

  return next();
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
