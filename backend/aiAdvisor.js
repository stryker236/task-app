const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const STATUSES = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
const RELATION_TYPES = ['blocks', 'blocked_by', 'relates_to', 'duplicates', 'parent_of', 'child_of'];
const AI_COMMAND_TYPES = ['update_task', 'add_relation', 'create_task'];

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const nullableBoolean = { anyOf: [{ type: 'boolean' }, { type: 'null' }] };
const nullableStringArray = {
  anyOf: [
    { type: 'array', items: { type: 'string' } },
    { type: 'null' }
  ]
};

const taskPatchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: nullableString,
    notes: nullableString,
    priority: { anyOf: [{ type: 'integer', enum: [1, 2, 3, 4] }, { type: 'null' }] },
    status: { anyOf: [{ type: 'string', enum: STATUSES }, { type: 'null' }] },
    dueDateTime: nullableString,
    estimatedMinutes: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    isFavorite: nullableBoolean,
    tags: nullableStringArray,
    blockedByTaskIds: nullableStringArray
  },
  required: ['title', 'notes', 'priority', 'status', 'dueDateTime', 'estimatedMinutes', 'isFavorite', 'tags', 'blockedByTaskIds']
};

const taskCreateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    notes: nullableString,
    priority: { anyOf: [{ type: 'integer', enum: [1, 2, 3, 4] }, { type: 'null' }] },
    status: { anyOf: [{ type: 'string', enum: STATUSES }, { type: 'null' }] },
    dueDateTime: nullableString,
    estimatedMinutes: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    isFavorite: nullableBoolean,
    tags: nullableStringArray,
    blockedByTaskIds: nullableStringArray
  },
  required: ['title', 'notes', 'priority', 'status', 'dueDateTime', 'estimatedMinutes', 'isFavorite', 'tags', 'blockedByTaskIds']
};

const advisorCommandResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    commands: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: AI_COMMAND_TYPES },
          label: { type: 'string' },
          reason: { type: 'string' },
          taskId: nullableString,
          relatedTaskId: nullableString,
          relationType: { anyOf: [{ type: 'string', enum: RELATION_TYPES }, { type: 'null' }] },
          patch: { anyOf: [taskPatchSchema, { type: 'null' }] },
          task: { anyOf: [taskCreateSchema, { type: 'null' }] }
        },
        required: ['id', 'type', 'label', 'reason', 'taskId', 'relatedTaskId', 'relationType', 'patch', 'task']
      }
    }
  },
  required: ['summary', 'commands']
};

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

function createCommandContextTask(task) {
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
    relations: task.relations,
    checklistItems: task.checklistItems.map((item) => ({
      title: item.title,
      isDone: item.isDone
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

async function generateTaskAdvisorCommands({ message, tasks, tags = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is required to generate AI Advisor commands');
    error.status = 503;
    throw error;
  }

  const activeTasks = tasks
    .filter((task) => !task.isArchived)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 80)
    .map(createCommandContextTask);

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
          'For update_task, only include fields that materially improve the card.',
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
          userRequest: message,
          allowedCommands: AI_COMMAND_TYPES,
          allowedStatuses: STATUSES,
          allowedPriorities: [1, 2, 3, 4],
          allowedRelationTypes: RELATION_TYPES,
          availableTags: tags.map((tag) => tag.name || tag).slice(0, 200),
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
  generateTaskAdvisorAdvice,
  generateTaskAdvisorCommands,
  buildRuleBasedAdvisorAdvice
};
