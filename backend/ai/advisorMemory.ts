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

function sanitizeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function changedPreviewFields(commandPreview: Record<string, any>) {
  const changes = commandPreview?.changes && typeof commandPreview.changes === 'object' ? commandPreview.changes : {};
  const before = changes.before && typeof changes.before === 'object' ? changes.before : {};
  const after = changes.after && typeof changes.after === 'object' ? changes.after : {};
  return Object.keys(after).filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
}

function sourceTaskFromPreview(commandPreview: Record<string, any>, sourceTask: Record<string, any> = {}) {
  const changes = commandPreview?.changes && typeof commandPreview.changes === 'object' ? commandPreview.changes : {};
  const before = changes.before && typeof changes.before === 'object' ? changes.before : {};
  const after = changes.after && typeof changes.after === 'object' ? changes.after : {};
  const createdTask = changes.createdTask && typeof changes.createdTask === 'object' ? changes.createdTask : {};
  return {
    ...sourceTask,
    ...before,
    ...after,
    ...createdTask
  };
}

function buildAdvisorRuleContext({ commandPreview, sourceTask = {} }: Record<string, any>) {
  const title = advisorPreviewTitle(commandPreview);
  const task = sourceTaskFromPreview(commandPreview, sourceTask);
  const dueDate = task.dueDateTime || task.dueDate || task.due_at || '';
  const dueTime = Date.parse(dueDate || '');
  const now = Date.now();
  return {
    titleKeywords: titleFingerprint(title).split(' ').filter(Boolean),
    commandTypes: commandPreview?.type ? [String(commandPreview.type)] : [],
    changedFields: changedPreviewFields(commandPreview),
    requiredTags: sanitizeStringList(task.tags),
    statuses: task.status ? [String(task.status)] : [],
    priorityMin: task.priority == null ? null : Number(task.priority),
    priorityMax: task.priority == null ? null : Number(task.priority),
    hasDueDate: Boolean(dueDate),
    isOverdue: Boolean(dueDate && !Number.isNaN(dueTime) && dueTime < now),
    isBlocked: Boolean(task.blockedReason || (Array.isArray(task.blockedByTaskIds) && task.blockedByTaskIds.length))
  };
}

function cleanRuleContext(context: Record<string, any> = {}) {
  const cleaned: Record<string, any> = {
    titleKeywords: sanitizeStringList(context.titleKeywords),
    commandTypes: sanitizeStringList(context.commandTypes),
    changedFields: sanitizeStringList(context.changedFields),
    requiredTags: sanitizeStringList(context.requiredTags),
    statuses: sanitizeStringList(context.statuses),
    priorityMin: context.priorityMin == null ? null : sanitizeNumber(context.priorityMin, 0),
    priorityMax: context.priorityMax == null ? null : sanitizeNumber(context.priorityMax, 0),
    hasDueDate: typeof context.hasDueDate === 'boolean' ? context.hasDueDate : null,
    isOverdue: typeof context.isOverdue === 'boolean' ? context.isOverdue : null,
    isBlocked: typeof context.isBlocked === 'boolean' ? context.isBlocked : null
  };
  Object.keys(cleaned).forEach((key) => {
    if (Array.isArray(cleaned[key]) && !cleaned[key].length) delete cleaned[key];
    if (cleaned[key] == null) delete cleaned[key];
  });
  return cleaned;
}

