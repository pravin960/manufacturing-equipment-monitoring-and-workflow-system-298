const cors = require('cors');
const express = require('express');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

// Initialize express app
const app = express();

/**
 * CORS configuration
 *
 * Environment variables:
 * - ALLOWED_ORIGINS: comma-separated list of allowed origins (e.g. "https://app.example.com,https://staging.example.com")
 *   - Use "*" to allow all origins (not compatible with credentials).
 * - ALLOWED_METHODS: comma-separated list of HTTP methods
 * - ALLOWED_HEADERS: comma-separated list of request headers
 * - CORS_ALLOW_CREDENTIALS: "true" to allow cookies/authorization headers in browsers
 * - CORS_MAX_AGE: preflight cache max-age (seconds)
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowCredentials = String(process.env.CORS_ALLOW_CREDENTIALS || 'false').toLowerCase() === 'true';

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser clients (no Origin) and wildcard
    if (!origin) return callback(null, true);

    // If ALLOWED_ORIGINS="*", allow any origin
    if (allowedOrigins.includes('*')) {
      // If credentials are enabled, we must echo back the concrete origin (cannot use "*")
      if (allowCredentials) return callback(null, origin);
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: allowCredentials,
  methods: (process.env.ALLOWED_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS').split(',').map((m) => m.trim()).filter(Boolean),
  allowedHeaders: (process.env.ALLOWED_HEADERS || 'Content-Type,Authorization').split(',').map((h) => h.trim()).filter(Boolean),
  maxAge: process.env.CORS_MAX_AGE ? Number(process.env.CORS_MAX_AGE) : undefined,
}));

app.set('trust proxy', true);

/**
 * Swagger/OpenAPI server URL configuration
 *
 * IMPORTANT: In deployed environments behind a proxy, relying on req.get('host') often yields internal hostnames/ports.
 * To avoid leaking incorrect ports (e.g. ":3001") into Swagger "Try it out", configure PUBLIC_API_BASE_URL.
 *
 * Environment variables:
 * - PUBLIC_API_BASE_URL: e.g. "https://api.example.com" (no trailing slash)
 */
app.use('/docs', swaggerUi.serve, (req, res, next) => {
  // Prefer explicitly configured public URL. This is the safest in production.
  const publicBaseUrl = (process.env.PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');

  // Fallback: derive from request (best-effort for local/dev).
  const protocol = req.secure ? 'https' : req.protocol;
  const host = req.get('host'); // may include port
  const derivedBaseUrl = `${protocol}://${host}`;

  const serverUrl = publicBaseUrl || derivedBaseUrl;

  const dynamicSpec = {
    ...swaggerSpec,
    servers: [{ url: serverUrl }],
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
