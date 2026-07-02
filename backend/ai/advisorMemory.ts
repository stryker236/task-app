const STOP_WORDS = new Set([
  'a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos',
  'o', 'os', 'para', 'por', 'que', 'the', 'to', 'of', 'and'
]);

// Convert free text into stable comparison tokens used by fingerprints.
function normalizeWord(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

// Build a compact topic key from a task/event title so feedback can match similar future suggestions.
function titleFingerprint(title = '') {
  return [...new Set(String(title)
    .split(/\s+/)
    .map(normalizeWord)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))]
    .slice(0, 8)
    .join(' ');
}

// Keep user-provided tag feedback bounded and deduplicated before storing it.
function sanitizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 20);
}

// Normalize frontend feedback into the exact shape the memory inference code expects.
function sanitizeAdvisorFeedback(value: Record<string, any> = {}) {
  const overall = ['useful', 'not_useful', 'mixed'].includes(value.overall) ? value.overall : 'mixed';
  const tagVolume = ['more', 'less', 'ok'].includes(value.tagVolume) ? value.tagVolume : 'ok';
  const priorityDirection = ['too_high', 'too_low', 'ok'].includes(value.priorityDirection) ? value.priorityDirection : 'ok';
  const taskAgeImportance = ['too_much', 'too_little', 'ok'].includes(value.taskAgeImportance) ? value.taskAgeImportance : 'ok';
  const overdueImportance = ['too_much', 'too_little', 'ok'].includes(value.overdueImportance) ? value.overdueImportance : 'ok';
  const dueDateDirection = ['too_early', 'too_late', 'ok'].includes(value.dueDateDirection) ? value.dueDateDirection : 'ok';
  const calendarDurationDirection = ['too_short', 'too_long', 'ok'].includes(value.calendarDurationDirection) ? value.calendarDurationDirection : 'ok';
  return {
    overall,
    tagVolume,
    goodTags: sanitizeStringList(value.goodTags),
    badTags: sanitizeStringList(value.badTags),
    wrongReason: value.wrongReason === true,
    wrongPriority: value.wrongPriority === true,
    wrongDeadline: value.wrongDeadline === true,
    priorityDirection,
    taskAgeImportance,
    overdueImportance,
    dueDateDirection,
    calendarDurationDirection,
    unnecessaryEvent: value.unnecessaryEvent === true,
    wrongCalendar: value.wrongCalendar === true,
    shouldBeUrgent: value.shouldBeUrgent === true,
    shouldBeLowerPriority: value.shouldBeLowerPriority === true,
    missingContext: value.missingContext === true
  };
}

// Turn feedback on one proposal into a reusable rule for future Advisor requests.
function inferAdvisorMemoryRule({ action, commandPreview, feedback }: Record<string, any>) {
  const changes = commandPreview?.changes && typeof commandPreview.changes === 'object' ? commandPreview.changes : {};
  const title = advisorPreviewTitle(commandPreview);
  const fingerprint = titleFingerprint(title);
  const rule: Record<string, any> = {
    titleKeywords: fingerprint.split(' ').filter(Boolean),
    appliesToCommandType: commandPreview?.type || '',
    avoidTags: feedback.badTags,
    preferTags: feedback.goodTags,
    tagVolume: feedback.tagVolume,
    avoidSimilarSuggestions: feedback.overall === 'not_useful',
    reviewReasoning: feedback.wrongReason,
    reviewPriority: feedback.wrongPriority,
    reviewDeadline: feedback.wrongDeadline,
    priorityDirection: feedback.priorityDirection,
    taskAgeImportance: feedback.taskAgeImportance,
    overdueImportance: feedback.overdueImportance,
    dueDateDirection: feedback.dueDateDirection,
    calendarDurationDirection: feedback.calendarDurationDirection,
    unnecessaryEvent: feedback.unnecessaryEvent,
    wrongCalendar: feedback.wrongCalendar,
    shouldBeUrgent: feedback.shouldBeUrgent,
    shouldBeLowerPriority: feedback.shouldBeLowerPriority,
    askForMoreContext: feedback.missingContext
  };
  Object.keys(rule).forEach((key) => {
    if (Array.isArray(rule[key]) && !rule[key].length) delete rule[key];
    if (rule[key] === false || rule[key] === '' || rule[key] == null) delete rule[key];
  });
  return {
    ruleType: action === 'priority_management'
      ? 'priority_suggestion'
      : action === 'suggest_due_dates'
      ? 'due_date_suggestion'
      : action === 'schedule_calendar_events'
      ? 'calendar_event_suggestion'
      : commandPreview?.type === 'update_task' && (feedback.goodTags.length || feedback.badTags.length || feedback.tagVolume !== 'ok')
      ? 'tag_suggestion'
      : 'advisor_suggestion',
    titleFingerprint: fingerprint,
    action: String(action || ''),
    rule
  };
}

