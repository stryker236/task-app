import { useState } from 'react';
import { applyAiCommands, getTaskAdvisorAdvice, requestTaskAdvisorCommands } from '../api';

export default function useAdvisorController({ allTasks, fetchDashboardData, filters, setError, setViewingTask }) {
  const [advisor, setAdvisor] = useState(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorRequest, setAdvisorRequest] = useState('');
  const [proposalBatch, setProposalBatch] = useState(null);
  const [proposalStatuses, setProposalStatuses] = useState({});
  const [applyingProposalId, setApplyingProposalId] = useState(null);
  const [applyingAllProposals, setApplyingAllProposals] = useState(false);

  async function refreshTaskAdvisorAdvice() {
    try {
      setAdvisorLoading(true);
      setAdvisor(await getTaskAdvisorAdvice(5));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAdvisorLoading(false);
    }
  }

  async function requestAdvisorActions(message) {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    try {
      setAdvisorLoading(true);
      const response = await requestTaskAdvisorCommands(trimmedMessage);
      setProposalBatch(response);
      setProposalStatuses({});
      setAdvisorRequest(trimmedMessage);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAdvisorLoading(false);
    }
  }

  async function applyAdvisorProposal(commandId) {
    const index = proposalBatch?.commands?.findIndex((command) => command.id === commandId) ?? -1;
    if (index < 0) return;

    const rawCommand = proposalBatch.rawCommands?.[index];
    if (!rawCommand) {
      setError('Não foi possível encontrar o comando original desta sugestão.');
      return;
    }

    try {
      setApplyingProposalId(commandId);
      await applyAiCommands([rawCommand]);
      setProposalStatuses((current) => ({ ...current, [commandId]: 'accepted' }));
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setApplyingProposalId(null);
    }
  }

  function ignoreAdvisorProposal(commandId) {
    setProposalStatuses((current) => ({ ...current, [commandId]: 'ignored' }));
  }

  async function applyAllAdvisorProposals() {
    const commands = proposalBatch?.commands || [];
    const rawCommands = proposalBatch?.rawCommands || [];
    const pending = commands
      .map((command, index) => ({ command, rawCommand: rawCommands[index] }))
      .filter(({ command, rawCommand }) => rawCommand && !proposalStatuses[command.id]);

    if (!pending.length) return;

    try {
      setApplyingAllProposals(true);
      await applyAiCommands(pending.map(({ rawCommand }) => rawCommand));
      setProposalStatuses((current) => ({
        ...current,
        ...Object.fromEntries(pending.map(({ command }) => [command.id, 'accepted']))
      }));
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setApplyingAllProposals(false);
    }
  }

  function ignoreAllAdvisorProposals() {
    const pending = (proposalBatch?.commands || []).filter((command) => !proposalStatuses[command.id]);
    if (!pending.length) return;
    setProposalStatuses((current) => ({
      ...current,
      ...Object.fromEntries(pending.map((command) => [command.id, 'ignored']))
    }));
  }

  function clearAdvisorProposals() {
    setProposalBatch(null);
    setProposalStatuses({});
  }

  function openAdvisorRecommendedTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId);
    if (task) setViewingTask(task);
  }

  return {
    advisor,
    advisorLoading,
    advisorRequest,
    proposalBatch,
    proposalStatuses,
    applyingProposalId,
    applyingAllProposals,
    setAdvisorRequest,
    refreshTaskAdvisorAdvice,
    requestAdvisorActions,
    applyAdvisorProposal,
    ignoreAdvisorProposal,
    applyAllAdvisorProposals,
    ignoreAllAdvisorProposals,
    clearAdvisorProposals,
    openAdvisorRecommendedTask
  };
}
