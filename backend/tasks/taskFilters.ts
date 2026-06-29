const { SORT_FIELDS } = require('../constants/taskConstants');
const { containsText } = require('../utils/string');

type TaskLike = Record<string, any>;
type QueryLike = Record<string, any>;
type HttpError = Error & { status: number };

function getLocalDayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function filterTasksByQuery(tasks: TaskLike[], query: QueryLike) {
  let result = [...tasks];
  if (query.archived === 'true') result = result.filter((task) => task.isArchived);
  else if (query.includeArchived !== 'true') result = result.filter((task) => !task.isArchived);
  const active = (task: TaskLike) => !['done', 'cancelled'].includes(task.status);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  if (query.status) result = result.filter((task) => task.status === query.status);
  if (query.priority) result = result.filter((task) => task.priority === Number(query.priority));
  if (query.requestedBy) result = result.filter((task) => containsText(task.requestedBy, query.requestedBy.toLocaleLowerCase()));
  if (query.needToAsk) result = result.filter((task) => task.needToAsk.some((name) => containsText(name, query.needToAsk.toLocaleLowerCase())));
  if (query.tag) {
    const selectedTags = (Array.isArray(query.tag) ? query.tag : [query.tag])
      .map((tag) => String(tag).trim().toLocaleLowerCase())
      .filter(Boolean);
    const tagMode = query.tagMode === 'or' ? 'or' : 'and';
    result = result.filter((task) => {
      const taskTags = new Set(task.tags.map((tag) => tag.toLocaleLowerCase()));
      return tagMode === 'or'
        ? selectedTags.some((tag) => taskTags.has(tag))
        : selectedTags.every((tag) => taskTags.has(tag));
    });
  }
  if (query.noDueDate === 'true') result = result.filter((task) => !task.dueDateTime);
  if (query.favoriteOnly === 'true') result = result.filter((task) => task.isFavorite);
  if (query.hideBlocked === 'true') {
    result = result.filter((task) => (
      !task.blockedByTaskIds.some((id) => tasksById.get(id)?.status !== 'done')
      && !task.checklistItems.some((item) => !item.isDone)
    ));
  }
  if (query.hideDone === 'true') result = result.filter((task) => task.status !== 'done');
  if (query.hideCancelled === 'true') result = result.filter((task) => task.status !== 'cancelled');
  const { start, end } = getLocalDayBounds();
  if (query.today === 'true') result = result.filter((task) => task.dueDateTime && new Date(task.dueDateTime) >= start && new Date(task.dueDateTime) < end);
  if (query.overdue === 'true') result = result.filter((task) => task.dueDateTime && new Date(task.dueDateTime) < new Date() && active(task));
  if (query.search) {
    const term = query.search.toLocaleLowerCase();
    result = result.filter((task) => [
      task.title, task.notes, task.requestedBy, task.blockedReason,
      ...task.needToAsk, ...task.tags, ...task.activityLog.map((entry) => entry.message)
    ].some((value) => containsText(value, term)));
  }
  if (query.sort) {
    if (!SORT_FIELDS.includes(query.sort)) {
      const error = new Error(`sort must be one of: ${SORT_FIELDS.join(', ')}`) as HttpError;
      error.status = 400;
      throw error;
    }
    const field = query.sort;
    result.sort((a, b) => {
      if (field === 'priority') return b.priority - a.priority;
      if (['dueDateTime', 'createdAt', 'updatedAt'].includes(field)) {
        if (!a[field]) return 1;
        if (!b[field]) return -1;
        return new Date(a[field]).getTime() - new Date(b[field]).getTime();
      }
      return String(a[field] || '').localeCompare(String(b[field] || ''), 'pt');
    });
  }
  return result;
}

module.exports = { filterTasksByQuery };

export {};
