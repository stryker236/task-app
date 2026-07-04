const STOP_WORDS = new Set([
  'a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos',
  'o', 'os', 'para', 'por', 'que', 'the', 'to', 'of', 'and'
]);

// Convert free text into stable comparison tokens used by fingerprints.
function sanitizeWord(value: string) {
  const withoutAccents = value
    .normalize('NFD') // Decompose combined letters into base letters and diacritical marks
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics (accents) from letters

  const lowercase = withoutAccents.toLowerCase();

  return lowercase.replace(/[^a-z0-9_-]/g, ''); // Remove any character that is not a letter, number, underscore, or hyphen
}

// Build a compact topic key from a task/event title so feedback can match similar future suggestions.
function titleFingerprint(title = '') {
  const words = String(title).split(/\s+/); // Split the title into words based on whitespace

  const relevantWords = words
    .map(sanitizeWord)
    .filter(isRelevantWord);

  const uniqueWords = [...new Set(relevantWords)];

  return uniqueWords
    .slice(0, 8) // Limit to the first 8 unique relevant words
    .join(' ');
}

function isRelevantWord(word: string) {
  return word.length >= 3 && !STOP_WORDS.has(word);
}

// Keep user-provided tag feedback bounded and deduplicated before storing it.
function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const strings = value.map((item) => String(item ?? '').trim());
  const nonEmptyStrings = strings.filter(Boolean); // Remove empty strings
  const uniqueStrings = [...new Set(nonEmptyStrings)];
  return uniqueStrings.slice(0, 20);
}

function sanitizeString(value: unknown) {
  return String(value ?? '').trim();
}

function pickEnum(value: unknown, allowed: string[], fallback: string) {
  return allowed.includes(String(value || '')) ? String(value) : fallback;
}

function createEmptyAdvisorFeedback() {
  return {
    overall: 'mixed',
    tagVolume: 'ok',
    goodTags: [],
    badTags: [],
    wrongReason: false,
    wrongPriority: false,
    wrongDeadline: false,
    priorityDirection: 'ok',
    taskAgeImportance: 'ok',
    overdueImportance: 'ok',
    dueDateDirection: 'ok',
    calendarChoice: 'ok',
    calendarDurationDirection: 'ok',
    unnecessaryEvent: false,
    wrongCalendar: false,
    chosenCalendarId: '',
    chosenCalendarSummary: '',
    preferredCalendarId: '',
    preferredCalendarSummary: '',
    shouldBeUrgent: false,
    shouldBeLowerPriority: false,
    missingContext: false
  };
}

function sanitizeCommonAdvisorFeedback(value: Record<string, any> = {}) {
  return {
    ...createEmptyAdvisorFeedback(),
    overall: pickEnum(value.overall, ['useful', 'not_useful', 'mixed'], 'mixed'),
    wrongReason: value.wrongReason === true,
    missingContext: value.missingContext === true
  };
}

function sanitizeTagAdvisorFeedback(value: Record<string, any> = {}) {
  return {
    ...sanitizeCommonAdvisorFeedback(value),
    tagVolume: pickEnum(value.tagVolume, ['more', 'less', 'ok'], 'ok'),
    goodTags: sanitizeStringList(value.goodTags),
    badTags: sanitizeStringList(value.badTags),
    wrongPriority: value.wrongPriority === true,
    wrongDeadline: value.wrongDeadline === true
  };
}

function sanitizePriorityAdvisorFeedback(value: Record<string, any> = {}) {
  return {
    ...sanitizeCommonAdvisorFeedback(value),
    wrongPriority: value.wrongPriority === true,
    priorityDirection: pickEnum(value.priorityDirection, ['too_high', 'too_low', 'ok'], 'ok'),
    taskAgeImportance: pickEnum(value.taskAgeImportance, ['too_much', 'too_little', 'ok'], 'ok'),
    overdueImportance: pickEnum(value.overdueImportance, ['too_much', 'too_little', 'ok'], 'ok'),
    shouldBeUrgent: value.shouldBeUrgent === true,
    shouldBeLowerPriority: value.shouldBeLowerPriority === true
  };
}

function sanitizeDueDateAdvisorFeedback(value: Record<string, any> = {}) {
  return {
    ...sanitizeCommonAdvisorFeedback(value),
    wrongDeadline: value.wrongDeadline === true,
    dueDateDirection: pickEnum(value.dueDateDirection, ['too_early', 'too_late', 'ok'], 'ok')
  };
}