function cleanRuleBehavior(behavior: Record<string, any> = {}) {
  const cleaned: Record<string, any> = {
    avoidTags: sanitizeStringList(behavior.avoidTags),
    preferTags: sanitizeStringList(behavior.preferTags),
    tagVolume: pickEnum(behavior.tagVolume, ['more', 'less', 'ok'], 'ok'),
    avoidSimilarSuggestions: behavior.avoidSimilarSuggestions === true,
    reviewReasoning: behavior.reviewReasoning === true,
    reviewPriority: behavior.reviewPriority === true,
    reviewDeadline: behavior.reviewDeadline === true,
    priorityDirection: pickEnum(behavior.priorityDirection, ['too_high', 'too_low', 'ok'], 'ok'),
    taskAgeImportance: pickEnum(behavior.taskAgeImportance, ['too_much', 'too_little', 'ok'], 'ok'),
    overdueImportance: pickEnum(behavior.overdueImportance, ['too_much', 'too_little', 'ok'], 'ok'),
    dueDateDirection: pickEnum(behavior.dueDateDirection, ['too_early', 'too_late', 'ok'], 'ok'),
    calendarChoice: pickEnum(behavior.calendarChoice, ['wrong', 'ok'], 'ok'),
    calendarDurationDirection: pickEnum(behavior.calendarDurationDirection, ['too_short', 'too_long', 'ok'], 'ok'),
    unnecessaryEvent: behavior.unnecessaryEvent === true,
    wrongCalendar: behavior.wrongCalendar === true,
    chosenCalendarId: sanitizeString(behavior.chosenCalendarId),
    chosenCalendarSummary: sanitizeString(behavior.chosenCalendarSummary),
    preferredCalendarId: sanitizeString(behavior.preferredCalendarId),
    preferredCalendarSummary: sanitizeString(behavior.preferredCalendarSummary),
    shouldBeUrgent: behavior.shouldBeUrgent === true,
    shouldBeLowerPriority: behavior.shouldBeLowerPriority === true,
    askForMoreContext: behavior.askForMoreContext === true
  };
  Object.keys(cleaned).forEach((key) => {
    if (Array.isArray(cleaned[key]) && !cleaned[key].length) delete cleaned[key];
    if (cleaned[key] === false || cleaned[key] === '' || cleaned[key] == null) delete cleaned[key];
    if (cleaned[key] === 'ok') delete cleaned[key];
  });
  return cleaned;
}

function ruleBehavior(rule: Record<string, any> = {}) {
  return { ...rule, ...(rule.behavior && typeof rule.behavior === 'object' ? rule.behavior : {}) };
}

function ruleContext(rule: Record<string, any> = {}) {
  return { ...(rule.context && typeof rule.context === 'object' ? rule.context : {}), titleKeywords: rule.context?.titleKeywords || rule.titleKeywords || [] };
}

function contextSpecificity(context: Record<string, any> = {}) {
  let score = 0;
  if (context.commandTypes?.length) score += 2;
  if (context.changedFields?.length) score += 2;
  if (context.requiredTags?.length) score += 2;
  if (context.statuses?.length) score += 1;
  if (context.titleKeywords?.length) score += Math.min(2, context.titleKeywords.length);
  for (const key of ['hasDueDate', 'isOverdue', 'isBlocked']) {
    if (typeof context[key] === 'boolean') score += 1;
  }
  if (context.priorityMin != null || context.priorityMax != null) score += 1;
  return score;
}

function memoryRuleStrength(item: Record<string, any> = {}) {
  const context = ruleContext(item.rule || item);
  const behavior = ruleBehavior(item.rule || item);
  const confidence = Number(behavior.confidence ?? item.rule?.confidence ?? 0);
  const supportCount = Number(item.supportCount || item.support_count || 1);
  const specificity = contextSpecificity(context);
  return specificity * 10 + Math.min(10, supportCount * 2) + Math.max(0, Math.min(1, confidence)) * 5;
}

function hasConcreteBehavior(behavior: Record<string, any> = {}) {
  return [
    'avoidTags',
    'preferTags'
  ].some((key) => Array.isArray(behavior[key]) && behavior[key].length)
    || [
      'avoidSimilarSuggestions',
      'reviewReasoning',
      'reviewPriority',
      'reviewDeadline',
      'unnecessaryEvent',
      'wrongCalendar',
      'shouldBeUrgent',
      'shouldBeLowerPriority',
      'askForMoreContext'
    ].some((key) => behavior[key] === true)
    || [
      'tagVolume',
      'priorityDirection',
      'taskAgeImportance',
      'overdueImportance',
      'dueDateDirection',
      'calendarChoice',
      'calendarDurationDirection'
    ].some((key) => behavior[key] && behavior[key] !== 'ok');
}

function isWeakGenericRule(item: Record<string, any> = {}) {
  const behavior = ruleBehavior(item.rule || item);
  const context = ruleContext(item.rule || item);
  const confidence = Number(behavior.confidence ?? item.rule?.confidence ?? 0);
  const supportCount = Number(item.supportCount || item.support_count || 1);
  return contextSpecificity(context) < 3 && supportCount < 2 && confidence < 0.7;
}

