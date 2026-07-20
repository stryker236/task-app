const {
  TASK_STATUSES,
  TASK_RELATION_TYPES,
  TASK_SORT_FIELDS
} = require('../../shared/types/task');

const STATUSES = TASK_STATUSES;
const RELATION_TYPES = TASK_RELATION_TYPES;
const SORT_FIELDS = TASK_SORT_FIELDS;

type TaskStatus = (typeof TASK_STATUSES)[number];
type RelationType = (typeof TASK_RELATION_TYPES)[number];
type SortField = (typeof TASK_SORT_FIELDS)[number];

module.exports = {
  STATUSES,
  RELATION_TYPES,
  SORT_FIELDS
};

export type { TaskStatus, RelationType, SortField };
