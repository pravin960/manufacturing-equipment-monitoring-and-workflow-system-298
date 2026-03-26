// backend/src/db/pool.js
//
// PostgreSQL connection pool with verbose diagnostic logging.
//
// FIX: Pool is created lazily (on first use) instead of at module load time.
// This means a missing/unreachable DB will NOT crash the app on startup.
// Routes will still load correctly, and only actual DB calls will fail gracefully.
//
// LOGGING: Every connection attempt, query execution, and pool lifecycle event
// is logged with timestamps, durations, and contextual metadata to help
// diagnose deployed failures (especially for /alerts returning 500).

const { Pool } = require('pg');

let _pool = null;
let _poolCreatedAt = null;
let _poolCreationCount = 0;

/**
 * Redacts sensitive portions of a connection string for safe logging.
 * @param {string|undefined} connStr
 * @returns {string}
 */
function redactConnectionString(connStr) {
  if (!connStr) return '(not set)';
  try {
    // Replace password in postgresql:// URLs
    return connStr.replace(/:([^@/:]+)@/, ':***@');
  } catch {
    return '(redaction-error)';
  }
}

/**
 * Builds a safe-to-log summary of current pool configuration.
 * Never includes passwords or full connection strings.
 * @returns {object}
 */
function getPoolConfigSummary() {
  return {
    hasConnectionString: Boolean(process.env.POSTGRES_URL),
    connectionStringRedacted: redactConnectionString(process.env.POSTGRES_URL),
    host: process.env.POSTGRES_HOST || '(not set)',
    user: process.env.POSTGRES_USER || '(not set)',
    database: process.env.POSTGRES_DB || '(not set)',
    port: process.env.POSTGRES_PORT || '(not set / default 5432)',
    poolMax: process.env.POSTGRES_POOL_MAX || '10 (default)',
    nodeEnv: process.env.NODE_ENV || '(not set)',
  };
}

/**
 * PUBLIC_INTERFACE
 * Creates (or returns cached) PostgreSQL connection pool.
 * Logs verbose diagnostics on every pool creation.
 * @returns {import('pg').Pool}
 */
function getPool() {
  if (_pool) return _pool;

  _poolCreationCount += 1;
  const creationId = _poolCreationCount;
  const configSummary = getPoolConfigSummary();

  console.log('[pool] Creating new PostgreSQL pool', {
    creationId,
    timestamp: new Date().toISOString(),
    config: configSummary,
  });

  try {
    _pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      host: process.env.POSTGRES_HOST,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : undefined,
      max: process.env.POSTGRES_POOL_MAX ? Number(process.env.POSTGRES_POOL_MAX) : 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    _poolCreatedAt = Date.now();

    console.log('[pool] Pool object created successfully', {
      creationId,
      timestamp: new Date().toISOString(),
      totalClients: _pool.totalCount,
      idleClients: _pool.idleCount,
      waitingClients: _pool.waitingCount,
    });
  } catch (poolCreateErr) {
    console.error('[pool] CRITICAL: Failed to create Pool object', {
      creationId,
      timestamp: new Date().toISOString(),
      config: configSummary,
      error: {
        name: poolCreateErr?.name,
        message: poolCreateErr?.message,
        stack: poolCreateErr?.stack,
        code: poolCreateErr?.code,
      },
    });
    // Reset so next attempt tries again
    _pool = null;
    throw poolCreateErr;
  }

  // Listen for pool-level events for diagnostics
  _pool.on('error', (err, client) => {
    console.error('[pool] Unexpected idle client error — resetting pool', {
      timestamp: new Date().toISOString(),
      poolAgeMs: _poolCreatedAt ? Date.now() - _poolCreatedAt : null,
      creationId,
      error: {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        errno: err?.errno,
        syscall: err?.syscall,
        address: err?.address,
        port: err?.port,
      },
    });
    // Reset pool so next call recreates it
    _pool = null;
    _poolCreatedAt = null;
  });

  _pool.on('connect', (client) => {
    console.log('[pool] New client connected to PostgreSQL', {
      timestamp: new Date().toISOString(),
      creationId,
      totalClients: _pool ? _pool.totalCount : 'unknown',
      idleClients: _pool ? _pool.idleCount : 'unknown',
      waitingClients: _pool ? _pool.waitingCount : 'unknown',
    });
  });

  _pool.on('acquire', (client) => {
    console.log('[pool] Client acquired from pool', {
      timestamp: new Date().toISOString(),
      creationId,
      totalClients: _pool ? _pool.totalCount : 'unknown',
      idleClients: _pool ? _pool.idleCount : 'unknown',
      waitingClients: _pool ? _pool.waitingCount : 'unknown',
    });
  });

  _pool.on('remove', (client) => {
    console.log('[pool] Client removed from pool', {
      timestamp: new Date().toISOString(),
      creationId,
      totalClients: _pool ? _pool.totalCount : 'unknown',
      idleClients: _pool ? _pool.idleCount : 'unknown',
    });
  });

  return _pool;
}

