const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { errorHandler, ApiError } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const cmdbRoutes = require('./routes/cmdbRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const auditRoutes = require('./routes/auditRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        env.corsOrigins.includes('*') ||
        env.corsOrigins.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Allow LAN/staging IP access without breaking browser CORS
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many API requests. Please wait a moment before retrying.',
    },
  },
});

app.use('/api', apiLimiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: 'atlancis-itsm-backend',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      allowLiveWrites: env.getAllowLiveWrites(),
      webservices: {
        ticket: env.znuny.wsTicket,
        cmdb: env.znuny.wsCmdb,
        sla: env.znuny.wsSla,
      },
    },
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/cmdb', cmdbRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/settings', settingsRoutes);

// 404 handler for unknown /api routes
app.use('/api/*', (req, _res, next) => {
  next(new ApiError(404, `API endpoint not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
});

// Centralized error handler (redacts sensitive credentials/SessionIDs)
app.use(errorHandler);

if (require.main === module) {
  app.listen(env.port, '0.0.0.0', () => {
    console.log(
      `[ITSM Center API] Listening on http://0.0.0.0:${env.port} | Znuny: ${env.znuny.baseUrl} | Allow Live Writes: ${env.getAllowLiveWrites()}`
    );
  });
}

module.exports = app;
