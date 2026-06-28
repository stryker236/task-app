function extractOpenAiResponseText(responseBody) {
  if (typeof responseBody.output_text === 'string') return responseBody.output_text;
  return (responseBody.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || '')
    .join('\n')
    .trim();
}

function removeNullProperties(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}

function normalizeAdvisorCommands(parsed) {
  const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    commands: commands.map((command, index) => {
      const type = command.type;
      const base = {
        id: command.id || `ai_cmd_${index + 1}`,
        type,
        label: command.label || '',
        reason: command.reason || ''
      };
      if (type === 'update_task') {
        return {
          ...base,
          taskId: command.taskId,
          patch: removeNullProperties(command.patch)
        };
      }
      if (type === 'add_relation') {
        return {
          ...base,
          taskId: command.taskId,
          relatedTaskId: command.relatedTaskId,
          relationType: command.relationType
        };
      }
      if (type === 'create_task') {
        return {
          ...base,
          task: removeNullProperties(command.task)
        };
      }
      return base;
    })
  };
}

module.exports = {
  extractOpenAiResponseText,
  removeNullProperties,
  normalizeAdvisorCommands
};
