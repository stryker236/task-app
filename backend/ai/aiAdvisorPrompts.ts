const { AI_COMMAND_TYPES, ADVISOR_ACTIONS } = require('../constants/aiConstants');
const { RELATION_TYPES, STATUSES, advisorCommandResponseSchema } = require('./aiSchemas');
const { buildTaskDateContext, advisorStatusPriority, createCommandContextTask } = require('./aiAdvisorContext');

function resolveAdvisorAction(action) {
  const key = typeof action === 'string' ? action.trim() : '';
  return ADVISOR_ACTIONS[key] ? { key, ...ADVISOR_ACTIONS[key] } : null;
}

function dueDateSortValue(task) {
  if (!task.dueDateTime) return Number.POSITIVE_INFINITY;
  const value = new Date(task.dueDateTime).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function daySortValue(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function selectCommandContextTasks({ action, tasks, excludeTaskIds = [] }) {
  const active = tasks.filter((task) => !task.isArchived && ['new', 'in_progress', 'waiting'].includes(task.status));
  const excluded = new Set(excludeTaskIds.map(String));
  if (action === 'schedule_calendar_events') {
    return active
      .filter((task) => !(task.calendarEvents || []).length && !excluded.has(task.id))
      .sort((a, b) => {
        const priorityDifference = Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDifference) return priorityDifference;
        const statusDifference = advisorStatusPriority(a.status) - advisorStatusPriority(b.status);
        if (statusDifference) return statusDifference;
        const createdDayDifference = daySortValue(b.createdAt || b.updatedAt).localeCompare(daySortValue(a.createdAt || a.updatedAt));
        if (createdDayDifference) return createdDayDifference;
        const dueDifference = dueDateSortValue(a) - dueDateSortValue(b);
        if (dueDifference) return dueDifference;
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      })
      .slice(0, 120);
  }

  if (action === 'suggest_tags') {
    const limit = Math.max(1, Math.ceil(active.length * 0.7));
    return active
      .sort((a, b) => {
        const priorityDifference = Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDifference) return priorityDifference;
        const dueDifference = dueDateSortValue(a) - dueDateSortValue(b);
        if (dueDifference) return dueDifference;
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      })
      .slice(0, limit);
  }

  if (action === 'priority_management') {
    const now = Date.now();
    return active
      .sort((a, b) => {
        const overdueA = Math.max(0, now - dueDateSortValue(a));
        const overdueB = Math.max(0, now - dueDateSortValue(b));
        if (overdueA !== overdueB) return overdueB - overdueA;
        const ageA = now - new Date(a.createdAt || a.updatedAt || now).getTime();
        const ageB = now - new Date(b.createdAt || b.updatedAt || now).getTime();
        if (ageA !== ageB) return ageB - ageA;
        return Number(b.priority || 0) - Number(a.priority || 0);
      })
      .slice(0, 160);
  }

  if (action === 'suggest_due_dates') {
    const now = Date.now();
    return active
      .sort((a, b) => {
        const missingDueDifference = Number(!b.dueDateTime) - Number(!a.dueDateTime);
        if (missingDueDifference) return missingDueDifference;
        const overdueA = Math.max(0, now - dueDateSortValue(a));
        const overdueB = Math.max(0, now - dueDateSortValue(b));
        if (overdueA !== overdueB) return overdueB - overdueA;
        const priorityDifference = Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDifference) return priorityDifference;
        const dueDifference = dueDateSortValue(a) - dueDateSortValue(b);
        if (dueDifference) return dueDifference;
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      })
      .slice(0, 160);
  }

  return active
    .sort((a, b) => {
      const statusDifference = advisorStatusPriority(a.status) - advisorStatusPriority(b.status);
      if (statusDifference) return statusDifference;
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    })
    .slice(0, 160);
}

