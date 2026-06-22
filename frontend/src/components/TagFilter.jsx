import { useState } from 'react';

const normalize = (value) => value.toLocaleLowerCase();

export default function TagFilter({ tags, selected, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedKeys = new Set(selected.map(normalize));
  const visible = tags.filter((tag) => normalize(tag.name).includes(normalize(search.trim())));

  function toggle(name) {
    const key = normalize(name);
    onChange(selectedKeys.has(key)
      ? selected.filter((tag) => normalize(tag) !== key)
      : [...selected, name]);
  }

  return (
    <div className="tag-filter-control">
      <button type="button" className={selected.length ? 'tag-filter-button has-selection' : 'tag-filter-button'} onClick={() => setOpen((value) => !value)}>
        {selected.length ? `Tags (${selected.length})` : 'Todas as tags'}
      </button>
      {open && (
        <div className="tag-filter-menu">
          <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tags…" />
          <div className="tag-filter-options">
            {visible.map((tag) => (
              <div className="tag-filter-option" key={tag.id}>
                <label>
                  <input type="checkbox" checked={selectedKeys.has(normalize(tag.name))} onChange={() => toggle(tag.name)} />
                  <span>#{tag.name}</span>
                </label>
                <small>{tag.usageCount} {tag.usageCount === 1 ? 'tarefa' : 'tarefas'}</small>
                {tag.usageCount === 0 && <button type="button" className="delete-tag-button" title={`Eliminar ${tag.name}`} aria-label={`Eliminar tag ${tag.name}`} onClick={() => onDelete(tag)}>×</button>}
              </div>
            ))}
            {visible.length === 0 && <p>Nenhuma tag encontrada.</p>}
          </div>
          <div className="tag-filter-actions">
            <button type="button" onClick={() => onChange([])}>Limpar</button>
            <button type="button" className="button primary small" onClick={() => setOpen(false)}>Concluir</button>
          </div>
        </div>
      )}
    </div>
  );
}
