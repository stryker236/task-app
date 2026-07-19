const { OPENAI_RESPONSES_URL, DEFAULT_MODEL } = require('../constants/aiConstants');
const { extractOpenAiResponseText } = require('./aiResponseHelpers');
const { fetchWithTimeout, numberFromEnv } = require('../utils/fetchWithTimeout');

type SchedulerConstraintType = {
  type: string;
  label?: string;
  description?: string;
  category?: string;
  scopeSchema?: Record<string, any>;
  payloadSchema?: Record<string, any>;
  examples?: unknown[];
  supportsHard?: boolean;
  defaultHard?: boolean;
  enabled?: boolean;
};

const FALLBACK_CONSTRAINT_TYPES: SchedulerConstraintType[] = [
  { type: 'blocked_window', description: 'Prevents matching tasks from being scheduled inside a time window. Payload may include days, date, or dates to target recurring weekdays or exact calendar dates.', payloadSchema: { required: ['startTime', 'endTime'], properties: { days: {}, date: {}, dates: {}, startTime: {}, endTime: {} } }, defaultHard: true },
  { type: 'allowed_window', description: 'Restricts matching tasks to a time window. Payload may include days, date, or dates to target recurring weekdays or exact calendar dates.', payloadSchema: { required: ['startTime', 'endTime'], properties: { days: {}, date: {}, dates: {}, startTime: {}, endTime: {} } }, defaultHard: true },
  { type: 'preferred_window', description: 'Prioritizes matching tasks inside a time window when possible. Payload may include days, date, or dates to target recurring weekdays or exact calendar dates.', payloadSchema: { required: ['startTime', 'endTime'], properties: { days: {}, date: {}, dates: {}, startTime: {}, endTime: {}, weight: {} } }, defaultHard: false },
  { type: 'avoid_day', description: 'Avoids scheduling matching tasks on specific weekdays.', payloadSchema: { required: ['days'] }, defaultHard: true },
  { type: 'min_duration', description: 'Applies only to matching tasks at or above a minimum duration.', payloadSchema: { required: ['minutes'] }, defaultHard: true },
  { type: 'max_duration', description: 'Applies only to matching tasks at or below a maximum duration.', payloadSchema: { required: ['minutes'] }, defaultHard: true },
  { type: 'priority_boost', description: 'Moves matching tasks earlier when possible.', payloadSchema: { required: [], properties: { days: {}, date: {}, dates: {}, startTime: {}, endTime: {}, weight: {} } }, defaultHard: false },
  { type: 'daily_limit', description: 'Limits how many matching tasks can be scheduled in a matching day/window.', payloadSchema: { required: ['max'], properties: { max: {}, days: {}, date: {}, dates: {}, startTime: {}, endTime: {} } }, defaultHard: true },
  { type: 'break_after_task', description: 'Reserves a calculated break after each matching scheduled task.', payloadSchema: { required: ['breakMinutes'] }, defaultHard: false },
  { type: 'break_after_work_block', description: 'Reserves a calculated break after a continuous block of scheduled work.', payloadSchema: { required: ['workMinutes', 'breakMinutes'] }, defaultHard: true },
  { type: 'allowed_date', description: 'Restricts matching tasks to one or more exact calendar dates, optionally inside a time range.', payloadSchema: { required: [], properties: { date: {}, dates: {}, startTime: {}, endTime: {} } }, defaultHard: true }
];

function constraintCatalog(constraintTypes: SchedulerConstraintType[] = []) {
  const enabled = constraintTypes.filter((item) => item && item.type && item.enabled !== false);
  return enabled.length ? enabled : FALLBACK_CONSTRAINT_TYPES;
}

function constraintTypeMap(constraintTypes: SchedulerConstraintType[] = []) {
  return new Map(constraintCatalog(constraintTypes).map((item) => [item.type, item]));
}

function compactTaskForRule(task: Record<string, any>) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    tags: task.tags || [],
    dueDateTime: task.dueDateTime || null,
    estimatedMinutes: task.estimatedMinutes || null
  };
}

function normalizeConstraint(item: Record<string, any>, constraintTypes: SchedulerConstraintType[] = []) {
  const type = String(item.type || '');
  const typeDefinition = constraintTypeMap(constraintTypes).get(type);
  if (!typeDefinition) return null;
  const scope = normalizeScope(item.scope);
  const payload = normalizePayload(type, item.payload);
  if (!isSupportedConstraintPayload(type, payload, typeDefinition)) return null;
  return {
    type,
    scope,
    payload,
    hard: typeDefinition.supportsHard === false ? Boolean(typeDefinition.defaultHard) : (typeof item.hard === 'boolean' ? item.hard : typeDefinition.defaultHard !== false),
    enabled: item.enabled !== false
  };
}

