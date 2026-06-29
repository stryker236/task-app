import { useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import type { Task } from '../../../shared/types';

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

type PostponeDialogProps = {
  task: Task;
  onClose: () => void;
  onSave: (task: Task, dueDateTime: string) => void;
  saving: boolean;
};

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function PostponeDialog({ task, onClose, onSave, saving }: PostponeDialogProps) {
  const [dueDate, setDueDate] = useState(tomorrow);
  const [hour, setHour] = useState('23');
  const [minute, setMinute] = useState('59');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const deadline = new Date(`${dueDate}T${hour}:${minute}`);
    if (deadline <= new Date()) {
      setError('Escolha uma data e hora futuras.');
      return;
    }
    onSave(task, deadline.toISOString());
  }

  function stopDialogMouseDown(event: MouseEvent<HTMLFormElement>) {
    event.stopPropagation();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dialog postpone-dialog" onSubmit={submit} onMouseDown={stopDialogMouseDown}>
        <div className="dialog-header">
          <div><h2>Adiar tarefa</h2><p>{task.title}</p></div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>x</button>
        </div>
        <div className="postpone-fields">
          <label>Nova data
            <input type="date" required value={dueDate} onChange={(event) => { setDueDate(event.target.value); setError(''); }} />
          </label>
          <label>Nova hora <small>(24 horas)</small>
            <span className="time-select-group">
              <select aria-label="Hora" value={hour} onChange={(event) => setHour(event.target.value)}>
                {HOURS.map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
              <strong>:</strong>
              <select aria-label="Minuto" value={minute} onChange={(event) => setMinute(event.target.value)}>
                {MINUTES.map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
            </span>
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'A guardar...' : 'Adiar'}</button>
        </div>
      </form>
    </div>
  );
}
