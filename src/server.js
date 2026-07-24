require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/db');
const { startAutoDebitWorker } = require('./workers/autoDebit.worker');
const { ensureBootstrapData: ensureWwtecnoBootstrap } = require('./routes/wwtecno.routes');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    const connection = await connectDB();
    console.log(`MongoDB connected (${connection.name})`);

    try {
      await ensureWwtecnoBootstrap();
      console.log('WW Tecno Capital bootstrap ready (gerencia@wwtecno.com)');
    } catch (bootstrapError) {
      console.warn(`WW Tecno bootstrap skipped: ${bootstrapError.message}`);
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startAutoDebitWorker();
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