function conflictClaimsForBehavior(behavior: Record<string, any> = {}) {
  const claims: Array<{ family: string; value: string }> = [];
  for (const tag of behavior.avoidTags || []) {
    claims.push({ family: `tag:${sanitizeWord(tag)}`, value: 'avoid' });
  }
  for (const tag of behavior.preferTags || []) {
    claims.push({ family: `tag:${sanitizeWord(tag)}`, value: 'prefer' });
  }
  for (const key of ['tagVolume', 'priorityDirection', 'taskAgeImportance', 'overdueImportance', 'dueDateDirection', 'calendarChoice', 'calendarDurationDirection']) {
    if (behavior[key] && behavior[key] !== 'ok') claims.push({ family: key, value: String(behavior[key]) });
  }
  if (behavior.shouldBeUrgent) claims.push({ family: 'priorityIntent', value: 'urgent' });
  if (behavior.shouldBeLowerPriority) claims.push({ family: 'priorityIntent', value: 'lower' });
  return claims.filter((claim) => claim.family && claim.value);
}

function listOverlaps(left: unknown[] = [], right: unknown[] = []) {
  if (!left.length || !right.length) return true;
  const rightSet = normalizedSet(right);
  return [...normalizedSet(left)].some((item) => rightSet.has(item));
}

function contextsMayOverlap(left: Record<string, any> = {}, right: Record<string, any> = {}) {
  if (!listOverlaps(left.commandTypes || [], right.commandTypes || [])) return false;
  if (!listOverlaps(left.changedFields || [], right.changedFields || [])) return false;
  if (!listOverlaps(left.requiredTags || [], right.requiredTags || [])) return false;
  if (!listOverlaps(left.statuses || [], right.statuses || [])) return false;
  for (const key of ['hasDueDate', 'isOverdue', 'isBlocked']) {
    if (typeof left[key] === 'boolean' && typeof right[key] === 'boolean' && left[key] !== right[key]) return false;
  }
  if ((left.titleKeywords || []).length >= 2 && (right.titleKeywords || []).length >= 2 && !listOverlaps(left.titleKeywords, right.titleKeywords)) return false;
  return true;
}

function filterSpecificNonConflictingMemoryRules(rules: any[] = []) {
  const selected: Array<{ claims: Array<{ family: string; value: string }>; context: Record<string, any> }> = [];
  return rules
    .filter((item) => {
      const behavior = ruleBehavior(item.rule || item);
      return hasConcreteBehavior(behavior) && !isWeakGenericRule(item);
    })
    .sort((a, b) => memoryRuleStrength(b) - memoryRuleStrength(a))
    .filter((item) => {
      const claims = conflictClaimsForBehavior(ruleBehavior(item.rule || item));
      const context = ruleContext(item.rule || item);
      const conflicts = selected.some((selectedRule) => (
        contextsMayOverlap(context, selectedRule.context)
        && claims.some((claim) => selectedRule.claims.some((selectedClaim) => selectedClaim.family === claim.family && selectedClaim.value !== claim.value))
      ));
      if (conflicts) return false;
      selected.push({ claims, context });
      return true;
    });
}

function listIntersection(left: unknown[] = [], right: unknown[] = []) {
  if (!left.length) return sanitizeStringList(right);
  if (!right.length) return sanitizeStringList(left);
  const rightSet = normalizedSet(right);
  return sanitizeStringList(left).filter((item) => rightSet.has(sanitizeWord(item)));
}

function mergeContextLists(existing: Record<string, any>, incoming: Record<string, any>, key: string) {
  const left = existing[key] || [];
  const right = incoming[key] || [];
  if (!left.length && !right.length) return [];
  if (key === 'titleKeywords') return sanitizeStringList([...left, ...right]);
  return listIntersection(left, right);
}

function mergeContextValue(existing: Record<string, any>, incoming: Record<string, any>, key: string) {
  if (existing[key] == null) return incoming[key];
  if (incoming[key] == null) return existing[key];
  return existing[key] === incoming[key] ? existing[key] : undefined;
}

