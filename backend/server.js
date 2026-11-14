require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errors');

const authRoutes = require('./src/routes/authRoutes');
const productRoutes = require('./src/routes/productRoutes');
const stockRoutes = require('./src/routes/stockRoutes');
const salesRoutes = require('./src/routes/salesRoutes');
const categoryRoutes = require('./src/routes/categoryRoutes');
const alertRoutes = require('./src/routes/alertRoutes');
const restockRoutes = require('./src/routes/restockRoutes');
const userRoutes = require('./src/routes/userRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const syncRoutes = require('./src/routes/syncRoutes');
const reportsRoutes = require('./src/routes/reportsRoutes');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((item) => item.trim());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(path.resolve(__dirname, process.env.UPLOAD_DIR || 'uploads'), {
  dotfiles: 'deny',
  maxAge: '1d',
}));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'stockwise-inventory-api' }));
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Try again later.' },
}), authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/inventory', stockRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/restocking', restockRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/reports', reportsRoutes);
app.use(errorHandler);

if (require.main === module) {
  connectDB().then(() => {
    const port = Number(process.env.PORT || 5000);
    app.listen(port, () => console.log(`StockWise API listening on ${port}`));
  }).catch((error) => {
    console.error('API startup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
