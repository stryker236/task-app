const STATUSES = ['new', 'in_progress', 'waiting', 'done', 'cancelled'] as const;
const RELATION_TYPES = ['blocks', 'blocked_by', 'relates_to', 'duplicates', 'parent_of', 'child_of'] as const;
const SORT_FIELDS = ['priority', 'dueDateTime', 'createdAt', 'updatedAt', 'requestedBy', 'status'] as const;

type TaskStatus = (typeof STATUSES)[number];
type RelationType = (typeof RELATION_TYPES)[number];
type SortField = (typeof SORT_FIELDS)[number];

module.exports = {
  STATUSES,
  RELATION_TYPES,
  SORT_FIELDS
};

export type { TaskStatus, RelationType, SortField };
