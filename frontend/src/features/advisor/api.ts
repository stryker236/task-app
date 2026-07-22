import type { AiCommand, AiCommandPreview } from '../../../../shared/types';
import { DEFAULT_API_TIMEOUT_MS, requestJson } from '../../shared/api/requestJson';

export type AdvisorAdvice = {
  generatedAt: string;
  source: 'rules' | 'ai';
  model: string | null;
  summary: string;
  actions: unknown[];
  blockers: unknown[];
  note?: string;
};

export type AdvisorPreview = {
  mode: string;
  generatedAt?: string;
  source?: string;
  model?: string | null;
  summary?: string;
  commandCount: number;
  commands: AiCommandPreview[];
  rawCommands?: AiCommand[];
  reservedBlocks?: AdvisorReservedBlock[];
  debug?: AdvisorPreviewDebug;
};

export type AdvisorReservedBlock = {
  type: string;
  start: string;
  end: string;
  reason?: string;
  sourceRuleId?: string | null;
  sourceConstraintId?: string | null;
};

export type AdvisorPreviewDebug = {
  generatedCount: number;
  afterActionFilter: number;
  afterCalendarFilter: number;
  afterPastFilter: number;
  afterDuplicateBatchFilter: number;
  afterExistingGoogleFilter: number;
  afterMemoryFilter: number;
  rejectedCount?: number;
  noSuggestionReason?: string;
  action?: string;
  generatedCommandTypeCounts?: Record<string, number>;
  availableCommandTypeCounts?: Record<string, number>;
  tagDecisionCount?: number;
  tagDecisionCounts?: Record<string, number>;
  tagDecisions?: Array<{
    taskId: string;
    taskTitle?: string;
    existingTags?: string[];
    decision: string;
    reason: string;
    suggestedTags: string[];
    newSuggestedTags?: string[];
    finalPatchTags?: string[];
    commandId?: string;
    commandGenerated?: boolean;
    finalStatus?: string;
    rejectionReason?: string;
  }>;
  availableTagCount?: number | null;
  availableTags?: string[];
  selectedTagTasks?: AdvisorTagTaskDebug[];
  selectedTagTaskCount?: number | null;
  selectedUntaggedTagTaskCount?: number | null;
  skippedTagTasks?: AdvisorTagTaskDebug[];
  pickedTags?: string[];
  pickedTagCounts?: Record<string, number>;
  tagDecisionStatusCounts?: Record<string, number>;
  tagGeneratedCommands?: Array<{
    commandId: string;
    taskId: string;
    taskTitle?: string;
    patchTags: string[];
  }>;
  tagBatches?: Array<{
    batchIndex: number;
    batchCount: number;
    taskCount: number;
    taskIds: string[];
    tasks: AdvisorTagTaskDebug[];
    decisions: Array<{
      taskId: string;
      taskTitle?: string;
      decision: string;
      reason: string;
      suggestedTags: string[];
    }>;
  }>;
  tagSuggestionFlow?: Record<string, unknown> | null;
  schedulerHorizonEnd?: string;
  schedulerBusyEventCount?: number;
  schedulerReservedBusyCount?: number;
  reservedBlockCount?: number;
  attempts?: number;
  candidateTaskCount?: number;
  candidateUntaggedTaskCount?: number;
  generatedUntaggedTaskCount?: number;
  availableUntaggedTaskCount?: number;
  notGeneratedUntaggedTaskCount?: number;
  notAvailableUntaggedTaskCount?: number;
  candidateTasksWithDueDate?: number;
  candidateTasksWithoutDueDate?: number;
  touchedTaskCount?: number;
  availableTaskCount?: number;
  notProposedCount?: number;
  notProposedWithoutDueDateCount?: number;
  touchedTaskIds?: string[];
  availableTaskIds?: string[];
  candidateTasks?: AdvisorCandidateDebug[];
  touchedTasks?: AdvisorCandidateDebug[];
  notGeneratedUntaggedTasks?: AdvisorCandidateDebug[];
  notAvailableUntaggedTasks?: AdvisorCandidateDebug[];
  notProposedCandidates?: AdvisorCandidateDebug[];
  candidateAttempts?: Array<{
    attempt: number;
    candidateCount: number;
    candidateTasksWithDueDate: number;
    candidateTasksWithoutDueDate: number;
    returnedTaskCount: number;
    returnedTaskIds: string[];
    notProposedCount: number;
    notProposedWithoutDueDateCount: number;
    notProposedCandidates: AdvisorCandidateDebug[];
  }>;
  rejectionReasons?: Record<string, number>;
  schedulerDebug?: Record<string, unknown>;
  rejections?: Array<{
    status: string;
    reason: string;
    attempt?: number;
    commandId?: string;
    taskId?: string | null;
    taskTitle?: string | null;
    summary?: string;
    details?: string;
    memoryRules?: Array<{
      ruleType?: string;
      action?: string;
      appliesToCommandType?: string;
      titleKeywords?: string[];
      supportCount?: number;
      matchedReasons?: string[];
      summary?: string;
      rule?: Record<string, unknown>;
    }>;
  }>;
};

