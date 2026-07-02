const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const AI_COMMAND_TYPES = ['update_task', 'add_relation', 'create_task', 'create_calendar_event'] as const;
const ADVISOR_ACTIONS = {
  improve_tasks: {
    label: 'Improve tasks',
    instruction: 'Improve active cards without changing titles, notes, history, status, favorite, or estimates unless truly necessary. Focus on tags, due dates, checklist, dependencies, related cards, and priority.'
  },
  suggest_tags: {
    label: 'Suggest tags',
    instruction: 'Suggest tag improvements for active cards. Reuse existing tags when possible, fix inconsistent tags, and propose new tags only when clearly useful. Do not change title, notes, status, history, or estimates. If you dont propose a change dont even return the task in the output. Feel free to propose multiple tags for a single task if they are all useful and relevant. Feel free to propose a creation of a tag if make sense'
  },
  priority_management: {
    label: 'Priority management',
    instruction: 'Review active cards and propose priority changes only. Consider how long each task has existed, whether it is overdue, and how long it has been overdue. Older active tasks and tasks with longer overdue duration deserve more attention, but do not make everything urgent. Do not change title, notes, tags, due dates, checklist, relations, history, status, favorite, or estimates.'
  },
  suggest_due_dates: {
    label: 'Suggest due dates',
    instruction: 'Review active cards and propose dueDateTime changes only. Suggest a due date when the task has no due date, is clearly overdue and should be replanned, or has a due date that is inconsistent with priority, blockers, waiting status, or task age. Avoid unrealistic clustering. Do not change title, notes, tags, priority, checklist, relations, history, status, favorite, or estimates.'
  },
  create_followups: {
    label: 'Create follow-ups',
    instruction: 'Analyze active tasks and propose follow-up tasks only when missing work is clearly separate and useful. Avoid duplicate tasks.'
  },
  organize_blockers: {
    label: 'Organize blockers',
    instruction: 'Analyze blockers, dependencies, and related cards. Propose add_relation, blockedByTaskIds, or checklist improvements when they make the work clearer. If the relation already do not propose it again. Avoid duplicate relations.'
  },
  schedule_calendar_events: {
    label: 'Schedule calendar events',
    instruction: 'Review active cards and propose Google Calendar events for tasks that have enough timing context to be scheduled. Prefer tasks with due dates, today/overdue urgency, or clear estimated duration. Create calendar events only; do not update tasks or create tasks for this action.'
  }
} as const;

type AiCommandType = (typeof AI_COMMAND_TYPES)[number];
type AdvisorAction = keyof typeof ADVISOR_ACTIONS;

module.exports = {
  OPENAI_RESPONSES_URL,
  DEFAULT_MODEL,
  AI_COMMAND_TYPES,
  ADVISOR_ACTIONS
};

export type { AiCommandType, AdvisorAction };
