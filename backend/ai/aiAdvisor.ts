const { OPENAI_RESPONSES_URL, DEFAULT_MODEL, ADVISOR_ACTIONS } = require('../constants/aiConstants');
const {
  extractOpenAiResponseText,
  normalizeAdvisorCommands
} = require('./aiResponseHelpers');
const { buildRuleBasedAdvisorAdvice } = require('./aiAdvisorContext');
const {
  resolveAdvisorAction,
  buildAdvisorCommandRequest,
  buildTagSuggestionRequest,
  selectCommandContextTasks,
  buildAdvisorAdviceRequest
} = require('./aiAdvisorPrompts');
const { logger } = require('../logger');
const { fetchWithTimeout, numberFromEnv } = require('../utils/fetchWithTimeout');

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sanitizeTagList(tags = []) {
  const seen = new Set();
  const sanitized = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    const value = String(tag || '').trim();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    sanitized.push(value);
  }
  return sanitized.slice(0, 12);
}

function sameTagList(left = [], right = []) {
  const leftKeys = sanitizeTagList(left).map((tag) => tag.toLocaleLowerCase()).sort();
  const rightKeys = sanitizeTagList(right).map((tag) => tag.toLocaleLowerCase()).sort();
  return JSON.stringify(leftKeys) === JSON.stringify(rightKeys);
}

