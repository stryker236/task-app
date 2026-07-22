import { useMemo, useState } from 'react';
import type { AiCommand, GoogleCalendar, Task } from '../../../../../shared/types';
import type { AdvisorFeedbackInput, AdvisorPreview } from '../api';
import {
  COMMAND_LABELS,
  affectedCardTitle,
  formatProposalDay,
  proposalDayKey,
  type ObjectRecord,
  type ProposalFeedbackStatuses,
  type ProposalStatuses
} from '../advisorProposalUtils';
import { AdvisorDebugSummary, AdvisorJsonReveal, EmptyAdvisorProposalReason, SchedulerDebugReveal } from './AdvisorProposalDebug';
import { AdvisorInteractionFeedback, AdvisorProposalFeedback } from './AdvisorProposalFeedback';
import { ProposalChanges } from './ProposalChanges';
import {
  AdvisorTagChoice,
  customizeTagCommand,
  isTagUpdateProposal,
  sameStringList,
  tagPatchFromCommand
} from './TagProposalControls';

export { AdvisorInteractionFeedback, AdvisorProposalFeedback } from './AdvisorProposalFeedback';
export { ProposalChanges } from './ProposalChanges';

export function AdvisorProposalBuffer({
  allTasks = [],
  googleCalendars = [],
  proposals,
  proposalStatuses,
  proposalFeedbackStatuses,
  interactionFeedbackSaved,
  action,
  applyingProposalId,
  applyingAllProposals,
  calendarWriteReady,
  onConnectGoogle,
  onApplyProposal,
  onApplyProposals,
  onIgnoreProposal,
  onApplyAllProposals,
  onIgnoreAllProposals,
  onClearProposals,
  onChangeProposalCalendar,
  onSaveProposalFeedback,
  onSaveInteractionFeedback,
  onOpenTask
}: {
  allTasks?: Task[];
  googleCalendars?: GoogleCalendar[];
  proposals: AdvisorPreview | null;
  proposalStatuses: ProposalStatuses;
  proposalFeedbackStatuses: ProposalFeedbackStatuses;
  interactionFeedbackSaved: boolean;
  action?: string;
  applyingProposalId: string | null;
  applyingAllProposals: boolean;
  calendarWriteReady: boolean;
  onConnectGoogle: () => void;
  onApplyProposal: (commandId: string, commandOverride?: AiCommand) => void;
  onApplyProposals: (commandIds: string[], commandOverrides?: Record<string, AiCommand>) => void;
  onIgnoreProposal: (commandId: string) => void;
  onApplyAllProposals: (commandOverrides?: Record<string, AiCommand>) => void;
  onIgnoreAllProposals: () => void;
  onClearProposals: () => void;
  onChangeProposalCalendar: (commandId: string, calendarId: string, calendarSummary: string) => void;
  onSaveProposalFeedback: (commandId: string, feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onSaveInteractionFeedback: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onOpenTask: (taskId: string) => void;
}) {
  const commands = proposals?.commands || [];
  if (!proposals) return null;
  const visibleCommands = commands.filter((command) => !proposalStatuses[command.id]);
  const pendingCount = visibleCommands.length;
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [tagSelections, setTagSelections] = useState<Record<string, string[]>>({});
  const rawCommandById = useMemo(() => {
    const map = new Map<string, AiCommand>();
    const rawCommands = proposals.rawCommands || [];
    commands.forEach((command, index) => {
      const rawCommand = rawCommands[index];
      if (rawCommand) map.set(command.id, rawCommand);
    });
    return map;
  }, [commands, proposals.rawCommands]);
  const visibleIds = useMemo(() => new Set(visibleCommands.map((command) => command.id)), [visibleCommands]);
  const selectedVisibleIds = selectedProposalIds.filter((id) => visibleIds.has(id));
  const selectedCount = selectedVisibleIds.length;
  const hasCalendarProposal = commands.some((command) => command.type === 'create_calendar_event');
  const calendarPermissionBlocked = hasCalendarProposal && !calendarWriteReady;
  const schedulerDebug = proposals.debug?.schedulerDebug;
  const calendarDayGroups = useMemo(() => {
    const groups = new Map<string, AdvisorPreview['commands']>();
    for (const command of visibleCommands) {
      if (command.type !== 'create_calendar_event') continue;
      const day = proposalDayKey(command);
      if (!day) continue;
      groups.set(day, [...(groups.get(day) || []), command]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [visibleCommands]);

  function toggleSelectedProposal(commandId: string) {
    setSelectedProposalIds((current) => current.includes(commandId) ? current.filter((id) => id !== commandId) : [...current, commandId]);
  }

  function setAllVisibleSelected(selected: boolean) {
    setSelectedProposalIds(selected ? visibleCommands.map((command) => command.id) : []);
  }

  function proposedTagsForCommand(commandId: string) {
    return tagPatchFromCommand(rawCommandById.get(commandId));
  }

  function selectedTagsForCommand(commandId: string) {
    return tagSelections[commandId] || proposedTagsForCommand(commandId);
  }

  function applicableCommandIds(commandIds: string[]) {
    return commandIds.filter((commandId) => {
      const rawCommand = rawCommandById.get(commandId);
      const proposal = commands.find((command) => command.id === commandId);
      if (!proposal || !isTagUpdateProposal(proposal, rawCommand)) return true;
      return selectedTagsForCommand(commandId).length > 0;
    });
  }

  function updateTagSelection(commandId: string, tags: string[]) {
    const proposedTags = proposedTagsForCommand(commandId);
    setTagSelections((current) => {
      const next = { ...current };
      if (sameStringList(tags, proposedTags)) {
        delete next[commandId];
      } else {
        next[commandId] = tags;
      }
      return next;
    });
  }

  function buildCommandOverrides(commandIds: string[]) {
    const overrides: Record<string, AiCommand> = {};
    for (const commandId of commandIds) {
      const rawCommand = rawCommandById.get(commandId);
      const proposedTags = proposedTagsForCommand(commandId);
      if (!rawCommand || !proposedTags.length) continue;
      const selectedTags = selectedTagsForCommand(commandId);
      if (!selectedTags.length) continue;
      if (!sameStringList(selectedTags, proposedTags)) {
        overrides[commandId] = customizeTagCommand(rawCommand, selectedTags);
      }
    }
    return overrides;
  }

  function applySelectedProposals() {
    const applicableIds = applicableCommandIds(selectedVisibleIds);
    onApplyProposals(applicableIds, buildCommandOverrides(applicableIds));
    setSelectedProposalIds([]);
  }

  function applyDayProposals(commandIds: string[]) {
    const applicableIds = applicableCommandIds(commandIds);
    onApplyProposals(applicableIds, buildCommandOverrides(applicableIds));
    setSelectedProposalIds((current) => current.filter((id) => !commandIds.includes(id)));
  }

  function applyAllVisibleProposals() {
    const commandIds = applicableCommandIds(visibleCommands.map((command) => command.id));
    onApplyProposals(commandIds, buildCommandOverrides(commandIds));
  }

  function applyOneProposal(commandId: string) {
    const overrides = buildCommandOverrides([commandId]);
    onApplyProposal(commandId, overrides[commandId]);
  }

  return (
    <section className="advisor-buffer" aria-label="Propostas do assistente">
      <header>
        <div>
          <h3>Propostas para validar</h3>
        </div>
        <div className="advisor-buffer-actions">
          <button type="button" className="button primary small" onClick={applyAllVisibleProposals} disabled={!pendingCount || applyingAllProposals || calendarPermissionBlocked}>
            {applyingAllProposals ? 'A aplicar...' : `Aceitar todos${pendingCount ? ` (${pendingCount})` : ''}`}
          </button>
          <button type="button" className="button secondary small" onClick={applySelectedProposals} disabled={!selectedCount || applyingAllProposals || calendarPermissionBlocked}>
            {`Aceitar selecionados${selectedCount ? ` (${selectedCount})` : ''}`}
          </button>
          <button type="button" className="button secondary small" onClick={onIgnoreAllProposals} disabled={!pendingCount || applyingAllProposals}>
            Ignorar todos
          </button>
          <button type="button" className="button secondary small" onClick={onClearProposals}>
            Limpar buffer
          </button>
        </div>
      </header>

      {calendarDayGroups.length > 0 && (
        <div className="advisor-day-commit-bar">
          <span>Commit por dia</span>
          {calendarDayGroups.map(([day, dayCommands]) => (
            <button
              type="button"
              className="button ghost small"
              key={day}
              onClick={() => applyDayProposals(dayCommands.map((command) => command.id))}
              disabled={applyingAllProposals || calendarPermissionBlocked}
            >
              {formatProposalDay(day)} ({dayCommands.length})
            </button>
          ))}
        </div>
      )}

      {calendarPermissionBlocked && (
        <div className="advisor-permission-warning">
          <span>O Google precisa de permissao de escrita no calendario antes de criar eventos.</span>
          <button type="button" className="button secondary small" onClick={onConnectGoogle}>
            Reconectar Google
          </button>
        </div>
      )}

      <SchedulerDebugReveal debug={schedulerDebug} />

      <AdvisorJsonReveal proposals={proposals} />

      <AdvisorDebugSummary proposals={proposals} />

      <AdvisorInteractionFeedback saved={interactionFeedbackSaved} action={action} onSave={onSaveInteractionFeedback} />

      {visibleCommands.length ? (
        <>
          <div className="advisor-selection-bar">
            <label>
              <input
                type="checkbox"
                checked={pendingCount > 0 && selectedCount === pendingCount}
                onChange={(event) => setAllVisibleSelected(event.target.checked)}
              />
              Selecionar visiveis
            </label>
            <span>{selectedCount} selecionadas</span>
          </div>
          <div className="advisor-proposal-list">
          {visibleCommands.map((proposal) => {
            const needsCalendarPermission = proposal.type === 'create_calendar_event' && !calendarWriteReady;
            const disabled = applyingProposalId === proposal.id || applyingAllProposals || needsCalendarPermission;
            const affectedTitle = affectedCardTitle(proposal);
            const calendarEvent = (proposal.changes as ObjectRecord | undefined)?.calendarEvent as ObjectRecord | undefined;
            const proposalCalendarId = String(calendarEvent?.calendarId || '');
            const rawCommand = rawCommandById.get(proposal.id);
            const proposedTags = proposedTagsForCommand(proposal.id);
            const selectedTags = selectedTagsForCommand(proposal.id);
            const isTagProposal = isTagUpdateProposal(proposal, rawCommand);
            const noTagsSelected = isTagProposal && selectedTags.length === 0;

            return (
              <article className={`advisor-proposal ${selectedVisibleIds.includes(proposal.id) ? 'is-selected' : ''}`} key={proposal.id}>
                <div className="advisor-proposal-main">
                  <label className="advisor-proposal-select">
                    <input type="checkbox" checked={selectedVisibleIds.includes(proposal.id)} onChange={() => toggleSelectedProposal(proposal.id)} />
                    <span>Selecionar</span>
                  </label>
                  <span className="advisor-command-type">{COMMAND_LABELS[proposal.type] || proposal.type}</span>
                  <div className="advisor-affected-card">
                    <span>{proposal.type === 'create_task' || proposal.type === 'create_calendar_event' ? 'Vai criar' : 'Afeta'}</span>
                    <strong>{affectedTitle}</strong>
                  </div>
                  <h4>{proposal.summary}</h4>
                  <p>{proposal.reason}</p>
                  {proposal.alreadyExists && <small>Esta proposta ja existe ou esta duplicada.</small>}
                  <ProposalChanges proposal={proposal} allTasks={allTasks} />
                  {isTagProposal && (
                    <AdvisorTagChoice
                      tags={proposedTags}
                      selectedTags={selectedTags}
                      disabled={disabled}
                      onChange={(tags) => updateTagSelection(proposal.id, tags)}
                    />
                  )}
                  {proposal.type === 'create_calendar_event' && googleCalendars.length > 0 && (
                    <label className="advisor-calendar-select">
                      <span>Calendario destino</span>
                      <select
                        value={proposalCalendarId}
                        onChange={(event) => {
                          const calendar = googleCalendars.find((item) => item.id === event.target.value);
                          onChangeProposalCalendar(proposal.id, event.target.value, calendar?.summary || event.target.value);
                        }}
                      >
                        {googleCalendars.map((calendar) => (
                          <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <AdvisorProposalFeedback
                    proposal={proposal}
                    saved={proposalFeedbackStatuses[proposal.id] === 'saved'}
                    googleCalendars={googleCalendars}
                    onSave={(feedback) => onSaveProposalFeedback(proposal.id, feedback)}
                  />
                </div>

                <div className="advisor-proposal-actions">
                  {proposal.taskId && (
                    <button type="button" className="button ghost small" onClick={() => onOpenTask(proposal.taskId as string)}>
                      Abrir task
                    </button>
                  )}
                  <button type="button" className="button primary small" onClick={() => applyOneProposal(proposal.id)} disabled={disabled || noTagsSelected}>
                    {needsCalendarPermission ? 'Requer Google' : applyingProposalId === proposal.id ? 'A aplicar...' : 'Aceitar'}
                  </button>
                  <button type="button" className="button secondary small" onClick={() => onIgnoreProposal(proposal.id)} disabled={disabled}>
                    Ignorar
                  </button>
                </div>
              </article>
            );
          })}
          </div>
        </>
      ) : (
        <EmptyAdvisorProposalReason proposals={proposals} action={action} />
      )}
    </section>
  );
}
