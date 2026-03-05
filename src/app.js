const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/students.routes');
const walletRoutes = require('./routes/wallet.routes');
const orderRoutes = require('./routes/orders.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const dailyClosureRoutes = require('./routes/dailyClosure.routes');
const statsRoutes = require('./routes/stats.routes');

const app = express();

const defaultOrigins = [
  'http://localhost:5173',
  'https://comergio.com',
  'https://www.comergio.com',
];

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : defaultOrigins;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
  })
);
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'smartlunch-api',
    time: new Date(),
  });
});

app.use('/auth', limiter, authRoutes);
app.use('/students', studentRoutes);
app.use('/wallet', walletRoutes);
app.use('/orders', limiter, orderRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/daily-closure', dailyClosureRoutes);
app.use('/stats', statsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
