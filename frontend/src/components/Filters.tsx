import type { ChangeEvent } from 'react';
import type { Tag } from '../../../shared/types';
import type { TaskFilters } from '../features/tasks/api';
import TagFilter from './TagFilter';

type FiltersProps = {
  filters: TaskFilters;
  tags: Tag[];
  onChange: (filters: TaskFilters) => void;
  onDeleteTag: (tag: Tag, options: { force?: boolean }) => Promise<void> | void;
  onDeleteTags: (tags: Tag[], options: { force?: boolean }) => Promise<void> | void;
  onClear: () => void;
};

type FilterKey = keyof TaskFilters;

export default function Filters({ filters, tags, onChange, onDeleteTag, onDeleteTags, onClear }: FiltersProps) {
  const set = (key: FilterKey) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange({
      ...filters,
      [key]: event.target.type === 'checkbox' ? (event.target as HTMLInputElement).checked : event.target.value
    });
  };

  return (
    <section className="filters" aria-label="Filtros de tarefas">
      <input className="search-input" type="search" value={filters.search || ''} onChange={set('search')} placeholder="Pesquisar tarefas..." />
      <select value={filters.status || ''} onChange={set('status')} aria-label="Status">
        <option value="">All statuses</option>
        <option value="new">New</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="done">Done</option><option value="cancelled">Cancelled</option>
      </select>
      <select value={filters.priority || ''} onChange={set('priority')} aria-label="Prioridade">
        <option value="">Todas as prioridades</option>
        <option value="4">Urgente</option><option value="3">Alta</option><option value="2">Media</option><option value="1">Baixa</option>
      </select>
      <TagFilter
        tags={tags}
        selected={filters.tags || []}
        mode={filters.tagMode}
        onChange={(selectedTags) => onChange({ ...filters, tags: selectedTags })}
        onModeChange={(tagMode) => onChange({ ...filters, tagMode })}
        onDelete={onDeleteTag}
        onDeleteMany={onDeleteTags}
      />
      <label className="check-filter"><input type="checkbox" checked={Boolean(filters.overdue)} onChange={set('overdue')} /> Atrasadas</label>
      <label className="check-filter"><input type="checkbox" checked={Boolean(filters.today)} onChange={set('today')} /> Hoje</label>
      <label className="check-filter"><input type="checkbox" checked={Boolean(filters.noDueDate)} onChange={set('noDueDate')} /> Sem prazo</label>
      <label className="check-filter"><input type="checkbox" checked={Boolean(filters.favoriteOnly)} onChange={set('favoriteOnly')} /> Favoritas</label>
      <label className="check-filter"><input type="checkbox" checked={Boolean(filters.hideBlocked)} onChange={set('hideBlocked')} /> Ocultar bloqueadas</label>
      <label className="check-filter"><input type="checkbox" checked={Boolean(filters.hideDone)} onChange={set('hideDone')} /> Ocultar feitas</label>
      <label className="check-filter"><input type="checkbox" checked={Boolean(filters.hideCancelled)} onChange={set('hideCancelled')} /> Ocultar canceladas</label>
      <button type="button" className="button ghost" onClick={onClear}>Limpar</button>
    </section>
  );
}