function sanitizeCalendarEventAdvisorFeedback(value: Record<string, any> = {}) {
  const calendarChoice = pickEnum(value.calendarChoice, ['ok', 'wrong'], value.wrongCalendar === true ? 'wrong' : 'ok');
  return {
    ...sanitizeCommonAdvisorFeedback(value),
    wrongDeadline: value.wrongDeadline === true,
    dueDateDirection: pickEnum(value.dueDateDirection, ['too_early', 'too_late', 'ok'], 'ok'),
    calendarChoice,
    calendarDurationDirection: pickEnum(value.calendarDurationDirection, ['too_short', 'too_long', 'ok'], 'ok'),
    unnecessaryEvent: value.unnecessaryEvent === true,
    wrongCalendar: calendarChoice === 'wrong' || value.wrongCalendar === true,
    chosenCalendarId: sanitizeString(value.chosenCalendarId),
    chosenCalendarSummary: sanitizeString(value.chosenCalendarSummary),
    preferredCalendarId: calendarChoice === 'wrong' ? sanitizeString(value.preferredCalendarId) : '',
    preferredCalendarSummary: calendarChoice === 'wrong' ? sanitizeString(value.preferredCalendarSummary) : ''
  };
}

function sanitizeGeneralAdvisorFeedback(value: Record<string, any> = {}) {
  return {
    ...sanitizeCommonAdvisorFeedback(value),
    tagVolume: pickEnum(value.tagVolume, ['more', 'less', 'ok'], 'ok'),
    goodTags: sanitizeStringList(value.goodTags),
    badTags: sanitizeStringList(value.badTags),
    wrongPriority: value.wrongPriority === true,
    wrongDeadline: value.wrongDeadline === true,
    priorityDirection: pickEnum(value.priorityDirection, ['too_high', 'too_low', 'ok'], 'ok'),
    taskAgeImportance: pickEnum(value.taskAgeImportance, ['too_much', 'too_little', 'ok'], 'ok'),
    overdueImportance: pickEnum(value.overdueImportance, ['too_much', 'too_little', 'ok'], 'ok'),
    dueDateDirection: pickEnum(value.dueDateDirection, ['too_early', 'too_late', 'ok'], 'ok'),
    shouldBeUrgent: value.shouldBeUrgent === true,
    shouldBeLowerPriority: value.shouldBeLowerPriority === true
  };
}

// Route feedback through an action-specific sanitizer while keeping one storage shape for jsonb.
function sanitizeAdvisorFeedback(action: string, value: Record<string, any> = {}) {
  if (action === 'suggest_tags') return sanitizeTagAdvisorFeedback(value);
  if (action === 'priority_management') return sanitizePriorityAdvisorFeedback(value);
  if (action === 'suggest_due_dates') return sanitizeDueDateAdvisorFeedback(value);
  if (action === 'schedule_calendar_events') return sanitizeCalendarEventAdvisorFeedback(value);
  return sanitizeGeneralAdvisorFeedback(value);
}

// Turn feedback on one proposal into a reusable rule for future Advisor requests.
function inferAdvisorMemoryRule({ action, commandPreview, feedback }: Record<string, any>) {
  const changes = commandPreview?.changes && typeof commandPreview.changes === 'object' ? commandPreview.changes : {};
  const calendarEvent = changes?.calendarEvent && typeof changes.calendarEvent === 'object' ? changes.calendarEvent : {};
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
    calendarChoice: feedback.calendarChoice,
    calendarDurationDirection: feedback.calendarDurationDirection,
    unnecessaryEvent: feedback.unnecessaryEvent,
    wrongCalendar: feedback.wrongCalendar,
    chosenCalendarId: feedback.chosenCalendarId || calendarEvent.calendarId || '',
    chosenCalendarSummary: feedback.chosenCalendarSummary || calendarEvent.calendarSummary || '',
    preferredCalendarId: feedback.preferredCalendarId,
    preferredCalendarSummary: feedback.preferredCalendarSummary,
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

// Mapping. Turn feedback on a whole Advisor batch into an action-level preference.
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
    calendarChoice: feedback.calendarChoice,
    calendarDurationDirection: feedback.calendarDurationDirection,
    unnecessaryEvent: feedback.unnecessaryEvent,
    wrongCalendar: feedback.wrongCalendar,
    chosenCalendarId: feedback.chosenCalendarId,
    chosenCalendarSummary: feedback.chosenCalendarSummary,
    preferredCalendarId: feedback.preferredCalendarId,
    preferredCalendarSummary: feedback.preferredCalendarSummary,
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

// Mapping. Convert database rows into a compact, prompt-safe memory block for the AI request.
function buildAdvisorMemoryContext(rules: any[] = []) {
  return rules
    .filter((item) => item?.rule && Object.keys(item.rule).length)
    .slice(0, 40) // TODO: dinamically limit based on token count instead of row count
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
      calendarChoice: item.rule.calendarChoice || 'ok',
      calendarDurationDirection: item.rule.calendarDurationDirection || 'ok',
      unnecessaryEvent: item.rule.unnecessaryEvent === true,
      wrongCalendar: item.rule.wrongCalendar === true,
      chosenCalendarId: item.rule.chosenCalendarId || '',
      chosenCalendarSummary: item.rule.chosenCalendarSummary || '',
      preferredCalendarId: item.rule.preferredCalendarId || '',
      preferredCalendarSummary: item.rule.preferredCalendarSummary || '',
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
  return new Set(values.map((value) => sanitizeWord(String(value || ''))).filter(Boolean));
}

// TODO: Think in a way to make this more robust.
function titleMatchesRule(title: string, rule: Record<string, any>) {
  const titleWords = normalizedSet(titleFingerprint(title).split(' '));
  const ruleWords = normalizedSet(rule.titleKeywords || []);
  if (!ruleWords.size || !titleWords.size) return false;
  const overlap = [...ruleWords].filter((word) => titleWords.has(word)).length;
  return overlap >= Math.min(2, ruleWords.size);
}

// TODO: Remove this redundant function once all code is migrated to advisorPreviewTitle.
function previewTitle(preview: Record<string, any>) {
  return advisorPreviewTitle(preview);
}

// TODO: Verify if this make sense to open so many possibilities
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
  return afterTags.map(String).filter((tag) => !beforeTags.has(sanitizeWord(tag)));
}