export type AdvisorTagTaskDebug = AdvisorCandidateDebug & {
  existingTags?: string[];
  hasTags?: boolean;
  notesChars?: number;
  reason?: string;
};

export type AdvisorCandidateDebug = {
  attempt?: number;
  taskId: string;
  taskTitle?: string;
  title?: string;
  status?: string;
  priority?: number | null;
  dueDateTime?: string | null;
  hasDueDateTime?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SchedulerConstraintInput = {
  taskId: string;
  start: string;
  end?: string;
};

export type AdvisorFeedbackInput = {
  action: string;
  commandPreview: AiCommandPreview;
  rawCommand?: AiCommand;
  feedback: {
    overall: 'useful' | 'not_useful' | 'mixed';
    tagVolume: 'more' | 'less' | 'ok';
    goodTags: string[];
    badTags: string[];
    wrongReason: boolean;
    wrongPriority: boolean;
    wrongDeadline: boolean;
    priorityDirection?: 'too_high' | 'too_low' | 'ok';
    taskAgeImportance?: 'too_much' | 'too_little' | 'ok';
    overdueImportance?: 'too_much' | 'too_little' | 'ok';
    dueDateDirection?: 'too_early' | 'too_late' | 'ok';
    calendarChoice?: 'ok' | 'wrong';
    calendarDurationDirection?: 'too_short' | 'too_long' | 'ok';
    unnecessaryEvent?: boolean;
    wrongCalendar?: boolean;
    chosenCalendarId?: string;
    chosenCalendarSummary?: string;
    preferredCalendarId?: string;
    preferredCalendarSummary?: string;
    shouldBeUrgent?: boolean;
    shouldBeLowerPriority?: boolean;
    missingContext: boolean;
  };
};

export type AdvisorMemoryRule = {
  id: string;
  ruleType: string;
  titleFingerprint: string;
  action: string;
  rule: {
    summary?: string;
    source?: 'openai_feedback_interpretation' | 'backend_feedback_fallback' | string;
    confidence?: number | null;
    titleKeywords?: string[];
    context?: {
      titleKeywords?: string[];
      commandTypes?: string[];
      changedFields?: string[];
      requiredTags?: string[];
      statuses?: string[];
      priorityMin?: number | null;
      priorityMax?: number | null;
      hasDueDate?: boolean;
      isOverdue?: boolean;
      isBlocked?: boolean;
    };
    behavior?: {
      avoidTags?: string[];
      preferTags?: string[];
      tagVolume?: 'more' | 'less' | 'ok';
      avoidSimilarSuggestions?: boolean;
      askForMoreContext?: boolean;
      reviewReasoning?: boolean;
      reviewPriority?: boolean;
      reviewDeadline?: boolean;
      priorityDirection?: 'too_high' | 'too_low' | 'ok';
      taskAgeImportance?: 'too_much' | 'too_little' | 'ok';
      overdueImportance?: 'too_much' | 'too_little' | 'ok';
      dueDateDirection?: 'too_early' | 'too_late' | 'ok';
      calendarChoice?: 'ok' | 'wrong';
      calendarDurationDirection?: 'too_short' | 'too_long' | 'ok';
      unnecessaryEvent?: boolean;
      wrongCalendar?: boolean;
      chosenCalendarId?: string;
      chosenCalendarSummary?: string;
      preferredCalendarId?: string;
      preferredCalendarSummary?: string;
      shouldBeUrgent?: boolean;
      shouldBeLowerPriority?: boolean;
    };
    avoidTags?: string[];
    preferTags?: string[];
    tagVolume?: 'more' | 'less' | 'ok';
    avoidSimilarSuggestions?: boolean;
    askForMoreContext?: boolean;
    reviewReasoning?: boolean;
    reviewPriority?: boolean;
    reviewDeadline?: boolean;
    priorityDirection?: 'too_high' | 'too_low' | 'ok';
    taskAgeImportance?: 'too_much' | 'too_little' | 'ok';
    overdueImportance?: 'too_much' | 'too_little' | 'ok';
    dueDateDirection?: 'too_early' | 'too_late' | 'ok';
    calendarChoice?: 'ok' | 'wrong';
    calendarDurationDirection?: 'too_short' | 'too_long' | 'ok';
    unnecessaryEvent?: boolean;
    wrongCalendar?: boolean;
    chosenCalendarId?: string;
    chosenCalendarSummary?: string;
    preferredCalendarId?: string;
    preferredCalendarSummary?: string;
    shouldBeUrgent?: boolean;
    shouldBeLowerPriority?: boolean;
  };
  supportCount: number;
  lastFeedbackAt: string;
};

export type AdvisorMemoryRuleUpdate = {
  summary?: string;
  context?: AdvisorMemoryRule['rule']['context'];
  behavior?: AdvisorMemoryRule['rule']['behavior'];
};

export type AdvisorInteractionFeedbackInput = {
  action: string;
  interaction: {
    generatedAt?: string;
    summary?: string;
    commandCount: number;
  };
  feedback: AdvisorFeedbackInput['feedback'];
};

export function getTaskAdvisorAdvice(limit = 5) {
  return requestJson<AdvisorAdvice>(`/advisor?limit=${encodeURIComponent(limit)}`);
}

export function requestTaskAdvisorCommands(action: string, options: { defaultCalendarId?: string; schedulerConstraints?: SchedulerConstraintInput[]; scheduleStartFrom?: string } = {}) {
  return requestJson<AdvisorPreview>('/ai/advisor/request', {
    method: 'POST',
    body: JSON.stringify({
      action,
      defaultCalendarId: options.defaultCalendarId || '',
      schedulerConstraints: options.schedulerConstraints || [],
      scheduleStartFrom: options.scheduleStartFrom || ''
    })
  });
}

export function applyAiCommands(commands: AiCommand[], options: { reservedBlocks?: AdvisorReservedBlock[] } = {}) {
  return requestJson<{ mode: string; appliedCount: number; results: unknown[] }>('/ai/commands/apply', {
    method: 'POST',
    body: JSON.stringify({ commands, reservedBlocks: options.reservedBlocks || [] })
  });
}

export function requestScheduleExplanation(commands: AiCommand[], schedulerDebug: Record<string, unknown>) {
  return requestJson<{ model: string | null; summary: string; commands: Array<{ id: string; reason: string }> }>('/ai/advisor/schedule-explanation', {
    method: 'POST',
    body: JSON.stringify({ commands, schedulerDebug }),
    timeoutMs: DEFAULT_API_TIMEOUT_MS
  });
}

export function submitAdvisorFeedback(feedback: AdvisorFeedbackInput) {
  return requestJson<{ memoryRule: unknown }>('/ai/advisor/feedback', {
    method: 'POST',
    body: JSON.stringify(feedback)
  });
}

export function submitAdvisorInteractionFeedback(feedback: AdvisorInteractionFeedbackInput) {
  return requestJson<{ memoryRule: unknown }>('/ai/advisor/interaction-feedback', {
    method: 'POST',
    body: JSON.stringify(feedback)
  });
}

export const getAdvisorMemoryRules = () => requestJson<AdvisorMemoryRule[]>('/ai/advisor/memory');
export const updateAdvisorMemoryRule = (id: string, patch: AdvisorMemoryRuleUpdate) => requestJson<AdvisorMemoryRule>(`/ai/advisor/memory/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteAdvisorMemoryRule = (id: string) => requestJson<void>(`/ai/advisor/memory/${id}`, { method: 'DELETE' });
