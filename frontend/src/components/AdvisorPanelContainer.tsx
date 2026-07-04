import type { Task } from '../../../shared/types';
import { useAdvisorContext } from '../context/AdvisorContext';
import { useGoogleCalendarContext } from '../context/GoogleCalendarContext';
import AdvisorPanel from './AdvisorPanel';

type AdvisorPanelContainerProps = {
  allTasks: Task[];
};

export default function AdvisorPanelContainer({ allTasks }: AdvisorPanelContainerProps) {
  const googleCalendar = useGoogleCalendarContext();
  const advisor = useAdvisorContext();

  return (
    <AdvisorPanel
      allTasks={allTasks}
      advice={advisor.advisor}
      loading={advisor.advisorLoading}
      proposals={advisor.proposalBatch}
      currentAction={advisor.lastAdvisorAction}
      proposalStatuses={advisor.proposalStatuses}
      proposalFeedbackStatuses={advisor.proposalFeedbackStatuses}
      interactionFeedbackSaved={advisor.interactionFeedbackSaved}
      memoryRules={advisor.advisorMemoryRules}
      memoryLoading={advisor.advisorMemoryLoading}
      applyingProposalId={advisor.applyingProposalId}
      applyingAllProposals={advisor.applyingAllProposals}
      googleStatus={googleCalendar.googleStatus}
      googleCalendars={googleCalendar.googleCalendars}
      advisorDefaultCalendarId={googleCalendar.advisorDefaultCalendarId}
      onRefresh={advisor.refreshTaskAdvisorAdvice}
      onRequestActions={(action) => advisor.requestAdvisorActions(action, { defaultCalendarId: googleCalendar.advisorDefaultCalendarId })}
      onConnectGoogle={googleCalendar.connectGoogle}
      onApplyProposal={advisor.applyAdvisorProposal}
      onIgnoreProposal={advisor.ignoreAdvisorProposal}
      onApplyAllProposals={advisor.applyAllAdvisorProposals}
      onIgnoreAllProposals={advisor.ignoreAllAdvisorProposals}
      onClearProposals={advisor.clearAdvisorProposals}
      onAdvisorDefaultCalendarChange={googleCalendar.setAdvisorDefaultCalendarId}
      onChangeProposalCalendar={advisor.updateAdvisorProposalCalendar}
      onSaveProposalFeedback={advisor.saveAdvisorProposalFeedback}
      onSaveInteractionFeedback={advisor.saveAdvisorInteractionFeedback}
      onRefreshMemory={advisor.refreshAdvisorMemoryRules}
      onForgetMemory={advisor.forgetAdvisorMemoryRule}
      onOpenTask={advisor.openAdvisorRecommendedTask}
    />
  );
}