function normalizePayload(type: string, value: unknown) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
  if (type === 'break_after_work_block' && payload.workMinutes == null && payload.minTaskDurationMinutes != null) {
    payload.workMinutes = payload.minTaskDurationMinutes;
  }
  if (type === 'break_after_work_block' && payload.workMinutes == null && payload.minWorkMinutes != null) {
    payload.workMinutes = payload.minWorkMinutes;
  }
  if (type === 'break_after_task' && payload.minDurationMinutes == null && payload.minTaskDurationMinutes != null) {
    payload.minDurationMinutes = payload.minTaskDurationMinutes;
  }
  delete payload.minTaskDurationMinutes;
  delete payload.minWorkMinutes;
  return payload;
}

function normalizeScope(value: unknown) {
  const scope = value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
  if (Array.isArray(scope.priorities)) {
    scope.priorities = scope.priorities
      .map((priority) => Number(priority))
      .filter((priority) => Number.isInteger(priority) && priority >= 1 && priority <= 4);
    if (!scope.priorities.length) delete scope.priorities;
  }
  return scope;
}

function hasTimeWindow(payload: Record<string, any>) {
  return typeof payload.startTime === 'string' && typeof payload.endTime === 'string';
}

function hasDateFilter(payload: Record<string, any>) {
  return (typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date))
    || (Array.isArray(payload.dates) && payload.dates.some((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)));
}

function hasPositiveMinutes(payload: Record<string, any>) {
  const minutes = Number(payload.minutes);
  return Number.isFinite(minutes) && minutes > 0;
}

function hasPositiveMax(payload: Record<string, any>) {
  const max = Number(payload.max);
  return Number.isFinite(max) && max > 0;
}

function hasRequiredPayloadFields(payload: Record<string, any>, typeDefinition?: SchedulerConstraintType) {
  const required = typeDefinition?.payloadSchema?.required;
  return !Array.isArray(required) || required.every((field) => payload[field] != null && payload[field] !== '');
}

function isSupportedConstraintPayload(type: string, payload: Record<string, any>, typeDefinition?: SchedulerConstraintType) {
  if (!hasRequiredPayloadFields(payload, typeDefinition)) return false;
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(type)) return hasTimeWindow(payload);
  if (['min_duration', 'max_duration'].includes(type)) return hasPositiveMinutes(payload);
  if (type === 'daily_limit') return hasPositiveMax(payload);
  if (type === 'break_after_task') return Number(payload.breakMinutes) > 0;
  if (type === 'break_after_work_block') return Number(payload.workMinutes) > 0 && Number(payload.breakMinutes) > 0;
  if (type === 'allowed_date') return hasDateFilter(payload);
  if (type === 'priority_boost') return true;
  if (type === 'avoid_day') return Array.isArray(payload.days) && payload.days.length > 0;
  return false;
}

function normalizeInterpretation(parsed: Record<string, any>, constraintTypes: SchedulerConstraintType[] = []) {
  const constraints = Array.isArray(parsed.constraints)
    ? parsed.constraints.map((item) => normalizeConstraint(item, constraintTypes)).filter(Boolean)
    : [];
  const ambiguous = parsed.ambiguous === true || constraints.length === 0;
  const confidence = Number(parsed.confidence);
  return {
    interpretation: String(parsed.interpretation || ''),
    status: ambiguous ? 'needs_review' : 'active',
    enabled: !ambiguous,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
    constraints,
    rawResponse: parsed
  };
}

function promptConstraintTypes(constraintTypes: SchedulerConstraintType[] = []) {
  return constraintCatalog(constraintTypes).map((item) => ({
    type: item.type,
    label: item.label || item.type,
    description: item.description || '',
    category: item.category || '',
    scopeSchema: item.scopeSchema || {},
    payloadSchema: item.payloadSchema || {},
    examples: Array.isArray(item.examples) ? item.examples : [],
    supportsHard: item.supportsHard !== false,
    defaultHard: item.defaultHard !== false
  }));
}

