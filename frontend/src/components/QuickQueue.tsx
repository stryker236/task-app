import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { QuickQueueItem } from '../../../shared/types';

type QuickQueueProps = {
  items: QuickQueueItem[];
  loading: boolean;
  onAdd: (text: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 1 | -1) => void;
  onClearDone: () => void;
  onCreateTask: (item: QuickQueueItem) => void;
};

function formatCreatedAt(value: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
}

export default function QuickQueue({ items, loading, onAdd, onToggle, onDelete, onMove, onClearDone, onCreateTask }: QuickQueueProps) {
  const [text, setText] = useState('');

  const counts = useMemo(() => ({
    total: items.length,
    open: items.filter((item) => !item.done).length,
    done: items.filter((item) => item.done).length
  }), [items]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText('');
  }

  return (
    <section className="quick-queue-view">
      <header className="quick-queue-header">
        <div>
          <span>Fila curta</span>
          <h2>Lembretes rapidos</h2>
          <p>Lembretes curtos guardados na base de dados e sincronizados entre clientes.</p>
        </div>
        <div className="quick-queue-stats">
          <strong>{counts.open}</strong>
          <span>por fazer</span>
          <strong>{counts.done}</strong>
          <span>feitos</span>
        </div>
      </header>

      <form className="quick-queue-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ex: ligar ao Carlos as 15h, confirmar email, rever ficheiro..."
          aria-label="Novo lembrete rapido"
        />
        <button className="button primary" type="submit">Adicionar</button>
      </form>

      <div className="quick-queue-actions">
        <span>{counts.total} itens na fila</span>
        <button className="button secondary small" type="button" onClick={onClearDone} disabled={!counts.done}>
          Limpar feitos
        </button>
      </div>

      {loading ? (
        <div className="loading">A carregar fila rapida...</div>
      ) : items.length ? (
        <ol className="quick-queue-list">
          {items.map((item, index) => (
            <li className={item.done ? 'done' : ''} key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(event) => onToggle(item.id, event.target.checked)}
                />
                <span>{item.text}</span>
              </label>
              <time>{formatCreatedAt(item.createdAt)}</time>
              <div className="quick-queue-item-actions">
                <button type="button" onClick={() => onCreateTask(item)}>Criar task</button>
                <button type="button" onClick={() => onMove(item.id, -1)} disabled={index === 0} aria-label="Subir item">↑</button>
                <button type="button" onClick={() => onMove(item.id, 1)} disabled={index === items.length - 1} aria-label="Descer item">↓</button>
                <button type="button" className="danger-link" onClick={() => onDelete(item.id)}>Apagar</button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-message">A fila curta esta vazia.</p>
      )}
    </section>
  );
}
