import { useState } from 'react';
import type { GoogleCalendar } from '../../../../../shared/types';
import type { AdvisorFeedbackInput, AdvisorPreview } from '../api';
import {
  isCalendarEventProposal,
  isDueDateProposal,
  isPriorityProposal,
  proposedTags,
  type ObjectRecord
} from '../advisorProposalUtils';

export function AdvisorProposalFeedback({
  proposal,
  saved,
  googleCalendars = [],
  onSave
}: {
  proposal: AdvisorPreview['commands'][number];
  saved: boolean;
  googleCalendars?: GoogleCalendar[];
  onSave: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
}) {
  const tags = proposedTags(proposal);
  const calendarEvent = (proposal.changes as ObjectRecord | undefined)?.calendarEvent as ObjectRecord | undefined;
  const chosenCalendarId = String(calendarEvent?.calendarId || '');
  const chosenCalendarSummary = String(calendarEvent?.calendarSummary || chosenCalendarId || 'primary');
  const [overall, setOverall] = useState<AdvisorFeedbackInput['feedback']['overall']>('mixed');
  const [tagVolume, setTagVolume] = useState<AdvisorFeedbackInput['feedback']['tagVolume']>('ok');
  const [goodTags, setGoodTags] = useState<string[]>([]);
  const [badTags, setBadTags] = useState<string[]>([]);
  const [wrongReason, setWrongReason] = useState(false);
  const [wrongPriority, setWrongPriority] = useState(false);
  const [wrongDeadline, setWrongDeadline] = useState(false);
  const [priorityDirection, setPriorityDirection] = useState<AdvisorFeedbackInput['feedback']['priorityDirection']>('ok');
  const [taskAgeImportance, setTaskAgeImportance] = useState<AdvisorFeedbackInput['feedback']['taskAgeImportance']>('ok');
  const [overdueImportance, setOverdueImportance] = useState<AdvisorFeedbackInput['feedback']['overdueImportance']>('ok');
  const [dueDateDirection, setDueDateDirection] = useState<AdvisorFeedbackInput['feedback']['dueDateDirection']>('ok');
  const [calendarChoice, setCalendarChoice] = useState<AdvisorFeedbackInput['feedback']['calendarChoice']>('ok');
  const [calendarDurationDirection, setCalendarDurationDirection] = useState<AdvisorFeedbackInput['feedback']['calendarDurationDirection']>('ok');
  const [unnecessaryEvent, setUnnecessaryEvent] = useState(false);
  const [wrongCalendar, setWrongCalendar] = useState(false);
  const [preferredCalendarId, setPreferredCalendarId] = useState('');
  const [shouldBeUrgent, setShouldBeUrgent] = useState(false);
  const [shouldBeLowerPriority, setShouldBeLowerPriority] = useState(false);
  const [missingContext, setMissingContext] = useState(false);
  const priorityProposal = isPriorityProposal(proposal);
  const dueDateProposal = isDueDateProposal(proposal);
  const calendarEventProposal = isCalendarEventProposal(proposal);
  const selectedPreferredCalendar = googleCalendars.find((calendar) => calendar.id === preferredCalendarId);

  function toggle(list: string[], setter: (value: string[]) => void, tag: string) {
    setter(list.includes(tag) ? list.filter((item) => item !== tag) : [...list, tag]);
  }

  return (
    <details className="advisor-feedback">
      <summary>{saved ? 'Feedback guardado' : 'Dar feedback'}</summary>
      <div className="advisor-feedback-grid">
        <label><input type="radio" checked={overall === 'useful'} onChange={() => setOverall('useful')} /> Útil</label>
        <label><input type="radio" checked={overall === 'mixed'} onChange={() => setOverall('mixed')} /> Misto</label>
        <label><input type="radio" checked={overall === 'not_useful'} onChange={() => setOverall('not_useful')} /> Fraco</label>
      </div>

      {priorityProposal ? (
        <>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={priorityDirection === 'too_high'} onChange={() => setPriorityDirection('too_high')} /> Prioridade alta demais</label>
            <label><input type="radio" checked={priorityDirection === 'ok'} onChange={() => setPriorityDirection('ok')} /> Prioridade ok</label>
            <label><input type="radio" checked={priorityDirection === 'too_low'} onChange={() => setPriorityDirection('too_low')} /> Prioridade baixa demais</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={taskAgeImportance === 'too_much'} onChange={() => setTaskAgeImportance('too_much')} /> Valorizou demais a antiguidade</label>
            <label><input type="radio" checked={taskAgeImportance === 'ok'} onChange={() => setTaskAgeImportance('ok')} /> Antiguidade ok</label>
            <label><input type="radio" checked={taskAgeImportance === 'too_little'} onChange={() => setTaskAgeImportance('too_little')} /> Valorizou pouco a antiguidade</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={overdueImportance === 'too_much'} onChange={() => setOverdueImportance('too_much')} /> Valorizou demais o atraso</label>
            <label><input type="radio" checked={overdueImportance === 'ok'} onChange={() => setOverdueImportance('ok')} /> Atraso ok</label>
            <label><input type="radio" checked={overdueImportance === 'too_little'} onChange={() => setOverdueImportance('too_little')} /> Valorizou pouco o atraso</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="checkbox" checked={shouldBeUrgent} onChange={(event) => setShouldBeUrgent(event.target.checked)} /> Devia ser urgente</label>
            <label><input type="checkbox" checked={shouldBeLowerPriority} onChange={(event) => setShouldBeLowerPriority(event.target.checked)} /> Devia baixar prioridade</label>
          </div>
        </>
      ) : dueDateProposal ? (
        <div className="advisor-feedback-grid">
          <label><input type="radio" checked={dueDateDirection === 'too_early'} onChange={() => setDueDateDirection('too_early')} /> Prazo cedo demais</label>
          <label><input type="radio" checked={dueDateDirection === 'ok'} onChange={() => setDueDateDirection('ok')} /> Prazo ok</label>
          <label><input type="radio" checked={dueDateDirection === 'too_late'} onChange={() => setDueDateDirection('too_late')} /> Prazo tarde demais</label>
        </div>
      ) : calendarEventProposal ? (
        <>
          <div className="advisor-feedback-grid">
            <label><input type="checkbox" checked={unnecessaryEvent} onChange={(event) => setUnnecessaryEvent(event.target.checked)} /> Evento desnecessario</label>
          </div>
          <div className="advisor-feedback-calendar">
            <span>Calendario escolhido</span>
            <strong>{chosenCalendarSummary}</strong>
            <div className="advisor-feedback-grid">
              <label><input type="radio" checked={calendarChoice === 'ok'} onChange={() => { setCalendarChoice('ok'); setWrongCalendar(false); setPreferredCalendarId(''); }} /> Correto</label>
              <label><input type="radio" checked={calendarChoice === 'wrong'} onChange={() => { setCalendarChoice('wrong'); setWrongCalendar(true); }} /> Errado</label>
            </div>
            {calendarChoice === 'wrong' && googleCalendars.length > 0 && (
              <label>
                <span>Calendario preferido</span>
                <select value={preferredCalendarId} onChange={(event) => setPreferredCalendarId(event.target.value)}>
                  <option value="">Escolher calendario...</option>
                  {googleCalendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={dueDateDirection === 'too_early'} onChange={() => setDueDateDirection('too_early')} /> Hora cedo demais</label>
            <label><input type="radio" checked={dueDateDirection === 'ok'} onChange={() => setDueDateDirection('ok')} /> Hora ok</label>
            <label><input type="radio" checked={dueDateDirection === 'too_late'} onChange={() => setDueDateDirection('too_late')} /> Hora tarde demais</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={calendarDurationDirection === 'too_short'} onChange={() => setCalendarDurationDirection('too_short')} /> Duracao curta demais</label>
            <label><input type="radio" checked={calendarDurationDirection === 'ok'} onChange={() => setCalendarDurationDirection('ok')} /> Duracao ok</label>
            <label><input type="radio" checked={calendarDurationDirection === 'too_long'} onChange={() => setCalendarDurationDirection('too_long')} /> Duracao longa demais</label>
          </div>
        </>
      ) : tags.length > 0 && (
        <div className="advisor-feedback-tags">
          <span>Tags boas</span>
          {tags.map((tag) => <label key={`good-${tag}`}><input type="checkbox" checked={goodTags.includes(tag)} onChange={() => toggle(goodTags, setGoodTags, tag)} /> #{tag}</label>)}
          <span>Tags más</span>
          {tags.map((tag) => <label key={`bad-${tag}`}><input type="checkbox" checked={badTags.includes(tag)} onChange={() => toggle(badTags, setBadTags, tag)} /> #{tag}</label>)}
        </div>
      )}

      {!priorityProposal && !dueDateProposal && !calendarEventProposal && <div className="advisor-feedback-grid">
        <label><input type="radio" checked={tagVolume === 'more'} onChange={() => setTagVolume('more')} /> Mais tags</label>
        <label><input type="radio" checked={tagVolume === 'ok'} onChange={() => setTagVolume('ok')} /> Quantidade ok</label>
        <label><input type="radio" checked={tagVolume === 'less'} onChange={() => setTagVolume('less')} /> Menos tags</label>
      </div>}

      <div className="advisor-feedback-grid">
        <label><input type="checkbox" checked={wrongReason} onChange={(event) => setWrongReason(event.target.checked)} /> Razão fraca</label>
        {!priorityProposal && !dueDateProposal && !calendarEventProposal && <label><input type="checkbox" checked={wrongPriority} onChange={(event) => setWrongPriority(event.target.checked)} /> Prioridade errada</label>}
        {!calendarEventProposal && <label><input type="checkbox" checked={wrongDeadline} onChange={(event) => setWrongDeadline(event.target.checked)} /> Prazo errado</label>}
        <label><input type="checkbox" checked={missingContext} onChange={(event) => setMissingContext(event.target.checked)} /> Devia pedir contexto</label>
      </div>

      <button
        type="button"
        className="button secondary small"
        onClick={() => onSave({
          overall,
          tagVolume: priorityProposal || dueDateProposal || calendarEventProposal ? 'ok' : tagVolume,
          goodTags: priorityProposal || dueDateProposal || calendarEventProposal ? [] : goodTags,
          badTags: priorityProposal || dueDateProposal || calendarEventProposal ? [] : badTags,
          wrongReason,
          wrongPriority: priorityProposal ? priorityDirection !== 'ok' || wrongPriority : wrongPriority,
          wrongDeadline: dueDateProposal || calendarEventProposal ? dueDateDirection !== 'ok' || wrongDeadline : wrongDeadline,
          priorityDirection,
          taskAgeImportance,
          overdueImportance,
          dueDateDirection,
          calendarChoice,
          calendarDurationDirection,
          unnecessaryEvent,
          wrongCalendar: wrongCalendar || calendarChoice === 'wrong',
          chosenCalendarId,
          chosenCalendarSummary,
          preferredCalendarId: calendarChoice === 'wrong' ? preferredCalendarId : '',
          preferredCalendarSummary: calendarChoice === 'wrong' ? selectedPreferredCalendar?.summary || '' : '',
          shouldBeUrgent,
          shouldBeLowerPriority,
          missingContext
        })}
        disabled={saved}
      >
        {saved ? 'Guardado' : 'Guardar feedback'}
      </button>
    </details>
  );
}

export function AdvisorInteractionFeedback({
  saved,
  action,
  onSave
}: {
  saved: boolean;
  action?: string;
  onSave: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
}) {
  const [overall, setOverall] = useState<AdvisorFeedbackInput['feedback']['overall']>('mixed');
  const [wrongReason, setWrongReason] = useState(false);
  const [wrongPriority, setWrongPriority] = useState(false);
  const [wrongDeadline, setWrongDeadline] = useState(false);
  const [priorityDirection, setPriorityDirection] = useState<AdvisorFeedbackInput['feedback']['priorityDirection']>('ok');
  const [taskAgeImportance, setTaskAgeImportance] = useState<AdvisorFeedbackInput['feedback']['taskAgeImportance']>('ok');
  const [overdueImportance, setOverdueImportance] = useState<AdvisorFeedbackInput['feedback']['overdueImportance']>('ok');
  const [dueDateDirection, setDueDateDirection] = useState<AdvisorFeedbackInput['feedback']['dueDateDirection']>('ok');
  const [calendarDurationDirection, setCalendarDurationDirection] = useState<AdvisorFeedbackInput['feedback']['calendarDurationDirection']>('ok');
  const [unnecessaryEvent, setUnnecessaryEvent] = useState(false);
  const [wrongCalendar, setWrongCalendar] = useState(false);
  const [missingContext, setMissingContext] = useState(false);
  const priorityInteraction = action === 'priority_management';
  const dueDateInteraction = action === 'suggest_due_dates';
  const calendarInteraction = action === 'schedule_calendar_events';

  return (
    <details className="advisor-feedback advisor-interaction-feedback">
      <summary>{saved ? 'Feedback da interacao guardado' : 'Feedback da interacao'}</summary>
      <div className="advisor-feedback-grid">
        <label><input type="radio" checked={overall === 'useful'} onChange={() => setOverall('useful')} /> Util</label>
        <label><input type="radio" checked={overall === 'mixed'} onChange={() => setOverall('mixed')} /> Mista</label>
        <label><input type="radio" checked={overall === 'not_useful'} onChange={() => setOverall('not_useful')} /> Fraca</label>
      </div>
      {priorityInteraction && (
        <>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={priorityDirection === 'too_high'} onChange={() => setPriorityDirection('too_high')} /> Subiu demais prioridades</label>
            <label><input type="radio" checked={priorityDirection === 'ok'} onChange={() => setPriorityDirection('ok')} /> Direcao ok</label>
            <label><input type="radio" checked={priorityDirection === 'too_low'} onChange={() => setPriorityDirection('too_low')} /> Subiu pouco prioridades</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={taskAgeImportance === 'too_much'} onChange={() => setTaskAgeImportance('too_much')} /> Peso excessivo na antiguidade</label>
            <label><input type="radio" checked={taskAgeImportance === 'ok'} onChange={() => setTaskAgeImportance('ok')} /> Antiguidade ok</label>
            <label><input type="radio" checked={taskAgeImportance === 'too_little'} onChange={() => setTaskAgeImportance('too_little')} /> Pouco peso na antiguidade</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={overdueImportance === 'too_much'} onChange={() => setOverdueImportance('too_much')} /> Peso excessivo no atraso</label>
            <label><input type="radio" checked={overdueImportance === 'ok'} onChange={() => setOverdueImportance('ok')} /> Atraso ok</label>
            <label><input type="radio" checked={overdueImportance === 'too_little'} onChange={() => setOverdueImportance('too_little')} /> Pouco peso no atraso</label>
          </div>
        </>
      )}
      {dueDateInteraction && (
        <div className="advisor-feedback-grid">
          <label><input type="radio" checked={dueDateDirection === 'too_early'} onChange={() => setDueDateDirection('too_early')} /> Prazos cedo demais</label>
          <label><input type="radio" checked={dueDateDirection === 'ok'} onChange={() => setDueDateDirection('ok')} /> Prazos ok</label>
          <label><input type="radio" checked={dueDateDirection === 'too_late'} onChange={() => setDueDateDirection('too_late')} /> Prazos tarde demais</label>
        </div>
      )}
      {calendarInteraction && (
        <>
          <div className="advisor-feedback-grid">
            <label><input type="checkbox" checked={unnecessaryEvent} onChange={(event) => setUnnecessaryEvent(event.target.checked)} /> Criou eventos desnecessarios</label>
            <label><input type="checkbox" checked={wrongCalendar} onChange={(event) => setWrongCalendar(event.target.checked)} /> Escolheu calendario errado</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={dueDateDirection === 'too_early'} onChange={() => setDueDateDirection('too_early')} /> Horas cedo demais</label>
            <label><input type="radio" checked={dueDateDirection === 'ok'} onChange={() => setDueDateDirection('ok')} /> Horas ok</label>
            <label><input type="radio" checked={dueDateDirection === 'too_late'} onChange={() => setDueDateDirection('too_late')} /> Horas tarde demais</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={calendarDurationDirection === 'too_short'} onChange={() => setCalendarDurationDirection('too_short')} /> Duracoes curtas demais</label>
            <label><input type="radio" checked={calendarDurationDirection === 'ok'} onChange={() => setCalendarDurationDirection('ok')} /> Duracoes ok</label>
            <label><input type="radio" checked={calendarDurationDirection === 'too_long'} onChange={() => setCalendarDurationDirection('too_long')} /> Duracoes longas demais</label>
          </div>
        </>
      )}
      <div className="advisor-feedback-grid">
        <label><input type="checkbox" checked={wrongReason} onChange={(event) => setWrongReason(event.target.checked)} /> Razao fraca</label>
        {!priorityInteraction && !dueDateInteraction && !calendarInteraction && <label><input type="checkbox" checked={wrongPriority} onChange={(event) => setWrongPriority(event.target.checked)} /> Prioridades erradas</label>}
        {!calendarInteraction && <label><input type="checkbox" checked={wrongDeadline} onChange={(event) => setWrongDeadline(event.target.checked)} /> Prazos mal avaliados</label>}
        <label><input type="checkbox" checked={missingContext} onChange={(event) => setMissingContext(event.target.checked)} /> Devia pedir contexto</label>
      </div>
      <button
        type="button"
        className="button secondary small"
        onClick={() => onSave({
          overall,
          tagVolume: 'ok',
          goodTags: [],
          badTags: [],
          wrongReason,
          wrongPriority: priorityInteraction ? priorityDirection !== 'ok' || wrongPriority : wrongPriority,
          wrongDeadline: dueDateInteraction || calendarInteraction ? dueDateDirection !== 'ok' || wrongDeadline : wrongDeadline,
          priorityDirection,
          taskAgeImportance,
          overdueImportance,
          dueDateDirection,
          calendarDurationDirection,
          unnecessaryEvent,
          wrongCalendar,
          shouldBeUrgent: false,
          shouldBeLowerPriority: false,
          missingContext
        })}
        disabled={saved}
      >
        {saved ? 'Guardado' : 'Guardar feedback'}
      </button>
    </details>
  );
}
