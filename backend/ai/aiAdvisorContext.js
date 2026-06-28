function isActiveTask(task) {
  return !['done', 'cancelled'].includes(task.status) && !task.isArchived;
}

function formatIsoDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function buildTaskLookup(tasks) {
  return new Map(tasks.map((task) => [task.id, task]));
}

function unfinishedDependencyTitles(task, tasksById) {
  return task.blockedByTaskIds
    .map((id) => tasksById.get(id))
    .filter((dependency) => dependency && dependency.status !== 'done')
    .map((dependency) => dependency.title);
}

function unfinishedChecklistTitles(task) {
  return task.checklistItems.filter((item) => !item.isDone).map((item) => item.title);
}

function calculateTaskPriorityScore(task, now, tasksById) {
  let score = task.priority * 20;
  const due = task.dueDateTime ? new Date(task.dueDateTime) : null;
  if (task.isFavorite) score += 8;
  if (task.status === 'in_progress') score += 9;
  if (task.status === 'waiting') score -= 6;
  if (due) {
    const hoursUntilDue = (due - now) / 36e5;
    if (hoursUntilDue < 0) score += 40;
    else if (hoursUntilDue <= 24) score += 25;
    else if (hoursUntilDue <= 72) score += 12;
  } else {
    score -= 4;
  }
  score -= unfinishedDependencyTitles(task, tasksById).length * 50;
  score -= unfinishedChecklistTitles(task).length * 3;
  return score;
}

function classifyTaskUrgency(task, now) {
  if (task.dueDateTime && new Date(task.dueDateTime) < now) return 'overdue';
  if (task.dueDateTime && new Date(task.dueDateTime) - now <= 24 * 36e5) return 'today';
  if (task.priority >= 4) return 'high';
  if (task.priority >= 3) return 'medium';
  return 'normal';
}

function suggestNextStepForTask(task, tasksById) {
  const dependencies = unfinishedDependencyTitles(task, tasksById);
  if (dependencies.length) return `Unblock first: ${dependencies[0]}`;
  const checklist = unfinishedChecklistTitles(task);
  if (checklist.length) return checklist[0];
  if (task.status === 'new') return 'Start the task and log the first progress note.';
  if (task.status === 'waiting') return task.needToAsk.length
    ? `Follow up with ${task.needToAsk[0]}.`
    : 'Follow up on the waiting item.';
  return 'Continue the next concrete step and update progress.';
}

function buildRuleBasedAdvisorAdvice(tasks, limit = 5) {
  const now = new Date();
  const tasksById = buildTaskLookup(tasks);
  const activeTasks = tasks.filter(isActiveTask);
  const readyTasks = activeTasks
    .map((task) => ({
      task,
      score: calculateTaskPriorityScore(task, now, tasksById),
      blockedBy: unfinishedDependencyTitles(task, tasksById)
    }))
    .filter((item) => item.blockedBy.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const waitingOrBlockedTasks = activeTasks
    .filter((task) => task.status === 'waiting' || unfinishedDependencyTitles(task, tasksById).length)
    .slice(0, 5)
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      reason: unfinishedDependencyTitles(task, tasksById).length
        ? `Blocked by ${unfinishedDependencyTitles(task, tasksById).join(', ')}`
        : 'Marked as waiting',
      nextStep: suggestNextStepForTask(task, tasksById)
    }));

  return {
    generatedAt: now.toISOString(),
    source: 'rules',
    model: null,
    summary: readyTasks.length
      ? `Focus on ${readyTasks[0].task.title} first. It has the strongest mix of urgency, priority, and readiness.`
      : 'No active ready tasks found.',
    actions: readyTasks.map(({ task, score }) => ({
      taskId: task.id,
      title: task.title,
      urgency: classifyTaskUrgency(task, now),
      reason: [
        `Priority ${task.priority}`,
        task.dueDateTime ? `due ${formatIsoDate(task.dueDateTime)}` : 'no due date',
        `score ${Math.round(score)}`
      ].join(' | '),
      nextStep: suggestNextStepForTask(task, tasksById)
    })),
    blockers: waitingOrBlockedTasks
  };
}

