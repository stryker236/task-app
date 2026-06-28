const STATUSES = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
const RELATION_TYPES = ['blocks', 'blocked_by', 'relates_to', 'duplicates', 'parent_of', 'child_of'];
const SORT_FIELDS = ['priority', 'dueDateTime', 'createdAt', 'updatedAt', 'requestedBy', 'status'];

module.exports = {
  STATUSES,
  RELATION_TYPES,
  SORT_FIELDS
};