type SchedulerRuleTemporalContext = {
  currentDate?: string;
  currentDateTime?: string;
  currentWeekday?: string;
  timeZone?: string;
  locale?: string;
};

function temporalPromptLines() {
  return [
    'Resolve relative dates and natural-language date references using temporalContext from the user payload.',
    'temporalContext.currentDate is the user-local "today" date. temporalContext.currentDateTime is the user-local current date/time. temporalContext.timeZone is the user timezone.',
    'For exact one-off dates, use payload.date. For multiple exact one-off dates, use payload.dates. For recurring weekdays, use payload.days.',
    'When the user says today/hoje, use temporalContext.currentDate. When the user says tomorrow/amanha, use the day after temporalContext.currentDate. When the user says this week/esta semana or weekend/fim de semana, infer the concrete dates from temporalContext.',
    'If a relative date cannot be inferred confidently from temporalContext, mark ambiguous true instead of guessing.',
    'A request to have nothing scheduled on a concrete date means blocked_window, scope allTasks, hard true, startTime 00:00, endTime 23:59, with date/dates filled.',
    'A request to avoid a concrete date or concrete date range also means blocked_window. A recurring weekday avoidance can use avoid_day or blocked_window with days.',
    'A request to only schedule on concrete dates means allowed_date or allowed_window with date/dates. A recurring weekday allowance uses allowed_window with days.',
    'If both days and date/dates are present in one temporal payload, they are a union: match recurring weekdays OR exact dates.'
  ];
}

function buildSchedulerRulePrompt({ text, tasks = [], constraintTypes = [], temporalContext = {} }: { text: string; tasks?: Record<string, any>[]; constraintTypes?: SchedulerConstraintType[]; temporalContext?: SchedulerRuleTemporalContext }) {
  return {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content: [
          'Translate scheduling preference text into strict JSON for a deterministic calendar scheduler.',
          'Return only JSON with: interpretation, ambiguous, confidence, constraints.',
          'Use only the constraint types from schedulerConstraintTypes.',
          'Each constraint must include type, scope, payload, hard, enabled.',
          'Scope may include allTasks, taskIds, tags, titleIncludes, statuses, priorities.',
          'Priority mapping: important/high priority/urgent should use scope.priorities [3,4]; critical/very urgent should use [4]; low priority should use [1].',
          'Payload uses days as ISO weekday numbers 1-7, date as YYYY-MM-DD, dates as YYYY-MM-DD[], startTime/endTime as HH:mm, minutes for duration rules.',
          'Use days for recurring weekdays. Use date/dates for exact calendar dates, never for weekdays or days of the month.',
          ...temporalPromptLines(),
          'blocked_window, allowed_window, preferred_window, priority_boost, and daily_limit may include days, date, or dates.',
          'Use priority_boost for rules like "prioritize/prefer these tags during this day/time"; payload may include days, date, dates, startTime, endTime, weight.',
          'Use daily_limit for rules like "only X tasks with these tags on this day"; payload must include max and may include days/date/dates.',
          'Use break_after_task for rules like "15 minute break after tasks"; payload must include breakMinutes and may include minDurationMinutes for rules like "after tasks of 1 hour or more".',
          'Use break_after_work_block for rules like "15 minute break after 90 minutes of work"; payload must include workMinutes and breakMinutes. Do not use minTaskDurationMinutes.',
          'Payload may include daysOfMonth only for priority_boost or daily_limit.',
          'Use allowed_date for exact calendar dates like "on July 18, 2026"; payload must include date or dates and may include startTime/endTime.',
          'priority_boost is soft by default. daily_limit is hard by default.',
          'Do not convert unsupported concepts such as grouping tasks into blocks, energy level, or balancing workload; mark ambiguous true instead.',
          'Mark ambiguous true when the rule cannot be safely converted.'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          ruleText: text,
          schedulerConstraintTypes: promptConstraintTypes(constraintTypes),
          temporalContext,
          availableTaskMetadata: tasks.slice(0, 120).map(compactTaskForRule)
        })
      }
    ],
    temperature: 0
  };
}

