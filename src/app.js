const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

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

const app = express();

const uploadsRootPath = String(process.env.UPLOADS_ROOT_PATH || '').trim() || path.resolve(process.cwd(), 'public', 'assets');

// Render runs behind a proxy; trust first hop so rate-limit/IP detection works.
app.set('trust proxy', 1);

// API responses should be fresh to avoid browser conditional caching (304),
// which can break Axios flows expecting 2xx payloads.
app.set('etag', false);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://comergio.com',
  'https://www.comergio.com',
];

const defaultOriginRegexes = [/^https:\/\/[a-z0-9-]+\.hostingersite\.com$/i];

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
app.use(
  '/assets',
  express.static(uploadsRootPath, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

// Legacy alias for previously generated /uploads URLs.
app.use(
  '/uploads',
  express.static(uploadsRootPath, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'comergio-api',
    time: new Date(),
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
