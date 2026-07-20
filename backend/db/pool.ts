const { Pool } = require('pg');
const { logger } = require('../logger');

import type { Pool as PgPool } from 'pg';

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is required. Copy .env.example to .env and add the Supabase PostgreSQL connection string.');
}

const pool: PgPool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
	max: Number(process.env.DATABASE_POOL_MAX || 10),
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 10_000
});

const rawPoolQuery = pool.query.bind(pool);
(pool as any).query = async (...args: any[]) => {
	const startedAt = Date.now();
	try {
		const result = await rawPoolQuery(...args as [any]);
		const durationMs = Date.now() - startedAt;
		if (durationMs >= Number(process.env.DB_SLOW_QUERY_MS || 250)) {
			logger.warn('db.query.slow', {
				durationMs,
				metadata: { rowCount: result?.rowCount ?? null }
			});
		}
		return result;
	} catch (error) {
		logger.error('db.query.failed', {
			durationMs: Date.now() - startedAt,
			metadata: { message: error instanceof Error ? error.message : String(error) }
		});
		throw error;
	}
};

pool.on('error', (error) => logger.error('db.pool.error', { metadata: { message: error.message } }));

module.exports = {
	pool
};

export {};