// Apply learned "do not show this again" style rules before proposals reach the UI.
function memoryRuleSummary(rule: Record<string, any>) {
  const parts = [];
  if (rule.avoidSimilarSuggestions) parts.push('avoid similar');
  if (rule.avoidTags?.length) parts.push(`avoid tags: ${rule.avoidTags.join(', ')}`);
  if (rule.tagVolume && rule.tagVolume !== 'ok') parts.push(`tag volume: ${rule.tagVolume}`);
  if (rule.unnecessaryEvent) parts.push('unnecessary event');
  if (rule.wrongCalendar) parts.push('wrong calendar');
  if (rule.dueDateDirection && rule.dueDateDirection !== 'ok') parts.push(`date/time: ${rule.dueDateDirection}`);
  if (rule.calendarDurationDirection && rule.calendarDurationDirection !== 'ok') parts.push(`duration: ${rule.calendarDurationDirection}`);
  if (rule.askForMoreContext) parts.push('ask for more context');
  return parts.join('; ') || 'matched memory rule';
}

function matchingMemorySuppressions(preview: Record<string, any>, memory: any[] = [], action = '') {
  const title = previewTitle(preview);
  const addedTags = previewAddedTags(preview);
  const addedTagKeys = normalizedSet(addedTags);

  return memory.flatMap((rule) => {
    if (rule.action && rule.action !== action) return [];
    if (!titleMatchesRule(title, rule)) return [];
    const matchedReasons = [];
    if (rule.avoidSimilarSuggestions && rule.appliesToCommandType === preview.type) matchedReasons.push('avoidSimilarSuggestions');

    if (rule.ruleType === 'tag_suggestion' && preview.type === 'update_task') {
      const avoidTags = normalizedSet(rule.avoidTags || []);
      if ([...avoidTags].some((tag) => addedTagKeys.has(tag))) matchedReasons.push('avoidTags');
      if (rule.tagVolume === 'less' && addedTags.length > 1) matchedReasons.push('tagVolumeLess');
    }

    if (!matchedReasons.length) return [];
    return [{
      ruleType: rule.ruleType,
      action: rule.action,
      appliesToCommandType: rule.appliesToCommandType || '',
      titleKeywords: rule.titleKeywords || [],
      supportCount: rule.supportCount || 1,
      matchedReasons,
      summary: memoryRuleSummary(rule),
      rule: {
        avoidSimilarSuggestions: rule.avoidSimilarSuggestions,
        avoidTags: rule.avoidTags || [],
        tagVolume: rule.tagVolume,
        unnecessaryEvent: rule.unnecessaryEvent,
        wrongCalendar: rule.wrongCalendar,
        dueDateDirection: rule.dueDateDirection,
        calendarDurationDirection: rule.calendarDurationDirection,
        askForMoreContext: rule.askForMoreContext
      }
    }];
  });
}

// Keep raw commands and their previews in sync while removing memory-suppressed proposals.
function filterAdvisorCommandPairsByMemory({ commands = [], previews = [], memory = [], action = '' }: Record<string, any>) {
  const keptCommands = [];
  const keptPreviews = [];
  const rejected = [];
  previews.forEach((preview, index) => {
    const suppressions = matchingMemorySuppressions(preview, memory, action);
    if (suppressions.length) {
      rejected.push({ command: commands[index], preview, memoryRules: suppressions });
      return;
    }
    keptPreviews.push(preview);
    keptCommands.push(commands[index]);
  });
  return { commands: keptCommands, previews: keptPreviews, rejected };
}

module.exports = {
  advisorPreviewTitle,
  titleFingerprint,
  sanitizeAdvisorFeedback,
  inferAdvisorMemoryRule,
  inferAdvisorInteractionMemoryRule,
  buildAdvisorMemoryContext,
  matchingMemorySuppressions,
  filterAdvisorCommandPairsByMemory
};

export { };
