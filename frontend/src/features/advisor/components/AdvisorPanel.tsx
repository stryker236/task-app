import type { AiCommand, GoogleCalendar, GoogleStatus, Task } from '../../../../../shared/types';
import type { AdvisorAdvice, AdvisorFeedbackInput, AdvisorMemoryRule, AdvisorPreview } from '../api';
import AdvisorAdviceGrid, { type AdvisorActionItem } from './AdvisorAdviceGrid';
import AdvisorPanelHeader, { advisorCalendarWriteReady } from './AdvisorPanelHeader';
import { AdvisorProposalBuffer } from './AdvisorProposalComponents';

type ProposalStatus = 'accepted' | 'ignored';
type ProposalStatuses = Record<string, ProposalStatus>;
type ProposalFeedbackStatuses = Record<string, 'saved'>;

type AdvisorPanelProps = {
  allTasks?: Task[];
  advice: AdvisorAdvice | null;
  loading: boolean;
  proposals: AdvisorPreview | null;
  currentAction: string;
  proposalStatuses: ProposalStatuses;
  proposalFeedbackStatuses: ProposalFeedbackStatuses;
  interactionFeedbackSaved: boolean;
  memoryRules: AdvisorMemoryRule[];
  memoryLoading: boolean;
  applyingProposalId: string | null;
  applyingAllProposals: boolean;
  googleStatus: GoogleStatus;
  googleCalendars: GoogleCalendar[];
  advisorDefaultCalendarId: string;
  onRefresh: () => void;
  onRequestActions: (action: string) => void;
  onConnectGoogle: () => void;
  onApplyProposal: (commandId: string, commandOverride?: AiCommand) => void;
  onApplyProposals: (commandIds: string[], commandOverrides?: Record<string, AiCommand>) => void;
  onIgnoreProposal: (commandId: string) => void;
  onApplyAllProposals: (commandOverrides?: Record<string, AiCommand>) => void;
  onIgnoreAllProposals: () => void;
  onClearProposals: () => void;
  onAdvisorDefaultCalendarChange: (calendarId: string) => void;
  onChangeProposalCalendar: (commandId: string, calendarId: string, calendarSummary: string) => void;
  onSaveProposalFeedback: (commandId: string, feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onSaveInteractionFeedback: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onRefreshMemory: () => void;
  onForgetMemory: (id: string) => void;
  onOpenTask: (taskId: string) => void;
};

function formatMemoryRule(rule: AdvisorMemoryRule) {
  const parts = [];
  if (rule.rule.avoidTags?.length) parts.push(`evitar: ${rule.rule.avoidTags.map((tag) => `#${tag}`).join(', ')}`);
  if (rule.rule.preferTags?.length) parts.push(`preferir: ${rule.rule.preferTags.map((tag) => `#${tag}`).join(', ')}`);
  if (rule.rule.tagVolume && rule.rule.tagVolume !== 'ok') parts.push(rule.rule.tagVolume === 'less' ? 'menos tags' : 'mais tags');
  if (rule.rule.avoidSimilarSuggestions) parts.push('evitar sugestoes parecidas');
  if (rule.rule.priorityDirection === 'too_high') parts.push('prioridade alta demais');
  if (rule.rule.priorityDirection === 'too_low') parts.push('prioridade baixa demais');
  if (rule.rule.taskAgeImportance === 'too_much') parts.push('menos peso na antiguidade');
  if (rule.rule.taskAgeImportance === 'too_little') parts.push('mais peso na antiguidade');
  if (rule.rule.overdueImportance === 'too_much') parts.push('menos peso no atraso');
  if (rule.rule.overdueImportance === 'too_little') parts.push('mais peso no atraso');
  if (rule.rule.dueDateDirection === 'too_early') parts.push('prazos cedo demais');
  if (rule.rule.dueDateDirection === 'too_late') parts.push('prazos tarde demais');
  if (rule.rule.calendarDurationDirection === 'too_short') parts.push('eventos curtos demais');
  if (rule.rule.calendarDurationDirection === 'too_long') parts.push('eventos longos demais');
  if (rule.rule.unnecessaryEvent) parts.push('evitar eventos desnecessarios');
  if (rule.rule.wrongCalendar) parts.push('rever calendario');
  if (rule.rule.preferredCalendarSummary) parts.push(`preferir calendario: ${rule.rule.preferredCalendarSummary}`);
  if (!rule.rule.preferredCalendarSummary && rule.rule.preferredCalendarId) parts.push(`preferir calendario: ${rule.rule.preferredCalendarId}`);
  if (rule.rule.shouldBeUrgent) parts.push('devia ser urgente');
  if (rule.rule.shouldBeLowerPriority) parts.push('devia baixar prioridade');
  if (rule.rule.askForMoreContext) parts.push('pedir mais contexto');
  return parts.length ? parts.join(' · ') : 'Regra geral de sugestao';
}

function AdvisorMemoryPanel({
  rules,
  loading,
  onRefresh,
  onForget
}: {
  rules: AdvisorMemoryRule[];
  loading: boolean;
  onRefresh: () => void;
  onForget: (id: string) => void;
}) {
  return (
    <details className="advisor-memory">
      <summary>Memoria aprendida</summary>
      <div className="advisor-memory-actions">
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>
          {loading ? 'A carregar...' : 'Atualizar memoria'}
        </button>
      </div>
      {rules.length ? (
        <div className="advisor-memory-list">
          {rules.map((rule) => (
            <article key={rule.id}>
              <div>
                <strong>{rule.titleFingerprint || 'Regra global'}</strong>
                <p>{formatMemoryRule(rule)}</p>
                <small>{rule.action || 'todas'} · {rule.ruleType} · {rule.supportCount} feedback</small>
              </div>
              <button type="button" className="button ghost small" onClick={() => onForget(rule.id)}>
                Esquecer
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="advisor-empty">Sem regras de memoria carregadas.</p>
      )}
    </details>
  );
}

export default function AdvisorPanel({
  allTasks = [],
  advice,
  loading,
  proposals,
  currentAction,
  proposalStatuses,
  proposalFeedbackStatuses,
  interactionFeedbackSaved,
  memoryRules,
  memoryLoading,
  applyingProposalId,
  applyingAllProposals,
  googleStatus,
  googleCalendars,
  advisorDefaultCalendarId,
  onRefresh,
  onRequestActions,
  onConnectGoogle,
  onApplyProposal,
  onApplyProposals,
  onIgnoreProposal,
  onApplyAllProposals,
  onIgnoreAllProposals,
  onClearProposals,
  onAdvisorDefaultCalendarChange,
  onChangeProposalCalendar,
  onSaveProposalFeedback,
  onSaveInteractionFeedback,
  onRefreshMemory,
  onForgetMemory,
  onOpenTask
}: AdvisorPanelProps) {
  const actions = (advice?.actions || []) as AdvisorActionItem[];
  const blockers = (advice?.blockers || []) as AdvisorActionItem[];
  const calendarWriteReady = advisorCalendarWriteReady(googleStatus);

  return (
    <section className="advisor-panel" aria-label="Assistente de trabalho">
      <AdvisorPanelHeader
        loading={loading}
        googleStatus={googleStatus}
        googleCalendars={googleCalendars}
        advisorDefaultCalendarId={advisorDefaultCalendarId}
        onRefresh={onRefresh}
        onRequestActions={onRequestActions}
        onConnectGoogle={onConnectGoogle}
        onAdvisorDefaultCalendarChange={onAdvisorDefaultCalendarChange}
      />

      {/* <AdvisorMemoryPanel
        rules={memoryRules}
        loading={memoryLoading}
        onRefresh={onRefreshMemory}
        onForget={onForgetMemory}
      /> */}

      <AdvisorProposalBuffer
        allTasks={allTasks}
        googleCalendars={googleCalendars}
        proposals={proposals}
        action={currentAction}
        proposalStatuses={proposalStatuses}
        proposalFeedbackStatuses={proposalFeedbackStatuses}
        interactionFeedbackSaved={interactionFeedbackSaved}
        applyingProposalId={applyingProposalId}
        applyingAllProposals={applyingAllProposals}
        calendarWriteReady={calendarWriteReady}
        onConnectGoogle={onConnectGoogle}
        onApplyProposal={onApplyProposal}
        onApplyProposals={onApplyProposals}
        onIgnoreProposal={onIgnoreProposal}
        onApplyAllProposals={onApplyAllProposals}
        onIgnoreAllProposals={onIgnoreAllProposals}
        onClearProposals={onClearProposals}
        onChangeProposalCalendar={onChangeProposalCalendar}
        onSaveProposalFeedback={onSaveProposalFeedback}
        onSaveInteractionFeedback={onSaveInteractionFeedback}
        onOpenTask={onOpenTask}
      />

      {advice?.summary ? (
        <p className="advisor-summary">{advice.summary}</p>
      ) : (
        <p className="advisor-summary">Clica em "Gerar conselho" para uma analise sem aplicar alteracoes.</p>
      )}
      {advice?.note && <p className="advisor-note">{advice.note}</p>}

      <AdvisorAdviceGrid actions={actions} blockers={blockers} onOpenTask={onOpenTask} />
    </section>
  );
}