function createCompactTaskForAdvisor(task, tasksById) {
  const latestProgress = [...task.activityLog].reverse().find((entry) => entry.type === 'note');
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDateTime: task.dueDateTime,
    estimatedMinutes: task.estimatedMinutes,
    isFavorite: task.isFavorite,
    tags: task.tags,
    requestedBy: task.requestedBy,
    needToAsk: task.needToAsk,
    blockedBy: unfinishedDependencyTitles(task, tasksById),
    openChecklistItems: unfinishedChecklistTitles(task).slice(0, 8),
    notes: task.notes ? task.notes.slice(0, 600) : '',
    latestProgress: latestProgress?.message?.slice(0, 300) || ''
  };
}

function createCommandContextTask(task, tasksById) {
  const relationContext = task.relations.slice(0, 12).map((relation) => {
    const relatedTask = tasksById.get(relation.relatedTaskId);
    return {
      type: relation.type,
      relatedTaskId: relation.relatedTaskId,
      relatedTaskTitle: relatedTask?.title || '',
      relatedTaskStatus: relatedTask?.status || ''
    };
  });
  const blockedByContext = task.blockedByTaskIds.map((taskId) => {
    const dependency = tasksById.get(taskId);
    return {
      taskId,
      title: dependency?.title || '',
      status: dependency?.status || ''
    };
  });

  return {
    id: task.id,
    title: task.title,
    notes: task.notes ? task.notes.slice(0, 1200) : '',
    status: task.status,
    priority: task.priority,
    dueDateTime: task.dueDateTime,
    estimatedMinutes: task.estimatedMinutes,
    isFavorite: task.isFavorite,
    tags: task.tags,
    blockedByTaskIds: task.blockedByTaskIds,
    blockedBy: blockedByContext,
    relations: relationContext,
    checklistItems: task.checklistItems.map((item) => ({
      id: item.id,
      title: item.title,
      isDone: item.isDone,
      position: item.position
    })),
    latestActivity: [...task.activityLog].reverse().slice(0, 3).map((entry) => ({
      type: entry.type,
      message: entry.message.slice(0, 300),
      createdAt: entry.createdAt
    })),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function buildTaskDateContext(tasks) {
  const activeWithDueDate = tasks
    .filter((task) => !task.isArchived && !['done', 'cancelled'].includes(task.status) && task.dueDateTime)
    .sort((a, b) => new Date(a.dueDateTime) - new Date(b.dueDateTime))
    .slice(0, 80)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDateTime: task.dueDateTime,
      estimatedMinutes: task.estimatedMinutes,
      tags: task.tags
    }));

  const activeWithoutDueDate = tasks
    .filter((task) => !task.isArchived && !['done', 'cancelled'].includes(task.status) && !task.dueDateTime)
    .slice(0, 80)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes,
      tags: task.tags
    }));

  return {
    activeWithDueDate,
    activeWithoutDueDate,
    activeTaskCount: tasks.filter((task) => !task.isArchived && !['done', 'cancelled'].includes(task.status)).length
  };
}

function advisorStatusPriority(status) {
  const order = {
    new: 0,
    in_progress: 1,
    waiting: 2
  };
  return order[status] ?? 3;
}

module.exports = {
  isActiveTask,
  formatIsoDate,
  buildTaskLookup,
  unfinishedDependencyTitles,
  unfinishedChecklistTitles,
  calculateTaskPriorityScore,
  classifyTaskUrgency,
  suggestNextStepForTask,
  buildRuleBasedAdvisorAdvice,
  createCompactTaskForAdvisor,
  createCommandContextTask,
  buildTaskDateContext,
  advisorStatusPriority
};
