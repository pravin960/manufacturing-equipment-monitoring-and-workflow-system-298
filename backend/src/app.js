const cors = require('cors');
const express = require('express');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

/**
 * Determine the public-facing base URL for this API.
 *
 * Prefers an explicit PUBLIC_API_BASE_URL (recommended for production).
 * Otherwise, derives from reverse-proxy headers first to avoid leaking internal ports (e.g. ":3001").
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getPublicApiBaseUrl(req) {
  const publicBaseUrl = (process.env.PUBLIC_API_BASE_URL || '').trim().replace(/\/*$/, '');
  if (publicBaseUrl) return publicBaseUrl;

  // Prefer reverse-proxy headers when present
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = (req.get('x-forwarded-host') || '').split(',')[0].trim();

  const protocol = forwardedProto || (req.secure ? 'https' : req.protocol);

  // x-forwarded-host/host may still include an internal port; strip it for the public server URL.
  const rawHost = forwardedHost || req.get('host') || '';
  const hostWithoutPort = String(rawHost).replace(/:\d+$/, '');

  return `${protocol}://${hostWithoutPort}`;
}

// Initialize express app
const app = express();

/**
 * CORS configuration
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowCredentials = String(process.env.CORS_ALLOW_CREDENTIALS || 'false').toLowerCase() === 'true';

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes('*')) {
      if (allowCredentials) return callback(null, origin);
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: allowCredentials,
  methods: (process.env.ALLOWED_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean),
  allowedHeaders: (process.env.ALLOWED_HEADERS || 'Content-Type,Authorization')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
  maxAge: process.env.CORS_MAX_AGE ? Number(process.env.CORS_MAX_AGE) : undefined,
}));

app.set('trust proxy', true);

/**
 * OpenAPI JSON endpoint
 */
app.get('/openapi.json', (req, res) => {
  const serverUrl = 'https://935ba07e.api.kavia.app';

  return res.status(200).json({
    ...swaggerSpec,
    servers: [{ url: serverUrl }],
  });
});

/**
 * Swagger UI docs
 */
app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const dynamicSpec = {
    ...swaggerSpec,
    servers: [{ url: 'https://935ba07e.api.kavia.app' }],
  };

  swaggerUi.setup(dynamicSpec)(req, res, next);
});

// Parse JSON request body
app.use(express.json());

// Mount routes
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
});

module.exports = app;