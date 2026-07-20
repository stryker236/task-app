const { iso } = require('../../utils/date');

import type { DbRow } from '../types';

function mapQuickQueueItem(row: DbRow) {
	return {
		id: String(row.id),
		text: row.text,
		done: row.is_done,
		position: row.position,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

module.exports = { mapQuickQueueItem };

export {};

