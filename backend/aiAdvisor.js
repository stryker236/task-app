const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

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
  buildRuleBasedAdvisorAdvice
};
