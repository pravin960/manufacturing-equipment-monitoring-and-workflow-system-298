const cors = require('cors');
const express = require('express');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

/**
 * Determine the public-facing base URL for this API.
 */
function getPublicApiBaseUrl(req) {
  const publicBaseUrl = (process.env.PUBLIC_API_BASE_URL || '').trim().replace(/\/*$/, '');
  if (publicBaseUrl) return publicBaseUrl;

  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = (req.get('x-forwarded-host') || '').split(',')[0].trim();

  const protocol = forwardedProto || (req.secure ? 'https' : req.protocol);
  const rawHost = forwardedHost || req.get('host') || '';
  const hostWithoutPort = String(rawHost).replace(/:\d+$/, '');

  return `${protocol}://${hostWithoutPort}`;
}

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowCredentials = String(process.env.CORS_ALLOW_CREDENTIALS || 'false').toLowerCase() === 'true';

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, reverse proxy)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*')) {
      if (allowCredentials) return callback(null, origin);
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Return 403 for CORS violations, not 500
    const err = new Error('Not allowed by CORS');
    err.statusCode = 403;
    return callback(err);
  },
  credentials: allowCredentials,
  methods: (process.env.ALLOWED_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS')
    .split(',').map((m) => m.trim()).filter(Boolean),
  allowedHeaders: (process.env.ALLOWED_HEADERS || 'Content-Type,Authorization')
    .split(',').map((h) => h.trim()).filter(Boolean),
  maxAge: process.env.CORS_MAX_AGE ? Number(process.env.CORS_MAX_AGE) : undefined,
}));

app.set('trust proxy', true);

app.get('/openapi.json', (req, res) => {
  return res.status(200).json({
    ...swaggerSpec,
    servers: [{ url: 'https://935ba07e.api.kavia.app' }],
  });
});

app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const dynamicSpec = {
    ...swaggerSpec,
    servers: [{ url: 'https://935ba07e.api.kavia.app' }],
  };
  swaggerUi.setup(dynamicSpec)(req, res, next);
});

app.use(express.json());
app.use('/', routes);

// Global error handler — logs the FULL error for debugging
app.use((err, req, res, next) => {
  console.error('[global-error-handler] Unhandled error:', {
    message: err?.message,
    stack: err?.stack,
    code: err?.code,
    url: req?.url,
    method: req?.method,
  });
  const status = err?.statusCode || err?.status || 500;
  res.status(status).json({
    status: 'error',
    message: status === 500 ? 'Internal Server Error' : err.message,
  });
});

module.exports = app;