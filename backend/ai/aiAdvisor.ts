const { OPENAI_RESPONSES_URL, DEFAULT_MODEL, ADVISOR_ACTIONS } = require('../constants/aiConstants');
const {
  extractOpenAiResponseText,
  normalizeAdvisorCommands
} = require('./aiResponseHelpers');
const { buildRuleBasedAdvisorAdvice } = require('./aiAdvisorContext');
const {
  resolveAdvisorAction,
  buildAdvisorCommandRequest,
  buildAdvisorAdviceRequest
} = require('./aiAdvisorPrompts');
const { logger } = require('../logger');
const { fetchWithTimeout, numberFromEnv } = require('../utils/fetchWithTimeout');

async function generateTaskAdvisorCommands({ action, tasks, tags = [], memory = [], calendars = [], excludeTaskIds = [], maxCalendarEventCommands = 20 }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is required to generate AI Advisor commands');
    (error as any).status = 503;
    throw error;
  }
  const body = buildAdvisorCommandRequest({ action, tasks, tags, memory, calendars, excludeTaskIds, maxCalendarEventCommands });
  const startedAt = Date.now();
  logger.info('advisor.openai.request', {
    metadata: {
      action,
      model: body.model,
      taskCount: tasks.length,
      calendarCount: calendars.length,
      excludedTaskCount: excludeTaskIds.length,
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

  const outputText = extractOpenAiResponseText(responseBody);
  const parsed = JSON.parse(outputText);
  const normalized = normalizeAdvisorCommands(parsed);
  logger.info('advisor.openai.response', {
    durationMs: Date.now() - startedAt,
    metadata: {
      action,
      model: DEFAULT_MODEL,
      commandCount: normalized.commands.length,
      logPayload: process.env.LOG_AI_PAYLOADS === 'true' ? parsed : undefined
    }
  });
  return {
    generatedAt: new Date().toISOString(),
    source: 'ai',
    model: DEFAULT_MODEL,
    ...normalized
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
  const body = buildAdvisorAdviceRequest({ tasks, limit });

  try {
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
    const parsed = JSON.parse(outputText);
    return normalizeOpenAiAdvisorAdvice(parsed, fallback, DEFAULT_MODEL);
  } catch (error: any) {
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

export {};
