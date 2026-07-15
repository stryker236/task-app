const { OPENAI_RESPONSES_URL, DEFAULT_MODEL } = require('../constants/aiConstants');
const { extractOpenAiResponseText } = require('./aiResponseHelpers');
const { fetchWithTimeout, numberFromEnv } = require('../utils/fetchWithTimeout');
const { logger } = require('../logger');

function compactTask(task: Record<string, any> = {}) {
  return {
    id: String(task.id || ''),
    title: String(task.title || ''),
    status: String(task.status || ''),
    priority: Number(task.priority || 0),
    dueDateTime: task.dueDateTime || null,
    estimatedMinutes: task.estimatedMinutes || null,
    tags: Array.isArray(task.tags) ? task.tags.slice(0, 8) : [],
    blockedByTaskIds: Array.isArray(task.blockedByTaskIds) ? task.blockedByTaskIds.slice(0, 8) : []
  };
}

function compactBusyEvent(event: Record<string, any> = {}) {
  return {
    calendarId: String(event.calendarId || ''),
    calendarSummary: String(event.calendarSummary || ''),
    summary: String(event.summary || ''),
    start: String(event.start || ''),
    end: String(event.end || '')
  };
}

function compactSchedulerRule(rule: Record<string, any> = {}) {
  return {
    id: String(rule.id || ''),
    text: String(rule.text || ''),
    interpretation: String(rule.interpretation || ''),
    status: String(rule.status || ''),
    enabled: rule.enabled === true,
    constraints: (rule.constraints || []).slice(0, 10).map((constraint) => ({
      id: String(constraint.id || ''),
      type: String(constraint.type || ''),
      scope: constraint.scope || {},
      payload: constraint.payload || {},
      hard: constraint.hard !== false
    }))
  };
}

function commandDurationMinutes(command: Record<string, any> = {}) {
  const start = Date.parse(command.event?.start || '');
  const end = Date.parse(command.event?.end || '');
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}

function nearbyBusyEvents(command: Record<string, any> = {}, busyEvents: Record<string, any>[] = []) {
  const start = Date.parse(command.event?.start || '');
  const end = Date.parse(command.event?.end || '');
  if (Number.isNaN(start) || Number.isNaN(end)) return [];
  const sameCalendar = String(command.event?.calendarId || '');
  const windowStart = start - 6 * 60 * 60 * 1000;
  const windowEnd = end + 6 * 60 * 60 * 1000;
  return busyEvents
    .map((event) => ({ ...compactBusyEvent(event), startMs: Date.parse(event.start || ''), endMs: Date.parse(event.end || '') }))
    .filter((event) => !Number.isNaN(event.startMs) && !Number.isNaN(event.endMs))
    .filter((event) => !sameCalendar || event.calendarId === sameCalendar)
    .filter((event) => event.endMs >= windowStart && event.startMs <= windowEnd)
    .sort((left, right) => Math.min(Math.abs(left.endMs - start), Math.abs(left.startMs - end)) - Math.min(Math.abs(right.endMs - start), Math.abs(right.startMs - end)))
    .slice(0, 6)
    .map(({ startMs, endMs, ...event }) => event);
}

function placementDiagnostics(command: Record<string, any> = {}, busyEvents: Record<string, any>[] = []) {
  const start = Date.parse(command.event?.start || '');
  const end = Date.parse(command.event?.end || '');
  const nearby = nearbyBusyEvents(command, busyEvents);
  if (Number.isNaN(start) || Number.isNaN(end)) return { nearbyBusyEvents: nearby, immediateFreeWindow: '' };
  const before = nearby
    .map((event) => ({ ...event, endMs: Date.parse(event.end || '') }))
    .filter((event) => !Number.isNaN(event.endMs) && event.endMs <= start)
    .sort((left, right) => right.endMs - left.endMs)[0];
  const after = nearby
    .map((event) => ({ ...event, startMs: Date.parse(event.start || '') }))
    .filter((event) => !Number.isNaN(event.startMs) && event.startMs >= end)
    .sort((left, right) => left.startMs - right.startMs)[0];
  return {
    nearbyBusyEvents: nearby,
    immediateFreeWindow: before && after ? `${before.end} to ${after.start}` : before ? `after ${before.end}` : after ? `before ${after.start}` : 'no nearby busy events in the provided window'
  };
}