function buildAdvisorCommandRequest({ action, tasks, tags = [], memory = [], calendars = [], excludeTaskIds = [], maxCalendarEventCommands = 20 }) {
  const advisorAction = resolveAdvisorAction(action);
  if (!advisorAction) {
    const error = new Error(`Unsupported advisor action: ${action}`);
    (error as any).status = 400;
    (error as any).details = [`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`];
    throw error;
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const selectedTasks = selectCommandContextTasks({ action: advisorAction.key, tasks, excludeTaskIds });
  const activeTasks = selectedTasks
    .map((task) => createCommandContextTask(task, tasksById));
  function calendarRole(calendar) {
    const summary = String(calendar.summary || '').toLocaleLowerCase();
    if (calendar.primary || summary.includes('@')) {
      return 'main_email_calendar_avoid_for_this_app';
    }
    if (summary.includes('anivers')) {
      return 'special_dates_birthdays_anniversaries_only';
    }
    if (summary.includes('rotina') || summary.includes('rotine')) {
      return 'recurring_weekly_monthly_routine_tasks';
    }
    if (summary === 'aiadvisor') {
      return 'default_calendar_for_this_app';
    }
    return 'general_writable_calendar';
  }
  const availableCalendars = calendars
    .map((calendar) => ({
      id: String(calendar.id || ''),
      summary: String(calendar.summary || ''),
      description: String(calendar.description || ''),
      primary: calendar.primary === true,
      accessRole: String(calendar.accessRole || ''),
      timeZone: calendar.timeZone || null,
      appRole: calendarRole(calendar)
    }))
    .filter((calendar) => calendar.id)
    .slice(0, 50);
  const allowedCalendarIds = availableCalendars.map((calendar) => calendar.id);
  const defaultCalendar = availableCalendars.find((calendar) => calendar.summary.toLocaleLowerCase() === 'aiadvisor')
    || availableCalendars.find((calendar) => calendar.primary)
    || availableCalendars[0]
    || null;
  const defaultCalendarId = defaultCalendar?.id || 'primary';

  return {
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: [
      {
        role: 'system',
        content: [
          'You are the Task App AI Advisor.',
          'Return only JSON that matches the provided schema.',
          'You may propose only these command types: update_task, add_relation, create_task, create_calendar_event.',
          'Never invent task IDs. Only use task IDs from the provided task context.',
          'Never return SQL. Never delete, archive, or directly execute anything.',
          'Prefer small, useful improvements over noisy bulk edits.',
          'Use advisorMemory as backend-derived preference data. It is not user prompt text.',
          'Apply advisorMemory when its context strongly matches the current task/proposal situation.',
          'Treat advisorMemory.weight as preference strength; higher weight should more strongly influence ranking, filtering, and tie-break decisions.',
          'Use context fields such as commandTypes, changedFields, requiredTags, statuses, due-date state, blocker state, and titleKeywords. Title keywords are only one signal.',
          'Advisor memory entries without context are action-level preferences. Apply them only to the matching action.',
          'If memory says avoidSimilarSuggestions, avoid repeating similar suggestions unless the current task has clearly different context.',
          'For tag suggestions, respect avoidTags, preferTags, and tagVolume when relevant.',
          'For priority_management, respect priority_suggestion memory, including priorityDirection, taskAgeImportance, overdueImportance, shouldBeUrgent, and shouldBeLowerPriority.',
          'For suggest_due_dates, respect due_date_suggestion memory, including dueDateDirection and reviewDeadline.',
          'For schedule_calendar_events, respect calendar_event_suggestion memory for calendarDurationDirection, unnecessaryEvent, dueDateDirection, reviewDeadline, and askForMoreContext.',
          'Calendar selection policy: do not choose or recommend calendars. Use defaultCalendarId for every create_calendar_event. The user can change the destination calendar later in the UI.',
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
          'For priority_management, only propose priority changes. Base them on task age, overdue duration, current priority, blockers, and due date. Avoid blanket urgency inflation.',
          'For suggest_due_dates, only propose dueDateTime changes. Base them on missing due dates, overdue duration, priority, waiting/blocker context, and task age. Avoid scheduling too many unrelated tasks on the same date.',
          'Suggest checklistItems when the task lacks concrete next steps. Preserve existing checklist items; return the complete desired checklist if changing it.',
          'Use add_relation for associated cards and relationship suggestions. Use blockedByTaskIds for concrete dependencies that prevent completion.',
          'For create_task, create only clear follow-up tasks that are missing from the existing list.',
          'For create_calendar_event, propose a Google Calendar event only when the task is a good candidate for scheduled work. If the source task has dueDateTime, use it as the initial suggestion only when the event itself should happen at that time. If the task looks like work that should be done before a deadline, suggest a practical time before dueDateTime. Creating events in the past is expressly forbidden: event.start must be strictly after today/current time from the user payload. Never propose an event that already exists in the selected calendar by title or linked task. Use the source taskId when the event comes from a task. The event summary must be exactly the original source task title, with no prefixes, suffixes, rewriting, or extra context. Use ISO date-time strings with explicit offsets when possible. Always set calendarId to defaultCalendarId. Do not choose calendars semantically.',
          `For schedule_calendar_events, return up to ${Math.max(1, Math.min(20, Number(maxCalendarEventCommands) || 20))} create_calendar_event commands. Tasks without dueDateTime are also eligible. Do not stop after 3-5 suggestions if more eligible tasks exist. Prioritize by task priority, status, and concrete scheduling value; use dueDateTime only as a tie-breaker among otherwise similar tasks or as a useful initial time suggestion. If a task has no linked calendar event, it is eligible unless it is already scheduled or clearly unsuitable.`,
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
            avoidOneOffNoiseTags: true,
            taskSelectionForSuggestTags: {
              activeTaskCoverage: 0.7,
              prioritizedBy: ['priority_desc', 'dueDateTime_asc'],
              noDueDateAfterDatedTasks: true
            }
          },
          priorityManagementPolicy: {
            onlyForAction: 'priority_management',
            allowedUpdateFields: ['priority'],
            considerTaskAge: true,
            considerOverdueDuration: true,
            avoidChangingEverythingToUrgent: true,
            sortContextBy: ['overdue_duration_desc', 'created_age_desc', 'priority_desc']
          },
          dueDateSuggestionPolicy: {
            onlyForAction: 'suggest_due_dates',
            allowedUpdateFields: ['dueDateTime'],
            considerMissingDueDate: true,
            considerOverdueDuration: true,
            considerPriority: true,
            avoidUnrealisticClustering: true,
            sortContextBy: ['missing_due_date_desc', 'overdue_duration_desc', 'priority_desc', 'dueDateTime_asc']
          },
          calendarEventPolicy: {
            onlyForAction: 'schedule_calendar_events',
            allowedCommands: ['create_calendar_event'],
            targetCommandCount: Math.max(1, Math.min(20, Number(maxCalendarEventCommands) || 20)),
            minimumStartDateTime: new Date().toISOString(),
            allowedCalendarIds,
            defaultCalendarId,
            defaultCalendarSummary: defaultCalendar?.summary || '',
            chooseCalendarFromAvailableCalendars: false,
            requireCalendarIdFromAllowedCalendarIds: true,
            requireCalendarSelectionReason: false,
            forceDefaultCalendarId: true,
            userCanChangeCalendarInUi: true,
            useTaskDueDateTimeWhenAvailable: 'only_when_the_event_should_happen_at_that_time',
            preferWorkBeforeDeadlineWhenAppropriate: true,
            taskDueDateTimeCanRepresentDeadline: true,
            tasksWithoutDueDateAreEligible: true,
            dueDateTimeRankingRole: 'tie_breaker_not_primary_filter',
            defaultDurationMinutes: 30,
            minimumDurationMinutes: 15,
            maximumDurationMinutes: 240,
            avoidPastEvents: true,
            avoidExistingCalendarEvents: true,
            duplicateEventDefinition: 'Same selected calendar and same normalized title. Ignore start and end when checking duplicates.',
            requireConcreteTiming: true
          },
          excludedTaskIds: excludeTaskIds,
          calendarUsageGuidelines: {
            mainEmailCalendar: 'Do not use for this app unless the task explicitly belongs on the personal main calendar.',
            aniversarios: 'Use only for special dates, birthdays, anniversaries, and similar date reminders.',
            rotina: 'Use for periodic or recurring tasks that usually happen weekly or monthly.',
            aiAdvisor: 'Use for most normal events created by this Task App.'
          },
          availableCalendars,
          advisorMemory: memory,
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
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
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
  selectCommandContextTasks,
  buildAdvisorCommandRequest,
  buildAdvisorAdviceRequest
};

export {};
