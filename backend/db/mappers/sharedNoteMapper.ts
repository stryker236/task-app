const { iso } = require('../../utils/date');

import type { DbRow } from '../types';

function mapSharedNote(row: DbRow) {
	return {
		id: String(row.id),
		title: row.title,
		body: row.body,
		tags: row.tags || [],
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
		archivedAt: iso(row.archived_at)
	};
}

module.exports = { mapSharedNote };

export {};