function mergeRuleContexts(existingContext: Record<string, any> = {}, incomingContext: Record<string, any> = {}) {
  return cleanRuleContext({
    titleKeywords: mergeContextLists(existingContext, incomingContext, 'titleKeywords'),
    commandTypes: mergeContextLists(existingContext, incomingContext, 'commandTypes'),
    changedFields: mergeContextLists(existingContext, incomingContext, 'changedFields'),
    requiredTags: mergeContextLists(existingContext, incomingContext, 'requiredTags'),
    statuses: mergeContextLists(existingContext, incomingContext, 'statuses'),
    priorityMin: existingContext.priorityMin == null
      ? incomingContext.priorityMin
      : incomingContext.priorityMin == null ? existingContext.priorityMin : Math.min(Number(existingContext.priorityMin), Number(incomingContext.priorityMin)),
    priorityMax: existingContext.priorityMax == null
      ? incomingContext.priorityMax
      : incomingContext.priorityMax == null ? existingContext.priorityMax : Math.max(Number(existingContext.priorityMax), Number(incomingContext.priorityMax)),
    hasDueDate: mergeContextValue(existingContext, incomingContext, 'hasDueDate'),
    isOverdue: mergeContextValue(existingContext, incomingContext, 'isOverdue'),
    isBlocked: mergeContextValue(existingContext, incomingContext, 'isBlocked')
  });
}

function mergeEnumBehavior(existing: Record<string, any>, incoming: Record<string, any>, key: string) {
  if (!existing[key] || existing[key] === 'ok') return incoming[key];
  if (!incoming[key] || incoming[key] === 'ok') return existing[key];
  return existing[key] === incoming[key] ? existing[key] : 'ok';
}

function mergeRuleBehaviors(existingBehavior: Record<string, any> = {}, incomingBehavior: Record<string, any> = {}) {
  const avoidTags = sanitizeStringList([...(existingBehavior.avoidTags || []), ...(incomingBehavior.avoidTags || [])]);
  const preferTags = sanitizeStringList([...(existingBehavior.preferTags || []), ...(incomingBehavior.preferTags || [])]);
  const avoided = normalizedSet(avoidTags);
  const preferred = normalizedSet(preferTags);
  const conflictingTags = new Set([...avoided].filter((tag) => preferred.has(tag)));

  return cleanRuleBehavior({
    avoidTags: avoidTags.filter((tag) => !conflictingTags.has(sanitizeWord(tag))),
    preferTags: preferTags.filter((tag) => !conflictingTags.has(sanitizeWord(tag))),
    tagVolume: mergeEnumBehavior(existingBehavior, incomingBehavior, 'tagVolume'),
    avoidSimilarSuggestions: existingBehavior.avoidSimilarSuggestions === true || incomingBehavior.avoidSimilarSuggestions === true,
    reviewReasoning: existingBehavior.reviewReasoning === true || incomingBehavior.reviewReasoning === true || conflictingTags.size > 0,
    reviewPriority: existingBehavior.reviewPriority === true || incomingBehavior.reviewPriority === true || (existingBehavior.shouldBeUrgent && incomingBehavior.shouldBeLowerPriority) || (existingBehavior.shouldBeLowerPriority && incomingBehavior.shouldBeUrgent),
    reviewDeadline: existingBehavior.reviewDeadline === true || incomingBehavior.reviewDeadline === true,
    priorityDirection: mergeEnumBehavior(existingBehavior, incomingBehavior, 'priorityDirection'),
    taskAgeImportance: mergeEnumBehavior(existingBehavior, incomingBehavior, 'taskAgeImportance'),
    overdueImportance: mergeEnumBehavior(existingBehavior, incomingBehavior, 'overdueImportance'),
    dueDateDirection: mergeEnumBehavior(existingBehavior, incomingBehavior, 'dueDateDirection'),
    calendarChoice: mergeEnumBehavior(existingBehavior, incomingBehavior, 'calendarChoice'),
    calendarDurationDirection: mergeEnumBehavior(existingBehavior, incomingBehavior, 'calendarDurationDirection'),
    unnecessaryEvent: existingBehavior.unnecessaryEvent === true || incomingBehavior.unnecessaryEvent === true,
    wrongCalendar: existingBehavior.wrongCalendar === true || incomingBehavior.wrongCalendar === true,
    chosenCalendarId: incomingBehavior.chosenCalendarId || existingBehavior.chosenCalendarId || '',
    chosenCalendarSummary: incomingBehavior.chosenCalendarSummary || existingBehavior.chosenCalendarSummary || '',
    preferredCalendarId: incomingBehavior.preferredCalendarId || existingBehavior.preferredCalendarId || '',
    preferredCalendarSummary: incomingBehavior.preferredCalendarSummary || existingBehavior.preferredCalendarSummary || '',
    shouldBeUrgent: existingBehavior.shouldBeUrgent === true && incomingBehavior.shouldBeLowerPriority !== true || incomingBehavior.shouldBeUrgent === true && existingBehavior.shouldBeLowerPriority !== true,
    shouldBeLowerPriority: existingBehavior.shouldBeLowerPriority === true && incomingBehavior.shouldBeUrgent !== true || incomingBehavior.shouldBeLowerPriority === true && existingBehavior.shouldBeUrgent !== true,
    askForMoreContext: existingBehavior.askForMoreContext === true || incomingBehavior.askForMoreContext === true
  });
}

