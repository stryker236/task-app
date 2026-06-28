const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const {
  AI_COMMAND_TYPES,
  RELATION_TYPES,
  STATUSES,
  advisorCommandResponseSchema
} = require('./aiSchemas');

const ADVISOR_ACTIONS = {
  improve_tasks: {
    label: 'Improve tasks',
    instruction: 'Improve active cards without changing titles, notes, history, status, favorite, or estimates unless truly necessary. Focus on tags, due dates, checklist, dependencies, related cards, and priority.'
  },
  suggest_tags: {
    label: 'Suggest tags',
    instruction: 'Suggest tag improvements for active cards. Reuse existing tags when possible, fix inconsistent tags, and propose new tags only when clearly useful. Do not change title, notes, status, history, or estimates. If you dont propose a change dont even return the task in the output. Feel free to propose multiple tags for a single task if they are all useful and relevant. Feel free to propose a creation of a tag if make sense'
  },
  create_followups: {
    label: 'Create follow-ups',
    instruction: 'Analyze active tasks and propose follow-up tasks only when missing work is clearly separate and useful. Avoid duplicate tasks.'
  },
  organize_blockers: {
    label: 'Organize blockers',
    instruction: 'Analyze blockers, dependencies, and related cards. Propose add_relation, blockedByTaskIds, or checklist improvements when they make the work clearer. If the relation already do not propose it again. Avoid duplicate relations.'
  }
};

function resolveAdvisorAction(action) {
  const key = typeof action === 'string' ? action.trim() : '';
  return ADVISOR_ACTIONS[key] ? { key, ...ADVISOR_ACTIONS[key] } : null;
}

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

function extractOpenAiResponseText(responseBody) {
  if (typeof responseBody.output_text === 'string') return responseBody.output_text;
  return (responseBody.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .join('\n')
    .trim();
}

function removeNullProperties(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
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

function normalizeAdvisorCommands(parsed) {
  const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    commands: commands.map((command, index) => {
      const type = command.type;
      const base = {
        id: command.id || `ai_cmd_${index + 1}`,
        type,
        label: command.label || '',
        reason: command.reason || ''
      };
      if (type === 'update_task') {
        return {
          ...base,
          taskId: command.taskId,
          patch: removeNullProperties(command.patch)
        };
      }
      if (type === 'add_relation') {
        return {
          ...base,
          taskId: command.taskId,
          relatedTaskId: command.relatedTaskId,
          relationType: command.relationType
        };
      }
      if (type === 'create_task') {
        return {
          ...base,
          task: removeNullProperties(command.task)
        };
      }
      return base;
    })
  };
}

async function generateTaskAdvisorCommands({ action, tasks, tags = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is required to generate AI Advisor commands');
    error.status = 503;
    throw error;
  }
  const advisorAction = resolveAdvisorAction(action);
  if (!advisorAction) {
    const error = new Error(`Unsupported advisor action: ${action}`);
    error.status = 400;
    error.details = [`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`];
    throw error;
  }

  const tasksById = buildTaskLookup(tasks);
  const activeTasks = tasks
    .filter((task) => !task.isArchived && ['new', 'in_progress', 'waiting'].includes(task.status))
    .sort((a, b) => {
      const statusDifference = advisorStatusPriority(a.status) - advisorStatusPriority(b.status);
      if (statusDifference) return statusDifference;
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    })
    .slice(0, 160)
    .map((task) => createCommandContextTask(task, tasksById));

  const body = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content: [
          'You are the Task App AI Advisor.',
          'Return only JSON that matches the provided schema.',
          'You may propose only these command types: update_task, add_relation, create_task.',
          'Never invent task IDs. Only use task IDs from the provided task context.',
          'Never return SQL. Never delete, archive, or directly execute anything.',
          'Prefer small, useful improvements over noisy bulk edits.',
          'For update_task, normally do NOT change title, notes, history/activity, status, or favorite unless the user explicitly asks.',
          'Focus update_task proposals on: tags, dueDateTime, checklistItems, blockedByTaskIds, and priority.',
          'Do not propose estimatedMinutes by default. Only propose estimatedMinutes if the user explicitly asks for time estimates, or if the task has a concrete checklist/scope that makes the estimate defensible.',
          'If estimating time is explicitly requested, use conservative rounded values only: 15, 30, 45, 60, 90, 120, 180, 240, or 480 minutes. Never estimate vague tasks.',
          'For tags, actively suggest improvements when tags are missing, inconsistent, duplicated by meaning, too broad, or useful for filtering.',
          'Prefer reusing availableTags exactly as written. Suggest a new tag only when no existing tag fits well.',
          'Keep tag names short, lowercase when natural, and avoid one-off noise tags.',
          'Only consider active cards. The provided task context excludes done and cancelled cards.',
          'When choosing which cards to improve first, prioritize status in this order: new, in_progress, waiting.',
          'Suggest dueDateTime only when a task has no due date or the current due date is clearly wrong. Use the date context to avoid unrealistic clustering.',
          'Suggest priority increases/decreases when urgency, due date, blockers, or scope justify it.',
          'Suggest checklistItems when the task lacks concrete next steps. Preserve existing checklist items; return the complete desired checklist if changing it.',
          'Use add_relation for associated cards and relationship suggestions. Use blockedByTaskIds for concrete dependencies that prevent completion.',
          'For create_task, create only clear follow-up tasks that are missing from the existing list.',
          'For add_relation, use relationType only when the relationship is strongly supported by the task data.',
          'Do not mark tasks done unless blockers and checklist are complete.',
          'Keep reasons short and concrete.'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          today: new Date().toISOString(),
          action: advisorAction.key,
          actionLabel: advisorAction.label,
          instruction: advisorAction.instruction,
          allowedCommands: AI_COMMAND_TYPES,
          allowedStatuses: STATUSES,
          allowedPriorities: [1, 2, 3, 4],
          allowedRelationTypes: RELATION_TYPES,
          statusPriorityOrder: ['new', 'in_progress', 'waiting'],
          preferredUpdateFields: ['tags', 'dueDateTime', 'checklistItems', 'blockedByTaskIds', 'priority'],
          estimatedMinutesPolicy: {
            default: 'do_not_suggest',
            requireExplicitUserRequestOrConcreteChecklist: true,
            allowedRoundedMinutes: [15, 30, 45, 60, 90, 120, 180, 240, 480]
          },
          tagGuidelines: {
            reuseExistingTagsFirst: true,
            suggestTagsForMissingOrInconsistentTags: true,
            avoidOneOffNoiseTags: true
          },
          avoidUpdateFieldsUnlessExplicitlyAsked: ['title', 'notes', 'status', 'isFavorite'],
          availableTags: tags.map((tag) => tag.name || tag).slice(0, 200),
          dateContext: buildTaskDateContext(tasks),
          tasks: activeTasks
        })
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'task_advisor_commands',
        strict: true,
        schema: advisorCommandResponseSchema
      }
    }
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseBody.error?.message || `OpenAI request failed with ${response.status}`);

  const outputText = extractOpenAiResponseText(responseBody);
  const parsed = JSON.parse(outputText);
  return {
    generatedAt: new Date().toISOString(),
    source: 'ai',
    model: DEFAULT_MODEL,
    ...normalizeAdvisorCommands(parsed)
  };
}

