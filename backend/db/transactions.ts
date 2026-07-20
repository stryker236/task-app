const { logger } = require('../logger');
const { pool } = require('./pool');

import type { PoolClient } from 'pg';

async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await pool.connect();
	const startedAt = Date.now();
	try {
		logger.info('db.transaction.started');
		await client.query('BEGIN');
		const result = await work(client);
		await client.query('COMMIT');
		logger.info('db.transaction.committed', { durationMs: Date.now() - startedAt });
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		logger.error('db.transaction.rolled_back', {
			durationMs: Date.now() - startedAt,
			metadata: { message: error instanceof Error ? error.message : String(error) }
		});
		throw error;
	} finally {
		client.release();
	}
}

module.exports = {
	withTransaction
};

export {};
