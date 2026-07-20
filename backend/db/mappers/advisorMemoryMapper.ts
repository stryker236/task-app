const { iso } = require('../../utils/date');

import type { DbRow } from '../types';

function mapAdvisorMemoryRule(row: DbRow) {
	return {
		id: String(row.id),
		ruleType: row.rule_type,
		titleFingerprint: row.title_fingerprint,
		action: row.action,
		rule: row.rule || {},
		supportCount: row.support_count,
		lastFeedbackAt: iso(row.last_feedback_at),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

module.exports = { mapAdvisorMemoryRule };

export {};