function normalizeOpenAiAdvisorAdvice(parsed, fallback, model) {
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const blockers = Array.isArray(parsed.blockers) ? parsed.blockers : [];
  return {
    generatedAt: new Date().toISOString(),
    source: 'ai',
    model,
    summary: typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : fallback.summary,
    actions: actions.slice(0, fallback.actions.length || 5).map((item, index) => ({
      taskId: String(item.taskId || fallback.actions[index]?.taskId || ''),
      title: String(item.title || fallback.actions[index]?.title || ''),
      urgency: String(item.urgency || fallback.actions[index]?.urgency || 'normal'),
      reason: String(item.reason || fallback.actions[index]?.reason || ''),
      nextStep: String(item.nextStep || fallback.actions[index]?.nextStep || '')
    })).filter((item) => item.taskId && item.title),
    blockers: blockers.slice(0, 5).map((item) => ({
      taskId: String(item.taskId || ''),
      title: String(item.title || ''),
      reason: String(item.reason || ''),
      nextStep: String(item.nextStep || '')
    })).filter((item) => item.taskId && item.title)
  };
}

async function generateTaskAdvisorAdvice(tasks, limit = 5) {
  const fallback = buildRuleBasedAdvisorAdvice(tasks, limit);
  if (!process.env.OPENAI_API_KEY) {
    return { ...fallback, note: 'Set OPENAI_API_KEY to enable AI-generated advice.' };
  }

  const tasksById = buildTaskLookup(tasks);
  const activeTasks = tasks
    .filter(isActiveTask)
    .sort((a, b) => calculateTaskPriorityScore(b, new Date(), tasksById) - calculateTaskPriorityScore(a, new Date(), tasksById))
    .slice(0, 30)
    .map((task) => createCompactTaskForAdvisor(task, tasksById));

  const body = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content: 'You are a practical task planning assistant. Return only valid JSON with summary, actions, and blockers. Do not invent task ids. Keep next steps short and concrete.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          today: new Date().toISOString(),
          instruction: `Pick the top ${limit} tasks I should do next. Respect blockers and waiting status.`,
          tasks: activeTasks,
          expectedJsonShape: {
            summary: 'one short paragraph',
            actions: [{ taskId: 'uuid', title: 'task title', urgency: 'overdue|today|high|medium|normal', reason: 'why now', nextStep: 'the next concrete action' }],
            blockers: [{ taskId: 'uuid', title: 'task title', reason: 'what blocks it', nextStep: 'who or what to chase' }]
          }
        })
      }
    ],
    text: {
      format: {
        type: 'json_object'
      }
    }
  };

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseBody.error?.message || `OpenAI request failed with ${response.status}`);
    const outputText = extractOpenAiResponseText(responseBody);
    const parsed = JSON.parse(outputText);
    return normalizeOpenAiAdvisorAdvice(parsed, fallback, DEFAULT_MODEL);
  } catch (error) {
    return { ...fallback, note: `AI advice unavailable, using rules: ${error.message}` };
  }
}

module.exports = {
  ADVISOR_ACTIONS,
  generateTaskAdvisorAdvice,
  generateTaskAdvisorCommands,
  resolveAdvisorAction,
  buildRuleBasedAdvisorAdvice
};