function safeJsonParse(value) {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function compactPayloadTask(task: any = {}) {
  return {
    id: String(task.id || ''),
    title: String(task.title || ''),
    status: String(task.status || ''),
    priority: task.priority ?? null,
    dueDateTime: task.dueDateTime || null,
    estimatedMinutes: task.estimatedMinutes ?? null,
    tags: Array.isArray(task.tags) ? task.tags.slice(0, 8) : [],
    blockedByCount: Array.isArray(task.blockedByTaskIds) ? task.blockedByTaskIds.length : 0,
    checklistCount: Array.isArray(task.checklistItems) ? task.checklistItems.length : 0,
    relationCount: Array.isArray(task.relations) ? task.relations.length : 0,
    latestActivityCount: Array.isArray(task.latestActivity) ? task.latestActivity.length : 0,
    notesChars: typeof task.notes === 'string' ? task.notes.length : 0
  };
}

function summarizeOpenAiRequestPayload(body: any = {}) {
  const input = Array.isArray(body.input) ? body.input : [];
  const systemMessage = input.find((message) => message?.role === 'system');
  const userMessage = input.find((message) => message?.role === 'user');
  const userPayload = safeJsonParse(userMessage?.content) || {};
  const tasks = Array.isArray(userPayload.tasks) ? userPayload.tasks : [];
  const availableTags = Array.isArray(userPayload.availableTags) ? userPayload.availableTags : [];
  const advisorMemory = Array.isArray(userPayload.advisorMemory) ? userPayload.advisorMemory : [];
  const calendars = Array.isArray(userPayload.availableCalendars) ? userPayload.availableCalendars : [];
  return {
    model: body.model || '',
    responseFormat: body.text?.format?.name || body.text?.format?.type || '',
    payloadChars: JSON.stringify(body).length,
    inputMessageCount: input.length,
    systemPromptChars: typeof systemMessage?.content === 'string' ? systemMessage.content.length : 0,
    systemPromptPreview: typeof systemMessage?.content === 'string' ? systemMessage.content.slice(0, 280) : '',
    userPayloadKeys: Object.keys(userPayload),
    action: userPayload.action || '',
    instruction: typeof userPayload.instruction === 'string' ? userPayload.instruction.slice(0, 280) : '',
    batchIndex: userPayload.batchIndex ?? null,
    batchCount: userPayload.batchCount ?? null,
    selectedTaskCount: tasks.length,
    selectedTaskFields: tasks[0] ? Object.keys(tasks[0]) : [],
    selectedTaskSample: tasks.slice(0, 20).map(compactPayloadTask),
    availableTagCount: availableTags.length,
    availableTagSample: availableTags.slice(0, 30),
    advisorMemoryCount: advisorMemory.length,
    advisorMemorySample: advisorMemory.slice(0, 8).map((rule) => ({
      ruleType: rule?.ruleType || '',
      action: rule?.action || '',
      summary: String(rule?.summary || '').slice(0, 180),
      weight: rule?.weight ?? rule?.supportCount ?? null
    })),
    calendarCount: calendars.length,
    calendarSample: calendars.slice(0, 10).map((calendar) => ({
      id: calendar?.id || '',
      summary: calendar?.summary || '',
      appRole: calendar?.appRole || '',
      primary: calendar?.primary === true
    })),
    untaggedTaskCount: Array.isArray(userPayload.untaggedTaskIds) ? userPayload.untaggedTaskIds.length : null,
    dateContext: userPayload.dateContext ? {
      activeTaskCount: userPayload.dateContext.activeTaskCount ?? null,
      activeWithDueDateCount: Array.isArray(userPayload.dateContext.activeWithDueDate) ? userPayload.dateContext.activeWithDueDate.length : null,
      activeWithoutDueDateCount: Array.isArray(userPayload.dateContext.activeWithoutDueDate) ? userPayload.dateContext.activeWithoutDueDate.length : null
    } : null,
    calendarPolicy: userPayload.calendarEventPolicy ? {
      targetCommandCount: userPayload.calendarEventPolicy.targetCommandCount ?? null,
      defaultCalendarId: userPayload.calendarEventPolicy.defaultCalendarId || '',
      minimumStartDateTime: userPayload.calendarEventPolicy.minimumStartDateTime || ''
    } : null
  };
}

function summarizeOpenAiResponsePayload(parsed: any = {}) {
  const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 280) : '',
    commandCount: commands.length,
    commandTypeCounts: commands.reduce((counts, command) => {
      const type = String(command?.type || 'unknown');
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {}),
    commandSample: commands.slice(0, 20).map((command) => ({
      id: command?.id || '',
      type: command?.type || '',
      taskId: command?.taskId || null,
      label: String(command?.label || '').slice(0, 160),
      reason: String(command?.reason || '').slice(0, 220),
      patchFields: command?.patch && typeof command.patch === 'object' ? Object.keys(command.patch) : [],
      createTaskTitle: command?.task?.title || '',
      calendarSummary: command?.event?.summary || ''
    })),
    decisionCount: decisions.length,
    decisionCounts: decisions.reduce((counts, decision) => {
      const value = String(decision?.decision || 'unknown');
      counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {}),
    decisionSample: decisions.slice(0, 20).map((decision) => ({
      taskId: decision?.taskId || '',
      decision: decision?.decision || '',
      reason: String(decision?.reason || '').slice(0, 220),
      suggestedTags: Array.isArray(decision?.suggestedTags) ? decision.suggestedTags.slice(0, 12) : []
    }))
  };
}

function normalizeTagSuggestionDecisions(parsed, batchTasks) {
  const allowedIds = new Set(batchTasks.map((task) => String(task.id)));
  const seen = new Set();
  const decisions = [];
  for (const item of Array.isArray(parsed.decisions) ? parsed.decisions : []) {
    const taskId = String(item?.taskId || '');
    if (!allowedIds.has(taskId) || seen.has(taskId)) continue;
    seen.add(taskId);
    decisions.push({
      taskId,
      decision: String(item?.decision || 'needs_user_context'),
      reason: String(item?.reason || '').trim() || 'Sem motivo devolvido pelo AI.',
      suggestedTags: sanitizeTagList(item?.suggestedTags || [])
    });
  }
  for (const task of batchTasks) {
    const taskId = String(task.id);
    if (seen.has(taskId)) continue;
    decisions.push({
      taskId,
      decision: 'needs_user_context',
      reason: 'O AI nao devolveu uma decisao para esta task.',
      suggestedTags: []
    });
  }
  return decisions;
}

async function requestOpenAiJson(body, timeoutMs) {
  const response = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }, timeoutMs);
  const responseBody: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseBody.error?.message || `OpenAI request failed with ${response.status}`);
  return JSON.parse(extractOpenAiResponseText(responseBody));
}