/**
 * Wraps a pool.query() call with verbose logging (timing, errors, pool stats).
 * @param {string} label - Short identifier for the query origin (e.g. 'listAlerts')
 * @param {string|undefined} rid - Request ID for correlation (optional)
 * @param  {...any} queryArgs - Arguments passed to pool.query()
 * @returns {Promise<import('pg').QueryResult>}
 */
async function queryWithLogging(label, rid, ...queryArgs) {
  const queryStart = Date.now();
  const queryId = `${label}-${queryStart}-${Math.random().toString(36).slice(2, 8)}`;

  // Extract SQL text for logging (first arg, truncated for safety)
  const sqlText = typeof queryArgs[0] === 'string'
    ? queryArgs[0].replace(/\s+/g, ' ').slice(0, 200)
    : '(non-string query)';

  console.log('[pool:query] Executing query', {
    queryId,
    label,
    rid: rid || 'no-rid',
    sql: sqlText,
    paramCount: Array.isArray(queryArgs[1]) ? queryArgs[1].length : 0,
    timestamp: new Date().toISOString(),
    poolStats: _pool ? {
      totalClients: _pool.totalCount,
      idleClients: _pool.idleCount,
      waitingClients: _pool.waitingCount,
    } : 'pool-not-initialized',
  });

  try {
    const result = await getPool().query(...queryArgs);
    const durationMs = Date.now() - queryStart;

    console.log('[pool:query] Query succeeded', {
      queryId,
      label,
      rid: rid || 'no-rid',
      durationMs,
      rowCount: result?.rowCount,
      rows: result?.rows?.length,
      command: result?.command,
    });

    return result;
  } catch (queryErr) {
    const durationMs = Date.now() - queryStart;

    console.error('[pool:query] Query FAILED', {
      queryId,
      label,
      rid: rid || 'no-rid',
      durationMs,
      sql: sqlText,
      error: {
        name: queryErr?.name,
        message: queryErr?.message,
        code: queryErr?.code,
        errno: queryErr?.errno,
        syscall: queryErr?.syscall,
        address: queryErr?.address,
        port: queryErr?.port,
        detail: queryErr?.detail,
        hint: queryErr?.hint,
        position: queryErr?.position,
        severity: queryErr?.severity,
        routine: queryErr?.routine,
      },
      poolStats: _pool ? {
        totalClients: _pool.totalCount,
        idleClients: _pool.idleCount,
        waitingClients: _pool.waitingCount,
      } : 'pool-destroyed',
    });

    throw queryErr;
  }
}

/**
 * Wraps a pool.connect() call with verbose logging.
 * @param {string} label - Short identifier for the connection purpose
 * @param {string|undefined} rid - Request ID for correlation (optional)
 * @returns {Promise<import('pg').PoolClient>}
 */
async function connectWithLogging(label, rid) {
  const connectStart = Date.now();

  console.log('[pool:connect] Acquiring client from pool', {
    label,
    rid: rid || 'no-rid',
    timestamp: new Date().toISOString(),
    poolStats: _pool ? {
      totalClients: _pool.totalCount,
      idleClients: _pool.idleCount,
      waitingClients: _pool.waitingCount,
    } : 'pool-not-initialized',
  });

  try {
    const client = await getPool().connect();
    const durationMs = Date.now() - connectStart;

    console.log('[pool:connect] Client acquired successfully', {
      label,
      rid: rid || 'no-rid',
      durationMs,
      poolStats: _pool ? {
        totalClients: _pool.totalCount,
        idleClients: _pool.idleCount,
        waitingClients: _pool.waitingCount,
      } : 'unknown',
    });

    return client;
  } catch (connectErr) {
    const durationMs = Date.now() - connectStart;

    console.error('[pool:connect] FAILED to acquire client', {
      label,
      rid: rid || 'no-rid',
      durationMs,
      config: getPoolConfigSummary(),
      error: {
        name: connectErr?.name,
        message: connectErr?.message,
        code: connectErr?.code,
        errno: connectErr?.errno,
        syscall: connectErr?.syscall,
        address: connectErr?.address,
        port: connectErr?.port,
      },
      poolStats: _pool ? {
        totalClients: _pool.totalCount,
        idleClients: _pool.idleCount,
        waitingClients: _pool.waitingCount,
      } : 'pool-destroyed',
    });

    throw connectErr;
  }
}

// Proxy object: behaves exactly like the old `pool` export
// but creates the connection lazily on first .query() or .connect() call.
// Standard query/connect go through the raw pool for backward compat;
// the logged variants are available as additional exports.
const poolProxy = {
  query: (...args) => getPool().query(...args),
  connect: (...args) => getPool().connect(...args),
  end: (...args) => getPool().end(...args),
  on: (...args) => getPool().on(...args),
};

module.exports = poolProxy;

// Additional named exports for logged variants
module.exports.queryWithLogging = queryWithLogging;
module.exports.connectWithLogging = connectWithLogging;
module.exports.getPoolConfigSummary = getPoolConfigSummary;