// Turn feedback on a whole Advisor batch into an action-level preference.
function inferAdvisorInteractionMemoryRule({ action, interaction, feedback }: Record<string, any>) {
  const rule: Record<string, any> = {
    action,
    avoidSimilarSuggestions: feedback.overall === 'not_useful',
    interactionWasUseful: feedback.overall === 'useful',
    interactionWasMixed: feedback.overall === 'mixed',
    reviewReasoning: feedback.wrongReason,
    reviewPriority: feedback.wrongPriority,
    reviewDeadline: feedback.wrongDeadline,
    priorityDirection: feedback.priorityDirection,
    taskAgeImportance: feedback.taskAgeImportance,
    overdueImportance: feedback.overdueImportance,
    dueDateDirection: feedback.dueDateDirection,
    calendarDurationDirection: feedback.calendarDurationDirection,
    unnecessaryEvent: feedback.unnecessaryEvent,
    wrongCalendar: feedback.wrongCalendar,
    shouldBeUrgent: feedback.shouldBeUrgent,
    shouldBeLowerPriority: feedback.shouldBeLowerPriority,
    askForMoreContext: feedback.missingContext,
    commandCount: Number(interaction?.commandCount || 0)
  };
  Object.keys(rule).forEach((key) => {
    if (rule[key] === false || rule[key] === '' || rule[key] == null) delete rule[key];
  });
  return {
    ruleType: 'advisor_interaction',
    titleFingerprint: '',
    action: String(action || ''),
    rule
  };
}

// Convert database rows into a compact, prompt-safe memory block for the AI request.
function buildAdvisorMemoryContext(rules: any[] = []) {
  return rules
    .filter((item) => item?.rule && Object.keys(item.rule).length)
    .slice(0, 40)
    .map((item) => ({
      ruleType: item.ruleType,
      action: item.action,
      appliesToCommandType: item.rule.appliesToCommandType || '',
      titleKeywords: item.rule.titleKeywords || item.titleFingerprint?.split(' ') || [],
      avoidTags: item.rule.avoidTags || [],
      preferTags: item.rule.preferTags || [],
      tagVolume: item.rule.tagVolume || 'ok',
      avoidSimilarSuggestions: item.rule.avoidSimilarSuggestions === true,
      reviewReasoning: item.rule.reviewReasoning === true,
      reviewPriority: item.rule.reviewPriority === true,
      reviewDeadline: item.rule.reviewDeadline === true,
      priorityDirection: item.rule.priorityDirection || 'ok',
      taskAgeImportance: item.rule.taskAgeImportance || 'ok',
      overdueImportance: item.rule.overdueImportance || 'ok',
      dueDateDirection: item.rule.dueDateDirection || 'ok',
      calendarDurationDirection: item.rule.calendarDurationDirection || 'ok',
      unnecessaryEvent: item.rule.unnecessaryEvent === true,
      wrongCalendar: item.rule.wrongCalendar === true,
      shouldBeUrgent: item.rule.shouldBeUrgent === true,
      shouldBeLowerPriority: item.rule.shouldBeLowerPriority === true,
      askForMoreContext: item.rule.askForMoreContext === true,
      interactionWasUseful: item.rule.interactionWasUseful === true,
      interactionWasMixed: item.rule.interactionWasMixed === true,
      supportCount: item.supportCount || 1
    }));
}