function buildSchedulerRuleBreakdownPrompt({ text, tasks = [], constraintTypes = [], temporalContext = {} }: { text: string; tasks?: Record<string, any>[]; constraintTypes?: SchedulerConstraintType[]; temporalContext?: SchedulerRuleTemporalContext }) {
  return {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content: [
          'Break scheduling preference text into one or more independent concrete scheduler rules.',
          'Return only JSON with: rules.',
          'rules must be an array. Each item must include: text, interpretation, ambiguous, confidence, constraints.',
          'Split long input when it contains separate preferences, limits, days, tag groups, or time windows.',
          'Do not split a sentence when the parts are required to understand the same constraint.',
          'Use only the constraint types from schedulerConstraintTypes.',
          'Each constraint must include type, scope, payload, hard, enabled.',
          'Scope may include allTasks, taskIds, tags, titleIncludes, statuses, priorities.',
          'Priority mapping: important/high priority/urgent should use scope.priorities [3,4]; critical/very urgent should use [4]; low priority should use [1].',
          'Payload uses days as ISO weekday numbers 1-7, date as YYYY-MM-DD, dates as YYYY-MM-DD[], startTime/endTime as HH:mm, minutes for duration rules.',
          'Use days for recurring weekdays. Use date/dates for exact calendar dates, never for weekdays or days of the month.',
          ...temporalPromptLines(),
          'blocked_window, allowed_window, preferred_window, priority_boost, and daily_limit may include days, date, or dates.',
          'Use priority_boost for rules like "prioritize/prefer these tags during this day/time"; payload may include days, date, dates, startTime, endTime, weight.',
          'Use daily_limit for rules like "only X tasks with these tags on this day"; payload must include max and may include days/date/dates.',
          'Use break_after_task for rules like "15 minute break after tasks"; payload must include breakMinutes and may include minDurationMinutes for rules like "after tasks of 1 hour or more".',
          'Use break_after_work_block for rules like "15 minute break after 90 minutes of work"; payload must include workMinutes and breakMinutes. Do not use minTaskDurationMinutes.',
          'Payload may include daysOfMonth only for priority_boost or daily_limit.',
          'Use allowed_date for exact calendar dates like "on July 18, 2026"; payload must include date or dates and may include startTime/endTime.',
          'priority_boost is soft by default. daily_limit is hard by default.',
          'Do not convert unsupported concepts such as grouping tasks into blocks, energy level, or balancing workload; mark ambiguous true instead.',
          'Mark ambiguous true for any rule that cannot be safely converted.'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          ruleText: text,
          schedulerConstraintTypes: promptConstraintTypes(constraintTypes),
          temporalContext,
          availableTaskMetadata: tasks.slice(0, 120).map(compactTaskForRule)
        })
      }
    ],
    temperature: 0
  };
}

async function requestOpenAiJson(body: Record<string, any>) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is required to interpret scheduler rules');
    (error as any).status = 503;
    throw error;
  }

  const response = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, numberFromEnv(process.env.OPENAI_REQUEST_TIMEOUT_MS, 60000));
  const responseBody: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseBody.error?.message || `OpenAI request failed with ${response.status}`);
  const outputText = extractOpenAiResponseText(responseBody);
  return JSON.parse(outputText);
}

async function interpretSchedulerRule({ text, tasks = [], constraintTypes = [], temporalContext = {} }: { text: string; tasks?: Record<string, any>[]; constraintTypes?: SchedulerConstraintType[]; temporalContext?: SchedulerRuleTemporalContext }) {
  const parsed = await requestOpenAiJson(buildSchedulerRulePrompt({ text, tasks, constraintTypes, temporalContext }));
  return {
    model: DEFAULT_MODEL,
    ...normalizeInterpretation(parsed, constraintTypes)
  };
}

async function interpretSchedulerRules({ text, tasks = [], constraintTypes = [], temporalContext = {} }: { text: string; tasks?: Record<string, any>[]; constraintTypes?: SchedulerConstraintType[]; temporalContext?: SchedulerRuleTemporalContext }) {
  const parsed = await requestOpenAiJson(buildSchedulerRuleBreakdownPrompt({ text, tasks, constraintTypes, temporalContext }));
  const items = Array.isArray(parsed.rules) && parsed.rules.length ? parsed.rules : [{ ...parsed, text }];
  return items.map((item: Record<string, any>) => {
    const ruleText = normalizeStringForRule(item.text) || text;
    return {
      text: ruleText,
      model: DEFAULT_MODEL,
      ...normalizeInterpretation({
        ...item,
        rawSourceText: text
      }, constraintTypes)
    };
  });
}

function normalizeStringForRule(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

module.exports = {
  interpretSchedulerRule,
  interpretSchedulerRules,
  normalizeInterpretation
};

export {};
