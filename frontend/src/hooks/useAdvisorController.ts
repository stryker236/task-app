import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AiCommand, AiCommandPreview, Task } from '../../../shared/types';
import {
  applyAiCommands,
  deleteAdvisorMemoryRule,
  getAdvisorMemoryRules,
  getTaskAdvisorAdvice,
  requestTaskAdvisorCommands,
  requestScheduleExplanation,
  submitAdvisorFeedback,
  submitAdvisorInteractionFeedback,
  updateAdvisorMemoryRule,
  type AdvisorFeedbackInput,
  type AdvisorMemoryRule,
  type AdvisorMemoryRuleUpdate,
  type SchedulerConstraintInput,
  type TaskFilters
} from '../api';
import { clientLog } from '../logger';

type AdvisorAdvice = Awaited<ReturnType<typeof getTaskAdvisorAdvice>>;
type AdvisorBatch = {
  mode: string;
  generatedAt?: string;
  source?: string;
  model?: string | null;
  summary?: string;
  commandCount: number;
  commands: AiCommandPreview[];
  rawCommands?: AiCommand[];
  reservedBlocks?: import('../api').AdvisorReservedBlock[];
  debug?: import('../api').AdvisorPreviewDebug;
};
type ProposalStatus = 'accepted' | 'ignored';

