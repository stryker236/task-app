const { pool } = require('../pool');
const { mapQuickQueueItem } = require('../mappers');

import type { QuickQueueItem } from '../../../shared/types';
import type { Queryable, QueryPatch } from '../types';

async function fetchQuickQueueItems(db: Queryable = pool): Promise<QuickQueueItem[]> {
	const result = await db.query('SELECT * FROM quick_queue_items ORDER BY position ASC, created_at ASC');
	return result.rows.map(mapQuickQueueItem);
}

async function createQuickQueueItem(db: Queryable, text: string, placement = 'bottom') {
	const insertAtTop = placement === 'top';
	if (insertAtTop) {
		await db.query('UPDATE quick_queue_items SET position = position + 1');
	}
	const result = await db.query(
		`INSERT INTO quick_queue_items (text, position)
     VALUES ($1, ${insertAtTop ? '0' : 'COALESCE((SELECT max(position) + 1 FROM quick_queue_items), 0)'})
     RETURNING *`,
		[text]
	);
	return mapQuickQueueItem(result.rows[0]);
}

async function updateQuickQueueItem(db: Queryable, id: string, patch: QueryPatch): Promise<QuickQueueItem | null> {
	const result = await db.query(
		`UPDATE quick_queue_items
     SET text = COALESCE($2, text),
         is_done = COALESCE($3, is_done)
     WHERE id = $1
     RETURNING *`,
		[id, patch.text ?? null, typeof patch.done === 'boolean' ? patch.done : null]
	);
	return result.rows[0] ? mapQuickQueueItem(result.rows[0]) : null;
}

async function deleteQuickQueueItem(db: Queryable, id: string) {
	const result = await db.query('DELETE FROM quick_queue_items WHERE id = $1', [id]);
	return result.rowCount > 0;
}

async function clearDoneQuickQueueItems(db: Queryable) {
	await db.query('DELETE FROM quick_queue_items WHERE is_done = true');
	return fetchQuickQueueItems(db);
}

async function moveQuickQueueItem(db: Queryable, id: string, direction: number): Promise<QuickQueueItem[] | null> {
	const items = await fetchQuickQueueItems(db);
	const index = items.findIndex((item) => item.id === id);
	const targetIndex = index + direction;
	if (index < 0) return null;
	if (targetIndex < 0 || targetIndex >= items.length) return items;
	const current = items[index];
	const target = items[targetIndex];
	await db.query('UPDATE quick_queue_items SET position = $2 WHERE id = $1', [current.id, target.position]);
	await db.query('UPDATE quick_queue_items SET position = $2 WHERE id = $1', [target.id, current.position]);
	return fetchQuickQueueItems(db);
}

async function reorderQuickQueueItems(db: Queryable, ids: string[]): Promise<QuickQueueItem[] | null> {
	const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
	const items = await fetchQuickQueueItems(db);
	if (uniqueIds.length !== items.length) return null;
	const existingIds = new Set(items.map((item) => item.id));
	if (uniqueIds.some((id) => !existingIds.has(id))) return null;
	for (const [position, id] of uniqueIds.entries()) {
		await db.query('UPDATE quick_queue_items SET position = $2 WHERE id = $1', [id, position]);
	}
	return fetchQuickQueueItems(db);
}

module.exports = {
	fetchQuickQueueItems,
	createQuickQueueItem,
	updateQuickQueueItem,
	deleteQuickQueueItem,
	clearDoneQuickQueueItems,
	moveQuickQueueItem,
	reorderQuickQueueItems
};

export {};
