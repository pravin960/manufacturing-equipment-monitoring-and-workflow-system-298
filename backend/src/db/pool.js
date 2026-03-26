// backend/src/db/pool.js
//
// FIX: Pool is now created lazily (on first use) instead of at module load time.
// This means a missing/unreachable DB will NOT crash the app on startup.
// Routes will still load correctly, and only actual DB calls will fail gracefully.

const { Pool } = require('pg');

let _pool = null;

function getPool() {
  if (_pool) return _pool;

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

  _pool.on('error', (err) => {
    console.error('[pool] Unexpected PostgreSQL idle client error:', err.message);
    // Reset pool so next call recreates it
    _pool = null;
  });

  return _pool;
}

// Proxy object: behaves exactly like the old `pool` export
// but creates the connection lazily on first .query() or .connect() call.
const poolProxy = {
  query: (...args) => getPool().query(...args),
  connect: (...args) => getPool().connect(...args),
  end: (...args) => getPool().end(...args),
  on: (...args) => getPool().on(...args),
};

module.exports = poolProxy;