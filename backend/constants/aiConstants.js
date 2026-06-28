const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const AI_COMMAND_TYPES = ['update_task', 'add_relation', 'create_task'];
const ADVISOR_ACTIONS = {
  improve_tasks: {
    label: 'Improve tasks',
    instruction: 'Improve active cards without changing titles, notes, history, status, favorite, or estimates unless truly necessary. Focus on tags, due dates, checklist, dependencies, related cards, and priority.'
  },
  suggest_tags: {
    label: 'Suggest tags',
    instruction: 'Suggest tag improvements for active cards. Reuse existing tags when possible, fix inconsistent tags, and propose new tags only when clearly useful. Do not change title, notes, status, history, or estimates. If you dont propose a change dont even return the task in the output. Feel free to propose multiple tags for a single task if they are all useful and relevant. Feel free to propose a creation of a tag if make sense'
  },
  create_followups: {
    label: 'Create follow-ups',
    instruction: 'Analyze active tasks and propose follow-up tasks only when missing work is clearly separate and useful. Avoid duplicate tasks.'
  },
  organize_blockers: {
    label: 'Organize blockers',
    instruction: 'Analyze blockers, dependencies, and related cards. Propose add_relation, blockedByTaskIds, or checklist improvements when they make the work clearer. If the relation already do not propose it again. Avoid duplicate relations.'
  }
};

module.exports = {
  OPENAI_RESPONSES_URL,
  DEFAULT_MODEL,
  AI_COMMAND_TYPES,
  ADVISOR_ACTIONS
};
