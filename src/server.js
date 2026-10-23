require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/db');
const { startAutoDebitWorker } = require('./workers/autoDebit.worker');
const { startInformaAutoWorker } = require('./workers/informaAuto.worker');
const { startTriviaTurnExpiryWorker } = require('./workers/triviaTurnExpiry.worker');
const { startDemoSchoolWorker } = require('./workers/demoSchool.worker');
const { ensureBootstrapData: ensureWwtecnoBootstrap } = require('./routes/wwtecno.routes');

const PORT = process.env.PORT || 4000;

function startBackgroundWorkers() {
  startAutoDebitWorker();
  startInformaAutoWorker();
  startTriviaTurnExpiryWorker();
  startDemoSchoolWorker();
}

async function connectMongoAndBootstrap() {
  const connection = await connectDB();
  console.log(`MongoDB connected (${connection.name})`);

  try {
    await ensureWwtecnoBootstrap();
    console.log('WW Tecno Capital bootstrap ready (gerencia@wwtecno.com)');
  } catch (bootstrapError) {
    console.warn(`WW Tecno bootstrap skipped: ${bootstrapError.message}`);
  }

  startBackgroundWorkers();
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectMongoAndBootstrap().catch((error) => {
    console.error(`MongoDB bootstrap failed: ${error.message}`);
    console.error('API will return 503 until MongoDB is available.');
  });
});
