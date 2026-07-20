const { iso } = require('../../utils/date');
const { pool } = require('../pool');
const {
	mapSchedulerConstraint,
	mapSchedulerConstraintType,
	mapSchedulerReservedBlock,
	mapSchedulerRule
} = require('../mappers');

import type {
	Queryable,
	SchedulerConstraintInput,
	SchedulerReservedBlockInput,
	SchedulerRuleInput
} from '../types';

async function fetchSchedulerRules(db: Queryable = pool) {
	const ruleRows = (await db.query('SELECT * FROM scheduler_rules ORDER BY created_at DESC')).rows;
	if (!ruleRows.length) return [];
	const ruleIds = ruleRows.map((row) => String(row.id));
	const constraintRows = (await db.query(
		`SELECT * FROM scheduler_constraints
		 WHERE rule_id = ANY($1::uuid[])
		 ORDER BY created_at ASC`,
		[ruleIds]
	)).rows;
	const constraintsByRule = new Map();
	for (const row of constraintRows) {
		const ruleId = String(row.rule_id);
		constraintsByRule.set(ruleId, [...(constraintsByRule.get(ruleId) || []), mapSchedulerConstraint(row)]);
	}
	return ruleRows.map((row) => mapSchedulerRule(row, constraintsByRule.get(String(row.id)) || []));
}

async function fetchActiveSchedulerRules(db: Queryable = pool) {
	const rules = await fetchSchedulerRules(db);
	return rules
		.map((rule) => ({
			...rule,
			constraints: rule.constraints.filter((constraint) => constraint.enabled)
		}))
		.filter((rule) => rule.enabled && rule.status === 'active' && rule.constraints.length);
}

async function fetchSchedulerConstraintTypes(db: Queryable = pool, { enabledOnly = false }: { enabledOnly?: boolean } = {}) {
	const result = await db.query(
		`SELECT *
		 FROM scheduler_constraint_types
		 WHERE ($1::boolean = false OR enabled = true)
		 ORDER BY category, type`,
		[Boolean(enabledOnly)]
	);
	return result.rows.map(mapSchedulerConstraintType);
}

async function findSchedulerRuleById(db: Queryable = pool, id: string) {
	const rules = await fetchSchedulerRules(db);
	return rules.find((rule) => rule.id === id) || null;
}

async function replaceSchedulerConstraints(db: Queryable, ruleId: string, constraints: SchedulerConstraintInput[] = []) {
	await db.query('DELETE FROM scheduler_constraints WHERE rule_id = $1', [ruleId]);
	for (const constraint of constraints) {
		await db.query(
			`INSERT INTO scheduler_constraints (rule_id, type, scope, payload, hard, enabled)
			 VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
			[
				ruleId,
				constraint.type,
				JSON.stringify(constraint.scope || {}),
				JSON.stringify(constraint.payload || {}),
				constraint.hard !== false,
				constraint.enabled !== false
			]
		);
	}
}

async function createSchedulerRule(db: Queryable, input: SchedulerRuleInput) {
	const result = await db.query(
		`INSERT INTO scheduler_rules (text, interpretation, status, enabled, confidence, model, raw_response)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
		 RETURNING *`,
		[
			input.text,
			input.interpretation || '',
			input.status || 'draft',
			input.enabled === true,
			input.confidence ?? null,
			input.model || null,
			input.rawResponse ? JSON.stringify(input.rawResponse) : null
		]
	);
	const ruleId = String(result.rows[0].id);
	await replaceSchedulerConstraints(db, ruleId, input.constraints || []);
	return findSchedulerRuleById(db, ruleId);
}

async function updateSchedulerRule(db: Queryable, id: string, patch: Partial<SchedulerRuleInput>) {
	const result = await db.query(
		`UPDATE scheduler_rules
		 SET text = COALESCE($2, text),
		     interpretation = COALESCE($3, interpretation),
		     status = COALESCE($4, status),
		     enabled = COALESCE($5, enabled),
		     confidence = COALESCE($6, confidence),
		     model = COALESCE($7, model),
		     raw_response = COALESCE($8::jsonb, raw_response),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING *`,
		[
			id,
			patch.text ?? null,
			patch.interpretation ?? null,
			patch.status ?? null,
			typeof patch.enabled === 'boolean' ? patch.enabled : null,
			patch.confidence ?? null,
			patch.model ?? null,
			patch.rawResponse ? JSON.stringify(patch.rawResponse) : null
		]
	);
	if (!result.rows[0]) return null;
	if (Array.isArray(patch.constraints)) await replaceSchedulerConstraints(db, id, patch.constraints);
	return findSchedulerRuleById(db, id);
}

async function deleteSchedulerRule(db: Queryable = pool, id: string) {
	const result = await db.query('DELETE FROM scheduler_rules WHERE id = $1', [id]);
	return result.rowCount > 0;
}

async function fetchCommittedSchedulerReservedBlocks(db: Queryable = pool) {
	const result = await db.query(
		`SELECT scheduler_reserved_blocks.*
		 FROM scheduler_reserved_blocks
		 JOIN scheduler_schedule_batches ON scheduler_schedule_batches.id = scheduler_reserved_blocks.batch_id
		 WHERE scheduler_schedule_batches.status = 'committed'
		 ORDER BY scheduler_reserved_blocks.start_at`
	);
	return result.rows.map(mapSchedulerReservedBlock);
}

async function createSchedulerScheduleBatch(db: Queryable, { source = 'advisor', reservedBlocks = [] }: { source?: string; reservedBlocks?: SchedulerReservedBlockInput[] }) {
	const batch = await db.query(
		`INSERT INTO scheduler_schedule_batches (status, source, committed_at)
		 VALUES ('committed', $1, now())
		 RETURNING *`,
		[source]
	);
	const batchId = String(batch.rows[0].id);
	for (const block of reservedBlocks) {
		await db.query(
			`INSERT INTO scheduler_reserved_blocks (batch_id, type, start_at, end_at, reason, source_rule_id, source_constraint_id)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[
				batchId,
				block.type || 'break',
				block.start,
				block.end,
				block.reason || '',
				block.sourceRuleId || null,
				block.sourceConstraintId || null
			]
		);
	}
	return {
		id: batchId,
		status: batch.rows[0].status,
		source: batch.rows[0].source,
		committedAt: iso(batch.rows[0].committed_at),
		reservedBlocks: reservedBlocks.length
			? await fetchCommittedSchedulerReservedBlocks(db).then((blocks) => blocks.filter((block: any) => block.batchId === batchId))
			: []
	};
}

module.exports = {
	fetchSchedulerRules,
	fetchActiveSchedulerRules,
	fetchSchedulerConstraintTypes,
	findSchedulerRuleById,
	createSchedulerRule,
	updateSchedulerRule,
	deleteSchedulerRule,
	fetchCommittedSchedulerReservedBlocks,
	createSchedulerScheduleBatch
};

export {};
