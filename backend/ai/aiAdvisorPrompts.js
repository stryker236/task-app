const { AI_COMMAND_TYPES, ADVISOR_ACTIONS } = require('../constants/aiConstants');
const { RELATION_TYPES, STATUSES, advisorCommandResponseSchema } = require('./aiSchemas');
const { buildTaskDateContext, advisorStatusPriority, createCommandContextTask } = require('./aiAdvisorContext');

function resolveAdvisorAction(action) {
  const key = typeof action === 'string' ? action.trim() : '';
  return ADVISOR_ACTIONS[key] ? { key, ...ADVISOR_ACTIONS[key] } : null;
}

function buildAdvisorCommandRequest({ action, tasks, tags = [] }) {
  const advisorAction = resolveAdvisorAction(action);
  if (!advisorAction) {
    const error = new Error(`Unsupported advisor action: ${action}`);
    error.status = 400;
    error.details = [`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`];
    throw error;
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const activeTasks = tasks
    .filter((task) => !task.isArchived && ['new', 'in_progress', 'waiting'].includes(task.status))
    .sort((a, b) => {
      const statusDifference = advisorStatusPriority(a.status) - advisorStatusPriority(b.status);
      if (statusDifference) return statusDifference;
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    })
    .slice(0, 160)
    .map((task) => createCommandContextTask(task, tasksById));

  return {
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
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
}

function buildAdvisorAdviceRequest({ tasks, limit }) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const activeTasks = tasks
    .filter((task) => !task.isArchived && !['done', 'cancelled'].includes(task.status))
    .sort((a, b) => {
      const priorityDifference = advisorStatusPriority(a.status) - advisorStatusPriority(b.status);
      if (priorityDifference) return priorityDifference;
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    })
    .slice(0, 30)
    .map((task) => createCommandContextTask(task, tasksById));

  return {
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
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
}

module.exports = {
  resolveAdvisorAction,
  buildAdvisorCommandRequest,
  buildAdvisorAdviceRequest
};
