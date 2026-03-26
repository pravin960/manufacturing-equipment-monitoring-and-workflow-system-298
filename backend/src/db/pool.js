const { Pool } = require('pg');

/**
 * Database connection pool.
 *
 * Uses POSTGRES_URL if provided, otherwise uses discrete POSTGRES_* variables.
 * Never hardcode credentials here; configure via environment.
 */
const pool = new Pool(
  process.env.POSTGRES_URL
    ? {
        connectionString: process.env.POSTGRES_URL,
        max: process.env.POSTGRES_POOL_MAX ? Number(process.env.POSTGRES_POOL_MAX) : 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }
    : {
        host: process.env.POSTGRES_HOST,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
        port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : 5432,
        max: process.env.POSTGRES_POOL_MAX ? Number(process.env.POSTGRES_POOL_MAX) : 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL idle client error', err);
});

module.exports = pool;