function mergeAdvisorMemoryRulePayload(existingRule: Record<string, any> = {}, incomingRule: Record<string, any> = {}) {
  const existingBehavior = cleanRuleBehavior(ruleBehavior(existingRule));
  const incomingBehavior = cleanRuleBehavior(ruleBehavior(incomingRule));
  const existingContext = cleanRuleContext(ruleContext(existingRule));
  const incomingContext = cleanRuleContext(ruleContext(incomingRule));
  const behavior = mergeRuleBehaviors(existingBehavior, incomingBehavior);
  const context = mergeRuleContexts(existingContext, incomingContext);
  const confidence = Math.max(Number(existingRule.confidence || 0), Number(incomingRule.confidence || 0));
  const source = incomingRule.source === 'openai_feedback_interpretation' || existingRule.source === 'openai_feedback_interpretation'
    ? 'openai_feedback_interpretation'
    : 'backend_feedback_fallback';
  const summary = sanitizeString(incomingRule.summary) || sanitizeString(existingRule.summary) || memoryRuleSummary(behavior);
  return {
    ...existingRule,
    ...behavior,
    titleKeywords: context.titleKeywords || existingRule.titleKeywords || incomingRule.titleKeywords || [],
    summary,
    source,
    confidence,
    context,
    behavior
  };
}

