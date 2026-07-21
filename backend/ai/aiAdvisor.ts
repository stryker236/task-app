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

function tagName(tag: any) {
  return String(typeof tag === 'string' ? tag : tag?.name || tag?.tag || tag?.label || '').trim();
}

function compactAvailableTags(tags = []) {
  const seen = new Set();
  const result = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    const name = tagName(tag);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result.slice(0, 200);
}

function compactTagDebugTask(task: any = {}) {
  return {
    taskId: String(task.id || ''),
    taskTitle: String(task.title || ''),
    status: String(task.status || ''),
    priority: task.priority ?? null,
    dueDateTime: task.dueDateTime || null,
    existingTags: sanitizeTagList(task.tags || []),
    hasTags: Array.isArray(task.tags) && task.tags.length > 0,
    notesChars: typeof task.notes === 'string' ? task.notes.length : 0,
    updatedAt: task.updatedAt || null,
    createdAt: task.createdAt || null
  };
}

function tagSuggestionTaskSkipReason(task: any = {}) {
  if (task?.isArchived) return 'archived';
  if (!['new', 'in_progress', 'waiting'].includes(String(task?.status || ''))) return 'not_active_status';
  return 'not_selected_by_context_selector';
}

function countTags(items = []) {
  return items.reduce((counts, tag) => {
    const value = String(tag || '').trim();
    if (!value) return counts;
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function sampleItems(items = [], limit = 12) {
  return Array.isArray(items) ? items.slice(0, limit) : [];
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
  const selectedTaskIds = new Set(selectedTasks.map((task: any) => String(task.id)));
  const availableTags = compactAvailableTags(tags);
  const selectedTaskDebug = selectedTasks.map(compactTagDebugTask);
  const skippedTaskDebug = (Array.isArray(tasks) ? tasks : [])
    .filter((task: any) => task?.id && !selectedTaskIds.has(String(task.id)))
    .map((task: any) => ({
      ...compactTagDebugTask(task),
      reason: tagSuggestionTaskSkipReason(task)
    }))
    .slice(0, 120);
  const startedAt = Date.now();
  const decisions = [];
  const summaries = [];
  const batchDebug = [];
  logger.info('advisor.openai.tag_request.started', {
    metadata: {
      action: 'suggest_tags',
      model: DEFAULT_MODEL,
      totalTaskCount: Array.isArray(tasks) ? tasks.length : 0,
      tasksSentToAiCount: selectedTasks.length,
      untaggedTasksSentToAiCount: selectedTaskDebug.filter((task) => !task.hasTags).length,
      tasksNotSentToAiCount: Math.max(0, (Array.isArray(tasks) ? tasks.length : 0) - selectedTasks.length),
      availableTagsSentToAiCount: availableTags.length,
      memoryRuleCount: Array.isArray(memory) ? memory.length : 0,
      batchCount: batches.length,
      batchSize
    }
  });
  logger.debug('advisor.tags.selection', {
    metadata: {
      flow: {
        summary: {
          action: 'suggest_tags',
          selectedTaskCount: selectedTasks.length,
          selectedUntaggedTaskCount: selectedTaskDebug.filter((task) => !task.hasTags).length,
          skippedTaskCount: skippedTaskDebug.length
        },
        selection: {
          tasksSentToAiSample: sampleItems(selectedTaskDebug, 20),
          tasksNotSentToAiSample: sampleItems(skippedTaskDebug, 20)
        },
        input: {
          availableTagCount: availableTags.length,
          availableTagsSentToAiSample: sampleItems(availableTags, 30)
        }
      }
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
    logger.debug('advisor.openai.tag_request.batch', {
      metadata: {
        flow: {
          summary: {
            action: 'suggest_tags',
            model: body.model,
            batchIndex: index + 1,
            batchCount: batches.length,
            taskCount: batchTasks.length
          },
          input: {
            payloadSummary: summarizeOpenAiRequestPayload(body),
            tasksSentToAiSample: sampleItems(batchTasks.map(compactTagDebugTask), 10)
          }
        },
        logPayload: process.env.LOG_AI_PAYLOADS === 'true' ? body : undefined
      }
    });
    const parsed = await requestOpenAiJson(body, numberFromEnv(process.env.OPENAI_REQUEST_TIMEOUT_MS, 60000));
    const normalizedBatchDecisions = normalizeTagSuggestionDecisions(parsed, batchTasks);
    batchDebug.push({
      batchIndex: index + 1,
      batchCount: batches.length,
      taskCount: batchTasks.length,
      taskIds: batchTasks.map((task: any) => String(task.id)),
      tasks: batchTasks.map(compactTagDebugTask),
      decisions: normalizedBatchDecisions.map((decision) => ({
        taskId: decision.taskId,
        taskTitle: String(batchTasks.find((task: any) => String(task.id) === String(decision.taskId))?.title || ''),
        decision: decision.decision,
        reason: decision.reason,
        suggestedTags: decision.suggestedTags
      }))
    });
    logger.debug('advisor.openai.tag_response.batch', {
      metadata: {
        flow: {
          summary: {
            action: 'suggest_tags',
            model: body.model,
            batchIndex: index + 1,
            batchCount: batches.length
          },
          aiDecisions: {
            responseSummary: summarizeOpenAiResponsePayload(parsed),
            aiDecisionsByTaskSample: sampleItems(normalizedBatchDecisions.map((decision) => ({
              taskId: decision.taskId,
              taskTitle: String(batchTasks.find((task: any) => String(task.id) === String(decision.taskId))?.title || ''),
              decision: decision.decision,
              reason: decision.reason,
              suggestedTags: decision.suggestedTags
            })), 20)
          }
        },
        logPayload: process.env.LOG_AI_PAYLOADS === 'true' ? parsed : undefined
      }
    });
    if (typeof parsed.summary === 'string' && parsed.summary.trim()) summaries.push(parsed.summary.trim());
    decisions.push(...normalizedBatchDecisions);
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
  const commandByTaskId = new Map<string, any>(commands.map((command) => [String(command.taskId || ''), command]));
  const decisionDebug = decisions.map((decision) => {
    const task = tasksById.get(String(decision.taskId));
    const existingTags = sanitizeTagList(task?.tags || []);
    const existingTagKeys = new Set(existingTags.map((tag) => tag.toLocaleLowerCase()));
    const suggestedTags = sanitizeTagList(decision.suggestedTags || []);
    const newSuggestedTags = suggestedTags.filter((tag) => !existingTagKeys.has(tag.toLocaleLowerCase()));
    const command = commandByTaskId.get(String(decision.taskId));
    let finalStatus = 'command_generated';
    let rejectionReason = '';
    if (decision.decision !== 'suggested') {
      finalStatus = 'ai_no_suggestion';
      rejectionReason = decision.decision;
    } else if (!suggestedTags.length) {
      finalStatus = 'empty_suggestion';
      rejectionReason = 'AI marked suggested but returned no tags';
    } else if (!task) {
      finalStatus = 'task_not_found';
      rejectionReason = 'Task was not present in selected context';
    } else if (sameTagList(existingTags, suggestedTags)) {
      finalStatus = 'same_as_existing_tags';
      rejectionReason = 'Suggested tag list matches current tags';
    } else if (!command) {
      finalStatus = 'not_converted_to_command';
      rejectionReason = 'Suggestion did not produce an update_task command';
    }
    return {
      taskId: decision.taskId,
      taskTitle: String(task?.title || ''),
      existingTags,
      decision: decision.decision,
      reason: decision.reason,
      suggestedTags,
      newSuggestedTags,
      finalPatchTags: sanitizeTagList(command?.patch?.tags || []),
      commandId: command?.id || '',
      commandGenerated: Boolean(command),
      finalStatus,
      rejectionReason
    };
  });
  const pickedTags = decisionDebug.flatMap((item) => item.newSuggestedTags);
  const decisionStatusCounts = decisionDebug.reduce((counts, item) => {
    counts[item.finalStatus] = (counts[item.finalStatus] || 0) + 1;
    return counts;
  }, {});
  const generatedCommands = commands.map((command) => ({
    commandId: command.id,
    taskId: command.taskId,
    taskTitle: tasksById.get(String(command.taskId))?.title || '',
    patchTags: sanitizeTagList(command.patch?.tags || [])
  }));
  const tagSuggestionDebug = {
    summary: {
      action: 'suggest_tags',
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startedAt,
      totalTaskCount: Array.isArray(tasks) ? tasks.length : 0,
      selectedTaskCount: selectedTasks.length,
      selectedUntaggedTaskCount: selectedTaskDebug.filter((task) => !task.hasTags).length,
      skippedTaskCount: Math.max(0, (Array.isArray(tasks) ? tasks.length : 0) - selectedTasks.length),
      availableTagCount: availableTags.length,
      batchCount: batches.length,
      decisionCount: decisions.length,
      commandCount: commands.length,
      pickedTagCount: pickedTags.length,
      pickedUniqueTagCount: Object.keys(countTags(pickedTags)).length
    },
    input: {
      availableTagsSentToAi: availableTags,
      availableTagCount: availableTags.length,
      memoryRuleCount: Array.isArray(memory) ? memory.length : 0,
      batchSize
    },
    selection: {
      tasksSentToAi: selectedTaskDebug.slice(0, 120),
      selectedTaskCount: selectedTasks.length,
      selectedUntaggedTaskCount: selectedTaskDebug.filter((task) => !task.hasTags).length,
      tasksNotSentToAi: skippedTaskDebug,
      skippedTaskCount: Math.max(0, (Array.isArray(tasks) ? tasks.length : 0) - selectedTasks.length)
    },
    batches: batchDebug,
    aiDecisions: {
      aiDecisionsByTask: decisionDebug,
      decisionCounts: decisions.reduce((counts, item) => {
        const decision = String(item?.decision || 'unknown');
        counts[decision] = (counts[decision] || 0) + 1;
        return counts;
      }, {}),
      finalStatusCounts: decisionStatusCounts
    },
    output: {
      generatedCommands,
      pickedTags,
      pickedTagCounts: countTags(pickedTags)
    },
    availableTags,
    availableTagCount: availableTags.length,
    selectedTasks: selectedTaskDebug.slice(0, 120),
    selectedTaskCount: selectedTasks.length,
    selectedUntaggedTaskCount: selectedTaskDebug.filter((task) => !task.hasTags).length,
    skippedTasks: skippedTaskDebug,
    skippedTaskCount: Math.max(0, (Array.isArray(tasks) ? tasks.length : 0) - selectedTasks.length),
    decisions: decisionDebug,
    generatedCommands,
    pickedTags,
    pickedTagCounts: countTags(pickedTags),
    decisionStatusCounts
  };
  logger.debug('advisor.tags.decisions', {
    metadata: {
      flow: {
        summary: tagSuggestionDebug.summary,
        aiDecisions: {
          decisionCounts: tagSuggestionDebug.aiDecisions.decisionCounts,
          finalStatusCounts: tagSuggestionDebug.aiDecisions.finalStatusCounts,
          aiDecisionsByTaskSample: sampleItems(tagSuggestionDebug.aiDecisions.aiDecisionsByTask, 30)
        },
        output: {
          generatedCommandCount: generatedCommands.length,
          generatedCommandsSample: sampleItems(generatedCommands, 20),
          pickedTags,
          pickedTagCounts: tagSuggestionDebug.output.pickedTagCounts
        }
      }
    }
  });

  logger.info('advisor.openai.tag_response.completed', {
    durationMs: Date.now() - startedAt,
    metadata: {
      action: 'suggest_tags',
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startedAt,
      totalTaskCount: tagSuggestionDebug.summary.totalTaskCount,
      tasksSentToAiCount: tagSuggestionDebug.selection.selectedTaskCount,
      untaggedTasksSentToAiCount: tagSuggestionDebug.selection.selectedUntaggedTaskCount,
      tasksNotSentToAiCount: tagSuggestionDebug.selection.skippedTaskCount,
      availableTagsSentToAiCount: tagSuggestionDebug.input.availableTagCount,
      batchCount: tagSuggestionDebug.summary.batchCount,
      aiDecisionCounts: tagSuggestionDebug.aiDecisions.decisionCounts,
      finalStatusCounts: tagSuggestionDebug.aiDecisions.finalStatusCounts,
      generatedCommandCount: generatedCommands.length,
      pickedTagCounts: tagSuggestionDebug.output.pickedTagCounts
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    source: 'ai',
    model: DEFAULT_MODEL,
    summary: summaries[0] || (commands.length ? `Foram encontradas ${commands.length} sugestoes de tags.` : 'Nao foram encontradas sugestoes de tags aplicaveis.'),
    commands,
    tagDecisions: decisions,
    tagSuggestionDebug,
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
