import type { Task } from '../../../../../shared/types';
import type { AdvisorPreview } from '../api';
import {
  changedFields,
  fieldValue,
  formatValue,
  taskTitleFromId,
  type ObjectRecord
} from '../advisorProposalUtils';

export function ProposalChanges({ proposal, allTasks = [] }: { proposal: AdvisorPreview['commands'][number]; allTasks?: Task[] }) {
  const changes = proposal.changes as ObjectRecord | undefined;

  if (proposal.type === 'create_calendar_event') {
    const event = changes?.calendarEvent as ObjectRecord | undefined;
    if (!event) return null;
    return (
      <dl className="advisor-change-list">
        <div><dt>Titulo</dt><dd>{String(event.summary || '')}</dd></div>
        <div><dt>Inicio</dt><dd>{String(event.start || '')}</dd></div>
        <div><dt>Fim</dt><dd>{String(event.end || '')}</dd></div>
        <div><dt>Calendario</dt><dd>{String(event.calendarSummary || event.calendarId || 'primary')}</dd></div>
        {event.calendarSelectionReason ? <div><dt>Motivo calendario</dt><dd>{String(event.calendarSelectionReason)}</dd></div> : null}
        {event.location ? <div><dt>Local</dt><dd>{String(event.location)}</dd></div> : null}
        {event.description ? <div><dt>Descricao</dt><dd>{String(event.description)}</dd></div> : null}
      </dl>
    );
  }

  if (proposal.type === 'create_task') {
    const task = changes?.createdTask as Partial<Task> | undefined;
    if (!task) return null;
    return (
      <dl className="advisor-change-list">
        <div><dt>Titulo</dt><dd>{task.title}</dd></div>
        <div><dt>Prioridade</dt><dd>{task.priority}</dd></div>
        <div><dt>Estado</dt><dd>{task.status}</dd></div>
        <div><dt>Tags</dt><dd>{formatValue(task.tags)}</dd></div>
      </dl>
    );
  }

  if (proposal.type === 'add_relation') {
    const taskTitle = proposal.taskTitle || String(fieldValue(changes?.before, 'title') || taskTitleFromId(allTasks, proposal.taskId));
    const relatedTaskTitle = proposal.relatedTaskTitle || taskTitleFromId(allTasks, proposal.relatedTaskId);

    return (
      <dl className="advisor-change-list">
        <div><dt>Relacao</dt><dd>{proposal.relationType}</dd></div>
        <div><dt>Task origem</dt><dd>{taskTitle}</dd></div>
        <div><dt>Task relacionada</dt><dd>{relatedTaskTitle}</dd></div>
      </dl>
    );
  }

  const fieldChanges = changedFields(changes?.before, changes?.after);
  if (!fieldChanges.length) return <p className="advisor-empty">Sem diferencas materiais.</p>;

  return (
    <dl className="advisor-change-list">
      {fieldChanges.map((change) => (
        <div key={change.field}>
          <dt>{change.label}</dt>
          <dd>
            <span>{formatValue(change.before)}</span>
            <strong>?</strong>
            <span>{formatValue(change.after)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
