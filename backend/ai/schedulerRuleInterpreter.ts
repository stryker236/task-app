const { OPENAI_RESPONSES_URL, DEFAULT_MODEL } = require('../constants/aiConstants');
const { extractOpenAiResponseText } = require('./aiResponseHelpers');

const CONSTRAINT_TYPES = new Set([
  'blocked_window',
  'allowed_window',
  'preferred_window',
  'avoid_day',
  'min_duration',
  'max_duration',
  'priority_boost',
  'daily_limit',
  'break_after_task',
  'break_after_work_block',
  'allowed_date'
]);

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

function normalizeConstraint(item: Record<string, any>) {
  const type = String(item.type || '');
  if (!CONSTRAINT_TYPES.has(type)) return null;
  const scope = normalizeScope(item.scope);
  const payload = normalizePayload(type, item.payload);
  if (!isSupportedConstraintPayload(type, payload)) return null;
  return {
    type,
    scope,
    payload,
    hard: item.hard !== false,
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

function hasPositiveMinutes(payload: Record<string, any>) {
  const minutes = Number(payload.minutes);
  return Number.isFinite(minutes) && minutes > 0;
}

function hasPositiveMax(payload: Record<string, any>) {
  const max = Number(payload.max);
  return Number.isFinite(max) && max > 0;
}

function isSupportedConstraintPayload(type: string, payload: Record<string, any>) {
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(type)) return hasTimeWindow(payload);
  if (['min_duration', 'max_duration'].includes(type)) return hasPositiveMinutes(payload);
  if (type === 'daily_limit') return hasPositiveMax(payload);
  if (type === 'break_after_task') return Number(payload.breakMinutes) > 0;
  if (type === 'break_after_work_block') return Number(payload.workMinutes) > 0 && Number(payload.breakMinutes) > 0;
  if (type === 'allowed_date') return typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date);
  if (type === 'priority_boost') return true;
  if (type === 'avoid_day') return Array.isArray(payload.days) && payload.days.length > 0;
  return false;
}

function normalizeInterpretation(parsed: Record<string, any>) {
  const constraints = Array.isArray(parsed.constraints)
    ? parsed.constraints.map(normalizeConstraint).filter(Boolean)
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

function buildSchedulerRulePrompt({ text, tasks = [] }: { text: string; tasks?: Record<string, any>[] }) {
  return {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content: [
          'Translate scheduling preference text into strict JSON for a deterministic calendar scheduler.',
          'Return only JSON with: interpretation, ambiguous, confidence, constraints.',
          'Constraint types: blocked_window, allowed_window, preferred_window, avoid_day, min_duration, max_duration, priority_boost, daily_limit, break_after_task, break_after_work_block, allowed_date.',
          'Each constraint must include type, scope, payload, hard, enabled.',
          'Scope may include allTasks, taskIds, tags, titleIncludes, statuses, priorities.',
          'Priority mapping: important/high priority/urgent should use scope.priorities [3,4]; critical/very urgent should use [4]; low priority should use [1].',
          'Payload uses days as ISO weekday numbers 1-7, startTime/endTime as HH:mm, minutes for duration rules.',
          'Use priority_boost for rules like "prioritize/prefer these tags during this day/time"; payload may include days, startTime, endTime, weight.',
          'Use daily_limit for rules like "only X tasks with these tags on this day"; payload must include max and may include days.',
          'Use break_after_task for rules like "15 minute break after tasks"; payload must include breakMinutes and may include minDurationMinutes for rules like "after tasks of 1 hour or more".',
          'Use break_after_work_block for rules like "15 minute break after 90 minutes of work"; payload must include workMinutes and breakMinutes. Do not use minTaskDurationMinutes.',
          'Payload may include daysOfMonth only for priority_boost or daily_limit.',
          'Use allowed_date for exact calendar dates like "on July 18, 2026"; payload must include date as YYYY-MM-DD and may include startTime/endTime.',
          'priority_boost is soft by default. daily_limit is hard by default.',
          'Do not convert unsupported concepts such as grouping tasks into blocks, energy level, or balancing workload; mark ambiguous true instead.',
          'Mark ambiguous true when the rule cannot be safely converted.'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          ruleText: text,
          availableTaskMetadata: tasks.slice(0, 120).map(compactTaskForRule)
        })
      }
    ],
    temperature: 0
  };
}

function buildSchedulerRuleBreakdownPrompt({ text, tasks = [] }: { text: string; tasks?: Record<string, any>[] }) {
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
          'Constraint types: blocked_window, allowed_window, preferred_window, avoid_day, min_duration, max_duration, priority_boost, daily_limit, break_after_task, break_after_work_block, allowed_date.',
          'Each constraint must include type, scope, payload, hard, enabled.',
          'Scope may include allTasks, taskIds, tags, titleIncludes, statuses, priorities.',
          'Priority mapping: important/high priority/urgent should use scope.priorities [3,4]; critical/very urgent should use [4]; low priority should use [1].',
          'Payload uses days as ISO weekday numbers 1-7, startTime/endTime as HH:mm, minutes for duration rules.',
          'Use priority_boost for rules like "prioritize/prefer these tags during this day/time"; payload may include days, startTime, endTime, weight.',
          'Use daily_limit for rules like "only X tasks with these tags on this day"; payload must include max and may include days.',
          'Use break_after_task for rules like "15 minute break after tasks"; payload must include breakMinutes and may include minDurationMinutes for rules like "after tasks of 1 hour or more".',
          'Use break_after_work_block for rules like "15 minute break after 90 minutes of work"; payload must include workMinutes and breakMinutes. Do not use minTaskDurationMinutes.',
          'Payload may include daysOfMonth only for priority_boost or daily_limit.',
          'Use allowed_date for exact calendar dates like "on July 18, 2026"; payload must include date as YYYY-MM-DD and may include startTime/endTime.',
          'priority_boost is soft by default. daily_limit is hard by default.',
          'Do not convert unsupported concepts such as grouping tasks into blocks, energy level, or balancing workload; mark ambiguous true instead.',
          'Mark ambiguous true for any rule that cannot be safely converted.'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          ruleText: text,
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

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const responseBody: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseBody.error?.message || `OpenAI request failed with ${response.status}`);
  const outputText = extractOpenAiResponseText(responseBody);
  return JSON.parse(outputText);
}

async function interpretSchedulerRule({ text, tasks = [] }: { text: string; tasks?: Record<string, any>[] }) {
  const parsed = await requestOpenAiJson(buildSchedulerRulePrompt({ text, tasks }));
  return {
    model: DEFAULT_MODEL,
    ...normalizeInterpretation(parsed)
  };
}

async function interpretSchedulerRules({ text, tasks = [] }: { text: string; tasks?: Record<string, any>[] }) {
  const parsed = await requestOpenAiJson(buildSchedulerRuleBreakdownPrompt({ text, tasks }));
  const items = Array.isArray(parsed.rules) && parsed.rules.length ? parsed.rules : [{ ...parsed, text }];
  return items.map((item: Record<string, any>) => {
    const ruleText = normalizeStringForRule(item.text) || text;
    return {
      text: ruleText,
      model: DEFAULT_MODEL,
      ...normalizeInterpretation({
        ...item,
        rawSourceText: text
      })
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
