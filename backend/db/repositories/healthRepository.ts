const { pool } = require('../pool');

async function checkConnection() {
	const result = await pool.query('SELECT current_database() AS database, now() AS time');
	return result.rows[0];
}

module.exports = {
	checkConnection
};

export {};
