const { OPENAI_RESPONSES_URL, DEFAULT_MODEL } = require('../constants/aiConstants');
const { extractOpenAiResponseText } = require('./aiResponseHelpers');
const {
  buildAdvisorMemoryContext,
  cleanRuleBehavior,
  cleanRuleContext,
  mergeInterpretedRule
} = require('./advisorMemory');
const { logger } = require('../logger');
const { fetchWithTimeout, numberFromEnv } = require('../utils/fetchWithTimeout');

function compactTask(task: Record<string, any> = {}) {
  return {
    id: task.id || null,
    title: task.title || '',
    notes: task.notes || task.description || '',
    status: task.status || '',
    priority: task.priority ?? null,
    dueDateTime: task.dueDateTime || null,
    estimatedMinutes: task.estimatedMinutes ?? null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    blockedReason: task.blockedReason || '',
    blockedByTaskIds: Array.isArray(task.blockedByTaskIds) ? task.blockedByTaskIds : [],
    checklistItems: Array.isArray(task.checklistItems)
      ? task.checklistItems.slice(0, 20).map((item) => ({ title: item.title || '', isDone: item.isDone === true }))
      : []
  };
}

function buildFeedbackRuleInterpreterRequest({
  action,
  commandPreview,
  rawCommand,
  feedback,
  sourceTask,
  existingRules = []
}: Record<string, any>) {
  return {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'system',
        content: [
          'You interpret user feedback on AI Advisor proposals into reusable advisor memory rules.',
          'Return only JSON matching the schema.',
          'Do not create tasks, do not execute actions, and do not include user prompt instructions.',
          'Create preference/context memory only: when this context appears again, how should the Advisor behave differently?',
          'Use title keywords as one context signal, not as the whole rule.',
          'Prefer compact contextual rules over broad global rules.',
          'If the feedback is too weak or only says the proposal was useful, return a low-impact behavior and confidence below 0.5.',
          'Allowed behavior fields: avoidTags, preferTags, tagVolume, avoidSimilarSuggestions, reviewReasoning, reviewPriority, reviewDeadline, priorityDirection, taskAgeImportance, overdueImportance, dueDateDirection, calendarChoice, calendarDurationDirection, unnecessaryEvent, wrongCalendar, chosenCalendarId, chosenCalendarSummary, preferredCalendarId, preferredCalendarSummary, shouldBeUrgent, shouldBeLowerPriority, askForMoreContext.',
          'Allowed context fields: titleKeywords, commandTypes, changedFields, requiredTags, statuses, priorityMin, priorityMax, hasDueDate, isOverdue, isBlocked.'
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          action,
          commandPreview,
          rawCommand,
          feedback,
          sourceTask: compactTask(sourceTask),
          existingAdvisorMemory: buildAdvisorMemoryContext(existingRules).slice(0, 20),
          expectedRulePurpose: 'Improve future AI Advisor suggestions based on this feedback.'
        })
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'advisor_feedback_rule',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'context', 'behavior', 'confidence'],
          properties: {
            summary: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            context: {
              type: 'object',
              additionalProperties: false,
              required: ['titleKeywords', 'commandTypes', 'changedFields', 'requiredTags', 'statuses', 'priorityMin', 'priorityMax', 'hasDueDate', 'isOverdue', 'isBlocked'],
              properties: {
                titleKeywords: { type: 'array', items: { type: 'string' } },
                commandTypes: { type: 'array', items: { type: 'string' } },
                changedFields: { type: 'array', items: { type: 'string' } },
                requiredTags: { type: 'array', items: { type: 'string' } },
                statuses: { type: 'array', items: { type: 'string' } },
                priorityMin: { type: ['number', 'null'] },
                priorityMax: { type: ['number', 'null'] },
                hasDueDate: { type: ['boolean', 'null'] },
                isOverdue: { type: ['boolean', 'null'] },
                isBlocked: { type: ['boolean', 'null'] }
              }
            },
            behavior: {
              type: 'object',
              additionalProperties: false,
              required: [
                'avoidTags',
                'preferTags',
                'tagVolume',
                'avoidSimilarSuggestions',
                'reviewReasoning',
                'reviewPriority',
                'reviewDeadline',
                'priorityDirection',
                'taskAgeImportance',
                'overdueImportance',
                'dueDateDirection',
                'calendarChoice',
                'calendarDurationDirection',
                'unnecessaryEvent',
                'wrongCalendar',
                'chosenCalendarId',
                'chosenCalendarSummary',
                'preferredCalendarId',
                'preferredCalendarSummary',
                'shouldBeUrgent',
                'shouldBeLowerPriority',
                'askForMoreContext'
              ],
              properties: {
                avoidTags: { type: 'array', items: { type: 'string' } },
                preferTags: { type: 'array', items: { type: 'string' } },
                tagVolume: { type: 'string', enum: ['more', 'less', 'ok'] },
                avoidSimilarSuggestions: { type: 'boolean' },
                reviewReasoning: { type: 'boolean' },
                reviewPriority: { type: 'boolean' },
                reviewDeadline: { type: 'boolean' },
                priorityDirection: { type: 'string', enum: ['too_high', 'too_low', 'ok'] },
                taskAgeImportance: { type: 'string', enum: ['too_much', 'too_little', 'ok'] },
                overdueImportance: { type: 'string', enum: ['too_much', 'too_little', 'ok'] },
                dueDateDirection: { type: 'string', enum: ['too_early', 'too_late', 'ok'] },
                calendarChoice: { type: 'string', enum: ['wrong', 'ok'] },
                calendarDurationDirection: { type: 'string', enum: ['too_short', 'too_long', 'ok'] },
                unnecessaryEvent: { type: 'boolean' },
                wrongCalendar: { type: 'boolean' },
                chosenCalendarId: { type: 'string' },
                chosenCalendarSummary: { type: 'string' },
                preferredCalendarId: { type: 'string' },
                preferredCalendarSummary: { type: 'string' },
                shouldBeUrgent: { type: 'boolean' },
                shouldBeLowerPriority: { type: 'boolean' },
                askForMoreContext: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  };
}

function normalizeInterpretedFeedbackRule(parsed: Record<string, any> = {}) {
  return {
    summary: String(parsed.summary || '').trim().slice(0, 180),
    source: 'openai_feedback_interpretation',
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
    context: cleanRuleContext(parsed.context || {}),
    behavior: cleanRuleBehavior(parsed.behavior || {})
  };
}

async function interpretAdvisorFeedbackRule(input: Record<string, any>) {
  const fallbackRule = input.fallbackRule;
  if (!process.env.OPENAI_API_KEY) {
    return mergeInterpretedRule({
      fallbackRule,
      interpretedRule: { source: 'backend_feedback_fallback', confidence: 0 },
      commandPreview: input.commandPreview,
      sourceTask: input.sourceTask
    });
  }

  const body = buildFeedbackRuleInterpreterRequest(input);
  const startedAt = Date.now();
  logger.info('advisor.feedback_rule.openai.request', {
    metadata: {
      action: input.action,
      model: body.model,
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
  const interpretedRule = normalizeInterpretedFeedbackRule(parsed);
  logger.info('advisor.feedback_rule.openai.response', {
    durationMs: Date.now() - startedAt,
    metadata: {
      action: input.action,
      confidence: interpretedRule.confidence,
      logPayload: process.env.LOG_AI_PAYLOADS === 'true' ? interpretedRule : undefined
    }
  });

  return mergeInterpretedRule({
    fallbackRule,
    interpretedRule,
    commandPreview: input.commandPreview,
    sourceTask: input.sourceTask
  });
}

module.exports = {
  interpretAdvisorFeedbackRule,
  normalizeInterpretedFeedbackRule
};

export {};
