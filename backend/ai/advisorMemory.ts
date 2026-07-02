const STOP_WORDS = new Set([
  'a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos',
  'o', 'os', 'para', 'por', 'que', 'the', 'to', 'of', 'and'
]);

function normalizeWord(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function titleFingerprint(title = '') {
  return [...new Set(String(title)
    .split(/\s+/)
    .map(normalizeWord)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))]
    .slice(0, 8)
    .join(' ');
}

function sanitizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 20);
}

function sanitizeAdvisorFeedback(value: Record<string, any> = {}) {
  const overall = ['useful', 'not_useful', 'mixed'].includes(value.overall) ? value.overall : 'mixed';
  const tagVolume = ['more', 'less', 'ok'].includes(value.tagVolume) ? value.tagVolume : 'ok';
  return {
    overall,
    tagVolume,
    goodTags: sanitizeStringList(value.goodTags),
    badTags: sanitizeStringList(value.badTags),
    wrongReason: value.wrongReason === true,
    wrongPriority: value.wrongPriority === true,
    wrongDeadline: value.wrongDeadline === true,
    missingContext: value.missingContext === true
  };
}

function inferAdvisorMemoryRule({ action, commandPreview, feedback }: Record<string, any>) {
  const changes = commandPreview?.changes && typeof commandPreview.changes === 'object' ? commandPreview.changes : {};
  const title = commandPreview?.taskTitle
    || changes?.after?.title
    || changes?.before?.title
    || changes?.createdTask?.title
    || '';
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
    askForMoreContext: feedback.missingContext
  };
  Object.keys(rule).forEach((key) => {
    if (Array.isArray(rule[key]) && !rule[key].length) delete rule[key];
    if (rule[key] === false || rule[key] === '' || rule[key] == null) delete rule[key];
  });
  return {
    ruleType: commandPreview?.type === 'update_task' && (feedback.goodTags.length || feedback.badTags.length || feedback.tagVolume !== 'ok')
      ? 'tag_suggestion'
      : 'advisor_suggestion',
    titleFingerprint: fingerprint,
    action: String(action || ''),
    rule
  };
}

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
      askForMoreContext: item.rule.askForMoreContext === true,
      supportCount: item.supportCount || 1
    }));
}

function normalizedSet(values: unknown[] = []) {
  return new Set(values.map((value) => normalizeWord(String(value || ''))).filter(Boolean));
}

function titleMatchesRule(title: string, rule: Record<string, any>) {
  const titleWords = normalizedSet(titleFingerprint(title).split(' '));
  const ruleWords = normalizedSet(rule.titleKeywords || []);
  if (!ruleWords.size || !titleWords.size) return false;
  const overlap = [...ruleWords].filter((word) => titleWords.has(word)).length;
  return overlap >= Math.min(2, ruleWords.size);
}

function previewTitle(preview: Record<string, any>) {
  const changes = preview?.changes && typeof preview.changes === 'object' ? preview.changes : {};
  return preview?.taskTitle
    || changes?.after?.title
    || changes?.before?.title
    || changes?.createdTask?.title
    || '';
}

function previewAddedTags(preview: Record<string, any>) {
  const changes = preview?.changes && typeof preview.changes === 'object' ? preview.changes : {};
  const beforeTags = normalizedSet(changes?.before?.tags || []);
  const afterTags = Array.isArray(changes?.after?.tags)
    ? changes.after.tags
    : Array.isArray(changes?.createdTask?.tags) ? changes.createdTask.tags : [];
  return afterTags.map(String).filter((tag) => !beforeTags.has(normalizeWord(tag)));
}

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
  titleFingerprint,
  sanitizeAdvisorFeedback,
  inferAdvisorMemoryRule,
  buildAdvisorMemoryContext,
  filterAdvisorCommandPairsByMemory
};

export {};