function buildScheduleExplanationRequest({ commands = [], tasksById = {}, busyEvents = [], schedulerRules = [], reservedBlocks = [], now = '', horizonEnd = '', timeZone = '' }: Record<string, any>) {
  const taskMap = tasksById instanceof Map ? tasksById : new Map(Object.entries(tasksById || {}));
  const proposals = commands.map((command) => {
    const task = taskMap.get(String(command.taskId || command.periodicTaskId || '')) || {};
    const diagnostics = placementDiagnostics(command, busyEvents);
    return {
      commandId: String(command.id || ''),
      schedulerReason: String(command.reason || ''),
      appliedRules: Array.isArray(command.appliedRules) ? command.appliedRules : [],
      fixedByUserOrRule: command.fixed === true,
      immediateFreeWindow: diagnostics.immediateFreeWindow,
      nearbyBusyEvents: diagnostics.nearbyBusyEvents,
      task: compactTask(task),
      event: {
        summary: String(command.event?.summary || ''),
        start: String(command.event?.start || ''),
        end: String(command.event?.end || ''),
        durationMinutes: commandDurationMinutes(command),
        calendarId: String(command.event?.calendarId || ''),
        calendarSelectionReason: String(command.event?.calendarSelectionReason || '')
      }
    };
  });

  return {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content: [
          'You explain why calendar scheduling proposals were placed at specific times.',
          'Use only the provided task, Google Calendar busy events, reserved scheduler blocks, and stored scheduler rules.',
          'Do not claim the user is free unless the provided busy events and reserved blocks support it.',
          'Mention the most relevant calendar conflict avoided, rule respected, due date, priority, or duration signal.',
          'Also write one global decision report in a single place.',
          'The global summary must be multiline and include one numbered item per scheduled proposal.',
          'For each numbered item include: task title, chosen start-end time, why that exact slot was selected, nearby busy events/free window used, due date/priority/duration signals, and the stored rule names or constraint ids that affected it.',
          'If no stored rule affected a placement, explicitly write: no stored rule affected this placement.',
          'Make the global summary detailed enough that the user can decide which specific Agenda AI rule to edit.',
          'Keep the global summary under 2500 characters total.',
          'Keep each per-event reason concise but specific: maximum 80 words.',
          'Return only JSON matching the schema.'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          now,
          horizonEnd,
          timeZone,
          proposals,
          googleCalendarBusyEvents: busyEvents.map(compactBusyEvent).slice(0, 120),
          reservedSchedulerBlocks: (reservedBlocks || []).slice(0, 80),
          activeSchedulerRules: schedulerRules.map(compactSchedulerRule).slice(0, 40),
          expectedBehavior: 'Return a detailed global decision report with one numbered item per proposal. Focus on exact placement versus busy times/free windows and stored rules so the user can correct specific rules later. Then return each individual explanation.'
        })
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'schedule_explanations',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            summary: { type: 'string' },
            explanations: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  commandId: { type: 'string' },
                  reason: { type: 'string' }
                },
                required: ['commandId', 'reason']
              }
            }
          },
          required: ['summary', 'explanations']
        }
      }
    }
  };
}

async function explainScheduleCommandsWithOpenAi(input: Record<string, any>) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is required to explain schedule proposals');
    (error as any).status = 503;
    throw error;
  }

  const body = buildScheduleExplanationRequest(input);
  const startedAt = Date.now();
  logger.info('advisor.schedule_explanations.openai.request', {
    metadata: {
      model: body.model,
      commandCount: input.commands?.length || 0,
      busyEventCount: input.busyEvents?.length || 0,
      schedulerRuleCount: input.schedulerRules?.length || 0,
      logPayload: process.env.LOG_AI_PAYLOADS === 'true' ? body : undefined
    }
  });

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

  const parsed = JSON.parse(extractOpenAiResponseText(responseBody));
  const explanations = new Map((Array.isArray(parsed.explanations) ? parsed.explanations : [])
    .map((item) => [String(item.commandId || ''), String(item.reason || '').trim()])
    .filter(([id, reason]) => id && reason));

  logger.info('advisor.schedule_explanations.openai.response', {
    durationMs: Date.now() - startedAt,
    metadata: {
      model: DEFAULT_MODEL,
      explanationCount: explanations.size,
      logPayload: process.env.LOG_AI_PAYLOADS === 'true' ? parsed : undefined
    }
  });

  return {
    model: DEFAULT_MODEL,
    summary: String(parsed.summary || '').trim(),
    commands: (input.commands || []).map((command) => ({
      ...command,
      reason: explanations.get(String(command.id || '')) || command.reason
    }))
  };
}

module.exports = {
  explainScheduleCommandsWithOpenAi
};

export {};