// Normalize lists before comparing tags/title keywords across user feedback and previews.
function normalizedSet(values: unknown[] = []) {
  return new Set(values.map((value) => normalizeWord(String(value || ''))).filter(Boolean));
}

// Decide whether a stored rule is relevant to this task/event title.
function titleMatchesRule(title: string, rule: Record<string, any>) {
  const titleWords = normalizedSet(titleFingerprint(title).split(' '));
  const ruleWords = normalizedSet(rule.titleKeywords || []);
  if (!ruleWords.size || !titleWords.size) return false;
  const overlap = [...ruleWords].filter((word) => titleWords.has(word)).length;
  return overlap >= Math.min(2, ruleWords.size);
}

// Public wrapper used by memory filtering to get the best title for any proposal type.
function previewTitle(preview: Record<string, any>) {
  return advisorPreviewTitle(preview);
}

// Resolve the title affected by a proposal, including calendar events that do not edit a task.
function advisorPreviewTitle(preview: Record<string, any>) {
  const changes = preview?.changes && typeof preview.changes === 'object' ? preview.changes : {};
  return preview?.taskTitle
    || changes?.after?.title
    || changes?.before?.title
    || changes?.createdTask?.title
    || changes?.calendarEvent?.summary
    || preview?.summary
    || '';
}

// Extract only newly proposed tags so "avoid tag" feedback does not match existing tags.
function previewAddedTags(preview: Record<string, any>) {
  const changes = preview?.changes && typeof preview.changes === 'object' ? preview.changes : {};
  const beforeTags = normalizedSet(changes?.before?.tags || []);
  const afterTags = Array.isArray(changes?.after?.tags)
    ? changes.after.tags
    : Array.isArray(changes?.createdTask?.tags) ? changes.createdTask.tags : [];
  return afterTags.map(String).filter((tag) => !beforeTags.has(normalizeWord(tag)));
}

// Apply learned "do not show this again" style rules before proposals reach the UI.
function shouldSuppressPreviewByMemory(preview: Record<string, any>, memory: any[] = [], action = '') {
  const title = previewTitle(preview);
  const addedTags = previewAddedTags(preview);
  const addedTagKeys = normalizedSet(addedTags);

  return memory.some((rule) => {
    if (rule.action && rule.action !== action) return false;
    if (!titleMatchesRule(title, rule)) return false;
    if (rule.avoidSimilarSuggestions && rule.appliesToCommandType === preview.type) return true;

    if (rule.ruleType === 'tag_suggestion' && preview.type === 'update_task') {
      const avoidTags = normalizedSet(rule.avoidTags || []);
      if ([...avoidTags].some((tag) => addedTagKeys.has(tag))) return true;
      if (rule.tagVolume === 'less' && addedTags.length > 1) return true;
    }

    return false;
  });
}

// Keep raw commands and their previews in sync while removing memory-suppressed proposals.
function filterAdvisorCommandPairsByMemory({ commands = [], previews = [], memory = [], action = '' }: Record<string, any>) {
  const keptCommands = [];
  const keptPreviews = [];
  previews.forEach((preview, index) => {
    if (shouldSuppressPreviewByMemory(preview, memory, action)) return;
    keptPreviews.push(preview);
    keptCommands.push(commands[index]);
  });
  return { commands: keptCommands, previews: keptPreviews };
}

module.exports = {
  advisorPreviewTitle,
  titleFingerprint,
  sanitizeAdvisorFeedback,
  inferAdvisorMemoryRule,
  inferAdvisorInteractionMemoryRule,
  buildAdvisorMemoryContext,
  filterAdvisorCommandPairsByMemory
};

export {};
