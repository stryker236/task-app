import { useEffect, useState } from 'react';
import DependencyPicker from './DependencyPicker';
import MarkdownNotes from './MarkdownNotes';

const EMPTY_TASK = {
  title: '', description: '', requestedBy: '', needToAsk: [], priority: 2, status: 'novo',
  dueDateTime: '', tags: [], blockedReason: '', blockedByTaskIds: [], notesMarkdown: ''
};

function toLocalInput(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function TaskForm({ task, tasks, onSave, onClose, saving }) {
  const [form, setForm] = useState(EMPTY_TASK);
  const [needToAskText, setNeedToAskText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');

  useEffect(() => {
    const localDeadline = task ? toLocalInput(task.dueDateTime) : '';
    const source = task ? { ...task, dueDateTime: localDeadline } : EMPTY_TASK;
    setForm(source);
    setNeedToAskText((source.needToAsk || []).join(', '));
    setTagsText((source.tags || []).join(', '));
    setDueDate(localDeadline ? localDeadline.slice(0, 10) : '');
    setDueTime(localDeadline ? localDeadline.slice(11, 16) : '');
  }, [task]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const splitList = (value) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];

  function submit(event) {
    event.preventDefault();
    const deadline = dueDate ? new Date(`${dueDate}T${dueTime || '23:59'}`).toISOString() : null;
    onSave({
      ...form,
      priority: Number(form.priority),
      dueDateTime: deadline,
      needToAsk: splitList(needToAskText),
      tags: splitList(tagsText)
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dialog task-form" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div><h2>{task ? 'Editar tarefa' : 'Nova tarefa'}</h2><p>Os campos com * são obrigatórios.</p></div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <label className="full">Título *<input required value={form.title} onChange={set('title')} autoFocus /></label>
          <label className="full">Descrição<textarea rows="3" value={form.description} onChange={set('description')} /></label>
          <label>Pedido por<input value={form.requestedBy} onChange={set('requestedBy')} /></label>
          <label>Perguntar a <small>(separado por vírgulas)</small><input value={needToAskText} onChange={(event) => setNeedToAskText(event.target.value)} /></label>
          <label>Prioridade *
            <select required value={form.priority} onChange={set('priority')}>
              <option value="1">Baixa</option><option value="2">Média</option><option value="3">Alta</option><option value="4">Urgente</option>
            </select>
          </label>
          <label>Estado *
            <select required value={form.status} onChange={set('status')}>
              <option value="novo">Novo</option><option value="em_curso">Em curso</option><option value="a_espera">À espera</option><option value="feito">Feito</option><option value="cancelado">Cancelado</option>
            </select>
          </label>
          <label>Data do prazo
            <input
              type="date"
              value={dueDate}
              onChange={(event) => {
                const value = event.target.value;
                setDueDate(value);
                if (value && !dueTime) setDueTime('23:59');
                if (!value) setDueTime('');
              }}
            />
          </label>
          <label>Hora do prazo
            <input type="time" value={dueTime} disabled={!dueDate} onChange={(event) => setDueTime(event.target.value)} />
            {dueDate && dueTime === '23:59' && <small>Fim do dia por predefinição</small>}
          </label>
          <label>Etiquetas <small>(separado por vírgulas)</small><input value={tagsText} onChange={(event) => setTagsText(event.target.value)} /></label>
          <label className="full">Motivo do bloqueio<textarea rows="2" value={form.blockedReason} onChange={set('blockedReason')} /></label>
          <div className="full">
            <DependencyPicker tasks={tasks} selectedIds={form.blockedByTaskIds || []} currentTaskId={task?.id} onChange={(ids) => setForm((current) => ({ ...current, blockedByTaskIds: ids }))} />
          </div>
          <div className="full notes-field"><span>Notas Markdown</span><MarkdownNotes editable value={form.notesMarkdown} onChange={(value) => setForm((current) => ({ ...current, notesMarkdown: value }))} /></div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'A guardar…' : 'Guardar tarefa'}</button>
        </div>
      </form>
    </div>
  );
}
