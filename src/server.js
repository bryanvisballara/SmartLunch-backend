require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/db');
const { startAutoDebitWorker } = require('./workers/autoDebit.worker');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    const connection = await connectDB();
    console.log(`MongoDB connected (${connection.name})`);

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