function mergeInterpretedRule({ fallbackRule, interpretedRule, commandPreview, sourceTask = {} }: Record<string, any>) {
  const fallbackBehavior = cleanRuleBehavior(fallbackRule.rule || {});
  const interpretedBehavior = cleanRuleBehavior(interpretedRule?.behavior || interpretedRule?.rule || {});
  const interpretedContext = cleanRuleContext(interpretedRule?.context || {});
  const fallbackContext = cleanRuleContext(buildAdvisorRuleContext({ commandPreview, sourceTask }));
  const context = cleanRuleContext({ ...fallbackContext, ...interpretedContext });
  const behavior = cleanRuleBehavior({ ...fallbackBehavior, ...interpretedBehavior });
  const confidence = Math.max(0, Math.min(1, sanitizeNumber(interpretedRule?.confidence, 0)));
  const source = interpretedRule?.source === 'openai_feedback_interpretation'
    ? 'openai_feedback_interpretation'
    : 'backend_feedback_fallback';
  const summary = sanitizeString(interpretedRule?.summary) || memoryRuleSummary({ ...fallbackBehavior, ...behavior });
  return {
    ...fallbackRule,
    rule: {
      ...fallbackRule.rule,
      ...behavior,
      titleKeywords: context.titleKeywords || fallbackRule.rule.titleKeywords || [],
      summary,
      source,
      confidence,
      context,
      behavior
    }
  };
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
  return filterSpecificNonConflictingMemoryRules(rules)
    .filter((item) => item?.rule && Object.keys(item.rule).length)
    .slice(0, 40) // TODO: dinamically limit based on token count instead of row count
    .map((item) => ({ item, behavior: ruleBehavior(item.rule), context: ruleContext(item.rule) }))
    .map((item) => ({
      ruleType: item.item.ruleType,
      action: item.item.action,
      summary: item.item.rule.summary || '',
      source: item.item.rule.source || 'backend_feedback_fallback',
      confidence: item.item.rule.confidence ?? null,
      context: item.context,
      behavior: item.behavior,
      appliesToCommandType: item.behavior.appliesToCommandType || item.context.commandTypes?.[0] || '',
      titleKeywords: item.context.titleKeywords || item.item.titleFingerprint?.split(' ') || [],
      avoidTags: item.behavior.avoidTags || [],
      preferTags: item.behavior.preferTags || [],
      tagVolume: item.behavior.tagVolume || 'ok',
      avoidSimilarSuggestions: item.behavior.avoidSimilarSuggestions === true,
      reviewReasoning: item.behavior.reviewReasoning === true,
      reviewPriority: item.behavior.reviewPriority === true,
      reviewDeadline: item.behavior.reviewDeadline === true,
      priorityDirection: item.behavior.priorityDirection || 'ok',
      taskAgeImportance: item.behavior.taskAgeImportance || 'ok',
      overdueImportance: item.behavior.overdueImportance || 'ok',
      dueDateDirection: item.behavior.dueDateDirection || 'ok',
      calendarChoice: item.behavior.calendarChoice || 'ok',
      calendarDurationDirection: item.behavior.calendarDurationDirection || 'ok',
      unnecessaryEvent: item.behavior.unnecessaryEvent === true,
      wrongCalendar: item.behavior.wrongCalendar === true,
      chosenCalendarId: item.behavior.chosenCalendarId || '',
      chosenCalendarSummary: item.behavior.chosenCalendarSummary || '',
      preferredCalendarId: item.behavior.preferredCalendarId || '',
      preferredCalendarSummary: item.behavior.preferredCalendarSummary || '',
      shouldBeUrgent: item.behavior.shouldBeUrgent === true,
      shouldBeLowerPriority: item.behavior.shouldBeLowerPriority === true,
      askForMoreContext: item.behavior.askForMoreContext === true,
      interactionWasUseful: item.behavior.interactionWasUseful === true,
      interactionWasMixed: item.behavior.interactionWasMixed === true,
      supportCount: item.item.supportCount || 1
    }));
}

// Normalize lists before comparing tags/title keywords across user feedback and previews.
function normalizedSet(values: unknown[] = []) {
  return new Set(values.map((value) => sanitizeWord(String(value || ''))).filter(Boolean));
}

// TODO: Think in a way to make this more robust.
function titleMatchesRule(title: string, rule: Record<string, any>) {
  const titleWords = normalizedSet(titleFingerprint(title).split(' '));
  const context = ruleContext(rule);
  const ruleWords = normalizedSet(context.titleKeywords || []);
  if (!ruleWords.size || !titleWords.size) return false;
  const overlap = [...ruleWords].filter((word) => titleWords.has(word)).length;
  return overlap >= Math.min(2, ruleWords.size);
}

function previewContext(commandPreview: Record<string, any>) {
  return buildAdvisorRuleContext({ commandPreview });
}

