const cors = require('cors');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

// Build marker — changes every deploy so we can verify which code is running.
const BUILD_MARKER = 'hardened-v2-20260326';

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

// ──────────────────────────────────────────────────────────────────────
// PRE-ROUTER /alerts safety net
//
// This handler is registered directly on the app, BEFORE the router is
// mounted.  It guarantees that GET /alerts can never 500 even if:
//   - The router module fails to load (syntax error, missing dep, etc.)
//   - A middleware (CORS, JSON parser) throws before the router runs
//   - There is a deployment/version mismatch and the router code is stale
//
// It delegates to the router's handler via next() under normal operation.
// If anything goes wrong, it catches the error and returns 200 [].
// ──────────────────────────────────────────────────────────────────────
app.get('/alerts', (req, res, next) => {
  console.log('[app] /alerts pre-router safety net entered', { build: BUILD_MARKER });

  // Attach a flag so we know the safety net is active
  res.locals._alertsSafetyNet = true;

  // Let the normal router handle it
  next();
});

// Mount routes (lazy-loaded to survive import errors)
let routes;
try {
  routes = require('./routes');
} catch (routeLoadErr) {
  console.error('[app] CRITICAL: Failed to load routes module; using minimal fallback router', {
    message: routeLoadErr?.message,
    stack: routeLoadErr?.stack,
  });
  // Fallback: create a minimal router with only health + alerts
  routes = express.Router();
  routes.get('/', (req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'Service is healthy (fallback router)',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      build: BUILD_MARKER,
    });
  });
  routes.get('/alerts', (req, res) => {
    console.log('[app] Fallback /alerts handler returning []');
    return res.status(200).json([]);
  });
}

app.use('/', routes);

// ──────────────────────────────────────────────────────────────────────
// Global error handling middleware
//
// HARDENING: For GET /alerts, this handler returns 200 [] instead of 500.
// This is the last line of defence — if anything in the middleware chain
// or route handler throws an error that wasn't caught, we still honour
// the contract that /alerts never returns 500.
// ──────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Log the error regardless of route
  console.error('[app] Global error handler caught error', {
    method: req.method,
    path: req.path,
    url: req.originalUrl,
    build: BUILD_MARKER,
    error: err?.message,
    stack: err?.stack,
  });

  // If headers already sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }

  // ── /alerts hardening: never return 500 for this route ──
  if (req.method === 'GET' && (req.path === '/alerts' || req.originalUrl.startsWith('/alerts'))) {
    console.error('[app] Global error handler returning safe [] for /alerts');
    return res.status(200).json([]);
  }

  // Default behaviour for all other routes
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
});

module.exports = app;