async function generateTagAdvisorCommands({ tasks, tags = [], memory = [] }) {
  const selectedTasks = selectCommandContextTasks({ action: 'suggest_tags', tasks });
  const batchSize = Math.max(1, Math.min(40, numberFromEnv(process.env.AI_TAG_SUGGESTION_BATCH_SIZE, 20)));
  const batches = chunkItems(selectedTasks, batchSize);
  const startedAt = Date.now();
  const decisions = [];
  const summaries = [];
  logger.info('advisor.openai.tag_request.started', {
    metadata: {
      action: 'suggest_tags',
      model: DEFAULT_MODEL,
      taskCount: tasks.length,
      selectedTaskCount: selectedTasks.length,
      batchCount: batches.length,
      batchSize
    }
  });

  for (const [index, batchTasks] of batches.entries()) {
    const body = buildTagSuggestionRequest({
      tasks: batchTasks,
      tags,
      memory,
      batchIndex: index + 1,
      batchCount: batches.length
    });
    logger.info('advisor.openai.tag_request.batch', {
      metadata: {
        action: 'suggest_tags',
        model: body.model,
        batchIndex: index + 1,
        batchCount: batches.length,
        taskCount: batchTasks.length,
        payloadSummary: summarizeOpenAiRequestPayload(body),
        logPayload: process.env.LOG_AI_PAYLOADS === 'true' ? body : undefined
      }
    });
    const parsed = await requestOpenAiJson(body, numberFromEnv(process.env.OPENAI_REQUEST_TIMEOUT_MS, 60000));
    logger.info('advisor.openai.tag_response.batch', {
      metadata: {
        action: 'suggest_tags',
        model: body.model,
        batchIndex: index + 1,
        batchCount: batches.length,
        responseSummary: summarizeOpenAiResponsePayload(parsed),
        logPayload: process.env.LOG_AI_PAYLOADS === 'true' ? parsed : undefined
      }
    });
    if (typeof parsed.summary === 'string' && parsed.summary.trim()) summaries.push(parsed.summary.trim());
    decisions.push(...normalizeTagSuggestionDecisions(parsed, batchTasks));
  }

  const tasksById = new Map<string, any>(selectedTasks.map((task: any) => [String(task.id), task]));
  const commands = decisions.flatMap((decision, index) => {
    if (decision.decision !== 'suggested' || !decision.suggestedTags.length) return [];
    const task = tasksById.get(String(decision.taskId));
    if (!task || sameTagList(task.tags || [], decision.suggestedTags)) return [];
    return [{
      id: `tag_suggestion_${index + 1}_${decision.taskId}`,
      type: 'update_task',
      label: `Sugerir tags: ${task.title || decision.taskId}`,
      reason: decision.reason,
      taskId: decision.taskId,
      relatedTaskId: null,
      relationType: null,
      patch: { tags: decision.suggestedTags },
      task: null,
      event: null
    }];
  });

  logger.info('advisor.openai.tag_response.completed', {
    durationMs: Date.now() - startedAt,
    metadata: {
      action: 'suggest_tags',
      model: DEFAULT_MODEL,
      selectedTaskCount: selectedTasks.length,
      decisionCount: decisions.length,
      commandCount: commands.length
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    source: 'ai',
    model: DEFAULT_MODEL,
    summary: summaries[0] || (commands.length ? `Foram encontradas ${commands.length} sugestoes de tags.` : 'Nao foram encontradas sugestoes de tags aplicaveis.'),
    commands,
    tagDecisions: decisions,
    tagBatchCount: batches.length,
    tagCandidateCount: selectedTasks.length
  };
}

async function generateTaskAdvisorCommands({ action, tasks, tags = [], memory = [], calendars = [], excludeTaskIds = [], maxCalendarEventCommands = 20 }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is required to generate AI Advisor commands');
    (error as any).status = 503;
    throw error;
  }
  if (action === 'suggest_tags') {
    return generateTagAdvisorCommands({ tasks, tags, memory });
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
      payloadSummary: summarizeOpenAiRequestPayload(body),
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
      responseSummary: summarizeOpenAiResponsePayload(parsed),
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