function contextMatchesRule(preview: Record<string, any>, rule: Record<string, any>) {
  const expected = ruleContext(rule);
  const actual = previewContext(preview);
  const behavior = ruleBehavior(rule);
  const supportCount = Number(rule.supportCount || 1);
  const confidence = Number(behavior.confidence ?? 0);
  const specificity = contextSpecificity(expected);
  if (!hasConcreteBehavior(behavior)) return false;
  if (specificity < 3 && supportCount < 2 && confidence < 0.7) return false;
  let score = 0;
  let possible = 0;

  if (expected.commandTypes?.length) {
    possible += 3;
    if (expected.commandTypes.includes(preview.type)) score += 3;
    else return false;
  }
  if (expected.changedFields?.length) {
    possible += 3;
    const actualFields = new Set(actual.changedFields || []);
    if (expected.changedFields.some((field) => actualFields.has(field))) score += 3;
    else return false;
  }
  if (expected.requiredTags?.length) {
    possible += 2;
    const actualTags = normalizedSet(actual.requiredTags || []);
    if (expected.requiredTags.some((tag) => actualTags.has(sanitizeWord(tag)))) score += 2;
    else return false;
  }
  if (expected.statuses?.length) {
    possible += 1;
    if (expected.statuses.includes(actual.statuses?.[0])) score += 1;
    else return false;
  }
  for (const key of ['hasDueDate', 'isOverdue', 'isBlocked']) {
    if (typeof expected[key] === 'boolean') {
      possible += 1;
      if (expected[key] === actual[key]) score += 1;
      else return false;
    }
  }
  if (titleMatchesRule(previewTitle(preview), rule)) {
    possible += 2;
    score += 2;
  }

  if (!possible) return false;
  return score >= Math.max(3, Math.ceil(possible * 0.75));
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
  const behavior = ruleBehavior(rule);
  const parts = [];
  if (rule.summary) parts.push(rule.summary);
  if (behavior.avoidSimilarSuggestions) parts.push('avoid similar');
  if (behavior.avoidTags?.length) parts.push(`avoid tags: ${behavior.avoidTags.join(', ')}`);
  if (behavior.tagVolume && behavior.tagVolume !== 'ok') parts.push(`tag volume: ${behavior.tagVolume}`);
  if (behavior.unnecessaryEvent) parts.push('unnecessary event');
  if (behavior.wrongCalendar) parts.push('wrong calendar');
  if (behavior.dueDateDirection && behavior.dueDateDirection !== 'ok') parts.push(`date/time: ${behavior.dueDateDirection}`);
  if (behavior.calendarDurationDirection && behavior.calendarDurationDirection !== 'ok') parts.push(`duration: ${behavior.calendarDurationDirection}`);
  if (behavior.askForMoreContext) parts.push('ask for more context');
  return parts.join('; ') || 'matched memory rule';
}

function matchingMemorySuppressions(preview: Record<string, any>, memory: any[] = [], action = '') {
  const title = previewTitle(preview);
  const addedTags = previewAddedTags(preview);
  const addedTagKeys = normalizedSet(addedTags);

  return memory.flatMap((rule) => {
    if (rule.action && rule.action !== action) return [];
    if (!contextMatchesRule(preview, rule)) return [];
    const behavior = ruleBehavior(rule);
    const context = ruleContext(rule);
    const matchedReasons = [];
    const commandTypes = context.commandTypes || [];
    if (behavior.avoidSimilarSuggestions && (behavior.appliesToCommandType === preview.type || !commandTypes.length || commandTypes.includes(preview.type))) matchedReasons.push('avoidSimilarSuggestions');

    if (rule.ruleType === 'tag_suggestion' && preview.type === 'update_task') {
      const avoidTags = normalizedSet(behavior.avoidTags || []);
      if ([...avoidTags].some((tag) => addedTagKeys.has(tag))) matchedReasons.push('avoidTags');
      if (behavior.tagVolume === 'less' && addedTags.length > 1) matchedReasons.push('tagVolumeLess');
    }

    if (!matchedReasons.length) return [];
    return [{
      ruleType: rule.ruleType,
      action: rule.action,
      appliesToCommandType: behavior.appliesToCommandType || context.commandTypes?.[0] || '',
      titleKeywords: context.titleKeywords || [],
      context,
      supportCount: rule.supportCount || 1,
      matchedReasons,
      summary: memoryRuleSummary(rule),
      rule: {
        avoidSimilarSuggestions: behavior.avoidSimilarSuggestions,
        avoidTags: behavior.avoidTags || [],
        tagVolume: behavior.tagVolume,
        unnecessaryEvent: behavior.unnecessaryEvent,
        wrongCalendar: behavior.wrongCalendar,
        dueDateDirection: behavior.dueDateDirection,
        calendarDurationDirection: behavior.calendarDurationDirection,
        askForMoreContext: behavior.askForMoreContext
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
  buildAdvisorRuleContext,
  cleanRuleBehavior,
  cleanRuleContext,
  mergeInterpretedRule,
  mergeAdvisorMemoryRulePayload,
  buildAdvisorMemoryContext,
  matchingMemorySuppressions,
  filterAdvisorCommandPairsByMemory
};

export { };
