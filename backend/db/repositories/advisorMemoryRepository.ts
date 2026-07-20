const { mergeAdvisorMemoryRulePayload } = require('../../ai/advisorMemory');
const { mapAdvisorMemoryRule } = require('../mappers');
const { pool } = require('../pool');

import type { DbRow, Queryable } from '../types';

async function fetchAdvisorMemoryRules(db: Queryable = pool, limit: number = 80) {
	const safeLimit = Math.min(1000, Math.floor(Number(limit) || 80));
	const result = await db.query(
		`SELECT *
		 FROM advisor_memory_rules
		 ORDER BY last_feedback_at DESC, support_count DESC
		 LIMIT $1`,
		[safeLimit]
	);
	return result.rows.map(mapAdvisorMemoryRule);
}

async function saveAdvisorFeedback(db: Queryable, feedback: DbRow) {
	const result = await db.query(
		`INSERT INTO advisor_feedback
		 (action, command_id, command_type, task_id, task_title, title_fingerprint, feedback, command_preview, raw_command)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
		 RETURNING *`,
		[
			feedback.action,
			feedback.commandId,
			feedback.commandType,
			feedback.taskId || null,
			feedback.taskTitle || null,
			feedback.titleFingerprint || '',
			JSON.stringify(feedback.feedback || {}),
			JSON.stringify(feedback.commandPreview || {}),
			feedback.rawCommand ? JSON.stringify(feedback.rawCommand) : null
		]
	);
	return result.rows[0];
}

async function upsertAdvisorMemoryRule(db: Queryable, memoryRule: DbRow) {
	const existing = await db.query(
		`SELECT *
		 FROM advisor_memory_rules
		 WHERE rule_type = $1
		   AND title_fingerprint = $2
		   AND action = $3
		 FOR UPDATE`,
		[
			memoryRule.ruleType,
			memoryRule.titleFingerprint || '',
			memoryRule.action || ''
		]
	);

	if (existing.rows[0]) {
		const mergedRule = mergeAdvisorMemoryRulePayload(existing.rows[0].rule || {}, memoryRule.rule || {});
		const updated = await db.query(
			`UPDATE advisor_memory_rules
			 SET rule = $2::jsonb,
			     support_count = support_count + 1,
			     last_feedback_at = now(),
			     updated_at = now()
			 WHERE id = $1
			 RETURNING *`,
			[
				existing.rows[0].id,
				JSON.stringify(mergedRule)
			]
		);
		return mapAdvisorMemoryRule(updated.rows[0]);
	}

	const result = await db.query(
		`INSERT INTO advisor_memory_rules (rule_type, title_fingerprint, action, rule, support_count, last_feedback_at)
		 VALUES ($1, $2, $3, $4::jsonb, 1, now())
		 RETURNING *`,
		[
			memoryRule.ruleType,
			memoryRule.titleFingerprint || '',
			memoryRule.action || '',
			JSON.stringify(memoryRule.rule || {})
		]
	);
	return mapAdvisorMemoryRule(result.rows[0]);
}

async function updateAdvisorMemoryRule(db: Queryable = pool, id: string, rule: Record<string, unknown>) {
	const result = await db.query(
		`UPDATE advisor_memory_rules
		 SET rule = $2::jsonb,
		     updated_at = now()
		 WHERE id = $1
		 RETURNING *`,
		[id, JSON.stringify(rule || {})]
	);
	return result.rows[0] ? mapAdvisorMemoryRule(result.rows[0]) : null;
}

async function deleteAdvisorMemoryRule(db: Queryable = pool, id: string) {
	const result = await db.query('DELETE FROM advisor_memory_rules WHERE id = $1', [id]);
	return result.rowCount > 0;
}

module.exports = {
	fetchAdvisorMemoryRules,
	saveAdvisorFeedback,
	upsertAdvisorMemoryRule,
	updateAdvisorMemoryRule,
	deleteAdvisorMemoryRule
};

export { };
