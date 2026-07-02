import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AiCommand, AiCommandPreview, Task } from '../../../shared/types';
import {
  applyAiCommands,
  deleteAdvisorMemoryRule,
  getAdvisorMemoryRules,
  getTaskAdvisorAdvice,
  requestTaskAdvisorCommands,
  submitAdvisorFeedback,
  submitAdvisorInteractionFeedback,
  type AdvisorFeedbackInput,
  type AdvisorMemoryRule,
  type TaskFilters
} from '../api';

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

  async function requestAdvisorActions(action: string) {
    if (!action) return;

    try {
      setAdvisorLoading(true);
      const response = await requestTaskAdvisorCommands(action);
      setLastAdvisorAction(action);
      setProposalBatch(response);
      setProposalStatuses({});
      setProposalFeedbackStatuses({});
      setInteractionFeedbackSaved(false);
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
    refreshAdvisorMemoryRules,
    forgetAdvisorMemoryRule,
    applyAdvisorProposal,
    ignoreAdvisorProposal,
    applyAllAdvisorProposals,
    ignoreAllAdvisorProposals,
    clearAdvisorProposals,
    saveAdvisorProposalFeedback,
    saveAdvisorInteractionFeedback,
    openAdvisorRecommendedTask
  };
}