type UseAdvisorControllerOptions = {
  allTasks: Task[];
  fetchDashboardData: (filters?: TaskFilters) => Promise<void>;
  filters: TaskFilters;
  setError: (message: string) => void;
  setViewingTask: Dispatch<SetStateAction<Task | null>>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function useAdvisorController({
  allTasks,
  fetchDashboardData,
  filters,
  setError,
  setViewingTask
}: UseAdvisorControllerOptions) {
  const [advisor, setAdvisor] = useState<AdvisorAdvice | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [proposalBatch, setProposalBatch] = useState<AdvisorBatch | null>(null);
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, ProposalStatus>>({});
  const [proposalFeedbackStatuses, setProposalFeedbackStatuses] = useState<Record<string, 'saved'>>({});
  const [interactionFeedbackSaved, setInteractionFeedbackSaved] = useState(false);
  const [advisorMemoryRules, setAdvisorMemoryRules] = useState<AdvisorMemoryRule[]>([]);
  const [advisorMemoryLoading, setAdvisorMemoryLoading] = useState(false);
  const [applyingProposalId, setApplyingProposalId] = useState<string | null>(null);
  const [applyingAllProposals, setApplyingAllProposals] = useState(false);
  const [lastAdvisorAction, setLastAdvisorAction] = useState('');

  async function refreshTaskAdvisorAdvice() {
    try {
      setAdvisorLoading(true);
      setAdvisor(await getTaskAdvisorAdvice(5));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setAdvisorLoading(false);
    }
  }

  async function requestAdvisorActions(action: string, options: { defaultCalendarId?: string; schedulerConstraints?: SchedulerConstraintInput[]; scheduleStartFrom?: string } = {}) {
    if (!action) return;

    try {
      setAdvisorLoading(true);
      clientLog('info', 'advisor.request.sent', '', { action, defaultCalendarId: options.defaultCalendarId || '' });
      const response = await requestTaskAdvisorCommands(action, options);
      clientLog('info', 'advisor.proposals.received', '', {
        action,
        commandCount: response.commandCount,
        generatedCount: response.debug?.generatedCount,
        rejectionReasons: response.debug?.rejectionReasons
      });
      setLastAdvisorAction(action);
      setProposalBatch(response);
      setProposalStatuses({});
      setProposalFeedbackStatuses({});
      setInteractionFeedbackSaved(false);
      if (action === 'schedule_calendar_events' && response.rawCommands?.length && response.debug?.schedulerDebug) {
        void requestScheduleExplanation(response.rawCommands, response.debug.schedulerDebug as Record<string, unknown>)
          .then((explanation) => {
            setProposalBatch((current) => {
              if (!current || current.generatedAt !== response.generatedAt) return current;
              const reasonsById = new Map(explanation.commands.map((command) => [command.id, command.reason]));
              return {
                ...current,
                model: explanation.model ? [current.model || 'python-scheduler', explanation.model].join(' + ') : current.model,
                summary: explanation.summary || current.summary,
                commands: current.commands.map((command) => ({
                  ...command,
                  reason: reasonsById.get(command.id) || command.reason
                }))
              };
            });
          })
          .catch((explanationError) => {
            clientLog('warn', 'advisor.schedule_explanation.failed', errorMessage(explanationError), { action });
          });
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setAdvisorLoading(false);
    }
  }

  async function refreshAdvisorMemoryRules() {
    try {
      setAdvisorMemoryLoading(true);
      setAdvisorMemoryRules(await getAdvisorMemoryRules());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setAdvisorMemoryLoading(false);
    }
  }


  async function saveAdvisorMemoryRule(id: string, patch: AdvisorMemoryRuleUpdate) {
    try {
      const updated = await updateAdvisorMemoryRule(id, patch);
      setAdvisorMemoryRules((current) => current.map((rule) => rule.id === updated.id ? updated : rule));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }
  async function forgetAdvisorMemoryRule(id: string) {
    try {
      await deleteAdvisorMemoryRule(id);
      setAdvisorMemoryRules((current) => current.filter((rule) => rule.id !== id));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function applyAdvisorProposal(commandId: string) {
    const index = proposalBatch?.commands?.findIndex((command) => command.id === commandId) ?? -1;
    if (index < 0) return;

    const rawCommand = proposalBatch?.rawCommands?.[index];
    if (!rawCommand) {
      setError('Nao foi possivel encontrar o comando original desta sugestao.');
      return;
    }

    try {
      setApplyingProposalId(commandId);
      clientLog('info', 'advisor.proposal.accepted', '', { commandId });
      await applyAiCommands([rawCommand]);
      setProposalStatuses((current) => ({ ...current, [commandId]: 'accepted' }));
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setApplyingProposalId(null);
    }
  }

  function ignoreAdvisorProposal(commandId: string) {
    setProposalStatuses((current) => ({ ...current, [commandId]: 'ignored' }));
    clientLog('info', 'advisor.proposal.ignored', '', { commandId });
  }

  
  async function applyAdvisorProposals(commandIds: string[]) {
    const wanted = new Set(commandIds);
    const commands = proposalBatch?.commands || [];
    const rawCommands = proposalBatch?.rawCommands || [];
    const pending = commands
      .map((command, index) => ({ command, rawCommand: rawCommands[index] }))
      .filter((item): item is { command: AiCommandPreview; rawCommand: AiCommand } => Boolean(item.rawCommand) && wanted.has(item.command.id) && !proposalStatuses[item.command.id]);

    if (!pending.length) return;

    try {
      setApplyingAllProposals(true);
      clientLog('info', 'advisor.proposals.accepted_selection', '', { count: pending.length, commandIds: pending.map(({ command }) => command.id) });
      await applyAiCommands(pending.map(({ rawCommand }) => rawCommand));
      setProposalStatuses((current) => ({
        ...current,
        ...Object.fromEntries(pending.map(({ command }) => [command.id, 'accepted' as const]))
      }));
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setApplyingAllProposals(false);
    }
  }

  async function applyAllAdvisorProposals() {
    const commands = proposalBatch?.commands || [];
    const rawCommands = proposalBatch?.rawCommands || [];
    const pending = commands
      .map((command, index) => ({ command, rawCommand: rawCommands[index] }))
      .filter((item): item is { command: AiCommandPreview; rawCommand: AiCommand } => Boolean(item.rawCommand) && !proposalStatuses[item.command.id]);

    if (!pending.length) return;

    try {
      setApplyingAllProposals(true);
      clientLog('info', 'advisor.proposals.accepted_all', '', { count: pending.length });
      await applyAiCommands(pending.map(({ rawCommand }) => rawCommand));
      setProposalStatuses((current) => ({
        ...current,
        ...Object.fromEntries(pending.map(({ command }) => [command.id, 'accepted' as const]))
      }));
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setApplyingAllProposals(false);
    }
  }

  function ignoreAllAdvisorProposals() {
    const pending = (proposalBatch?.commands || []).filter((command) => !proposalStatuses[command.id]);
    if (!pending.length) return;
    setProposalStatuses((current) => ({
      ...current,
      ...Object.fromEntries(pending.map((command) => [command.id, 'ignored' as const]))
    }));
  }

  function clearAdvisorProposals() {
    setProposalBatch(null);
    setProposalStatuses({});
    setProposalFeedbackStatuses({});
    setInteractionFeedbackSaved(false);
  }

  function updateAdvisorProposalCalendar(commandId: string, calendarId: string, calendarSummary = '') {
    setProposalBatch((current) => {
      if (!current) return current;
      const commandIndex = current.commands.findIndex((command) => command.id === commandId);
      if (commandIndex < 0) return current;

      return {
        ...current,
        commands: current.commands.map((command, index) => {
          if (index !== commandIndex || command.type !== 'create_calendar_event') return command;
          const changes = command.changes && typeof command.changes === 'object' ? command.changes as Record<string, unknown> : {};
          const calendarEvent = changes.calendarEvent && typeof changes.calendarEvent === 'object'
            ? changes.calendarEvent as Record<string, unknown>
            : {};
          return {
            ...command,
            changes: {
              ...changes,
              calendarEvent: {
                ...calendarEvent,
                calendarId,
                calendarSummary,
                calendarSelectionReason: 'user selected calendar'
              }
            }
          };
        }),
        rawCommands: current.rawCommands?.map((command, index) => {
          if (index !== commandIndex || command.type !== 'create_calendar_event') return command;
          return {
            ...command,
            event: command.event
              ? {
                ...command.event,
                calendarId,
                calendarSelectionReason: 'user selected calendar'
              }
              : command.event
          };
        })
      };
    });
  }

  async function rescheduleAdvisorCalendarEvents(defaultCalendarId: string, schedulerConstraints: SchedulerConstraintInput[], scheduleStartFrom = '') {
    await requestAdvisorActions('schedule_calendar_events', { defaultCalendarId, schedulerConstraints, scheduleStartFrom });
  }

  async function saveAdvisorInteractionFeedback(feedback: AdvisorFeedbackInput['feedback']) {
    if (!proposalBatch || !lastAdvisorAction) return;
    try {
      await submitAdvisorInteractionFeedback({
        action: lastAdvisorAction,
        interaction: {
          generatedAt: proposalBatch.generatedAt,
          summary: proposalBatch.summary,
          commandCount: proposalBatch.commandCount
        },
        feedback
      });
      setInteractionFeedbackSaved(true);
      await refreshAdvisorMemoryRules();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function saveAdvisorProposalFeedback(commandId: string, feedback: AdvisorFeedbackInput['feedback']) {
    const index = proposalBatch?.commands?.findIndex((command) => command.id === commandId) ?? -1;
    const commandPreview = proposalBatch?.commands?.[index];
    if (index < 0 || !commandPreview) return;
    try {
      await submitAdvisorFeedback({
        action: lastAdvisorAction,
        commandPreview,
        rawCommand: proposalBatch?.rawCommands?.[index],
        feedback
      });
      setProposalFeedbackStatuses((current) => ({ ...current, [commandId]: 'saved' }));
      await refreshAdvisorMemoryRules();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  function openAdvisorRecommendedTask(taskId: string) {
    const task = allTasks.find((item) => item.id === taskId);
    if (task) setViewingTask(task);
  }

  return {
    advisor,
    advisorLoading,
    proposalBatch,
    lastAdvisorAction,
    proposalStatuses,
    proposalFeedbackStatuses,
    interactionFeedbackSaved,
    advisorMemoryRules,
    advisorMemoryLoading,
    applyingProposalId,
    applyingAllProposals,
    refreshTaskAdvisorAdvice,
    requestAdvisorActions,
    rescheduleAdvisorCalendarEvents,
    refreshAdvisorMemoryRules,
    forgetAdvisorMemoryRule,
    saveAdvisorMemoryRule,
    applyAdvisorProposal,
    applyAdvisorProposals,
    ignoreAdvisorProposal,
    applyAllAdvisorProposals,
    ignoreAllAdvisorProposals,
    clearAdvisorProposals,
    updateAdvisorProposalCalendar,
    saveAdvisorProposalFeedback,
    saveAdvisorInteractionFeedback,
    openAdvisorRecommendedTask
  };
}

