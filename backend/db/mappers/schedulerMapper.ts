const { iso } = require('../../utils/date');

import type { DbRow } from '../types';

function mapSchedulerConstraint(row: DbRow) {
	return {
		id: String(row.id),
		ruleId: String(row.rule_id),
		type: row.type,
		scope: row.scope || {},
		payload: row.payload || {},
		hard: Boolean(row.hard),
		enabled: Boolean(row.enabled),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapSchedulerRule(row: DbRow, constraints = []) {
	return {
		id: String(row.id),
		text: row.text,
		interpretation: row.interpretation || '',
		status: row.status,
		enabled: Boolean(row.enabled),
		confidence: row.confidence == null ? null : Number(row.confidence),
		model: row.model || null,
		rawResponse: row.raw_response || null,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
		constraints
	};
}

function mapSchedulerConstraintType(row: DbRow) {
	return {
		type: row.type,
		label: row.label,
		description: row.description,
		category: row.category,
		scopeSchema: row.scope_schema || {},
		payloadSchema: row.payload_schema || {},
		examples: Array.isArray(row.examples) ? row.examples : [],
		supportsHard: Boolean(row.supports_hard),
		defaultHard: Boolean(row.default_hard),
		enabled: Boolean(row.enabled),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapSchedulerReservedBlock(row: DbRow) {
	return {
		id: String(row.id),
		batchId: String(row.batch_id),
		type: row.type,
		start: iso(row.start_at),
		end: iso(row.end_at),
		reason: row.reason || '',
		sourceRuleId: row.source_rule_id ? String(row.source_rule_id) : null,
		sourceConstraintId: row.source_constraint_id ? String(row.source_constraint_id) : null,
		createdAt: iso(row.created_at)
	};
}

module.exports = {
	mapSchedulerConstraint,
	mapSchedulerConstraintType,
	mapSchedulerReservedBlock,
	mapSchedulerRule
};

export {};

