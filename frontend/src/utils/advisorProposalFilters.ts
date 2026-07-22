import type { AdvisorPreview } from '../features/advisor/api';

type ProposalCommand = AdvisorPreview['commands'][number];

export type AdvisorProposalSurface = 'task-planning' | 'calendar-events';

function fieldValue(source: unknown, field: string) {
  return source && typeof source === 'object' && !Array.isArray(source)
    ? (source as Record<string, unknown>)[field]
    : undefined;
}

function changedFieldNames(command: ProposalCommand) {
  const changes = command.changes && typeof command.changes === 'object'
    ? command.changes as Record<string, unknown>
    : {};
  const before = fieldValue(changes.before, 'id') != null || typeof changes.before === 'object'
    ? changes.before
    : {};
  const after = fieldValue(changes.after, 'id') != null || typeof changes.after === 'object'
    ? changes.after
    : {};

  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [];
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...fields].filter((field) => JSON.stringify(fieldValue(before, field) ?? null) !== JSON.stringify(fieldValue(after, field) ?? null));
}

function isTaskPlanningProposal(command: ProposalCommand, action: string) {
  if (command.type === 'create_calendar_event') return false;
  if (action === 'suggest_tags' || action === 'suggest_due_dates') return true;
  const changedFields = changedFieldNames(command);
  return changedFields.some((field) => field === 'tags' || field === 'dueDateTime');
}

function isCalendarProposal(command: ProposalCommand) {
  return command.type === 'create_calendar_event';
}

export function filterAdvisorProposalBatch(
  proposals: AdvisorPreview | null,
  surface: AdvisorProposalSurface,
  action = ''
): AdvisorPreview | null {
  if (!proposals) return null;

  const indexedCommands = proposals.commands.map((command, index) => ({
    command,
    rawCommand: proposals.rawCommands?.[index]
  }));
  const filteredCommands = indexedCommands.filter(({ command }) => (
    surface === 'calendar-events'
      ? isCalendarProposal(command)
      : isTaskPlanningProposal(command, action)
  ));

  if (!filteredCommands.length) return null;

  return {
    ...proposals,
    commandCount: filteredCommands.length,
    commands: filteredCommands.map(({ command }) => command),
    rawCommands: proposals.rawCommands ? filteredCommands.map(({ rawCommand }) => rawCommand).filter((command) => Boolean(command)) as AdvisorPreview['rawCommands'] : undefined,
    reservedBlocks: surface === 'calendar-events' ? proposals.reservedBlocks : []
  };
}
