import { useState } from 'react';

const normalize = (value) => value.toLocaleLowerCase();

export default function TagFilter({
  tags,
  selected,
  mode = 'and',
  onChange,
  onModeChange,
  onDelete,
  onDeleteMany
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedForDelete, setSelectedForDelete] = useState([]);
  const selectedKeys = new Set(selected.map(normalize));
  const visible = tags.filter((tag) => normalize(tag.name).includes(normalize(search.trim())));
  const deleteSelection = new Set(selectedForDelete);
  const selectedTagsForDeactivation = tags.filter((tag) => deleteSelection.has(tag.id));
  const selectedActiveUsage = selectedTagsForDeactivation.reduce((sum, tag) => sum + (tag.activeUsageCount ?? tag.usageCount ?? 0), 0);

  function toggle(name) {
    const key = normalize(name);
    onChange(selectedKeys.has(key)
      ? selected.filter((tag) => normalize(tag) !== key)
      : [...selected, name]);
  }

  function toggleDelete(id) {
    setSelectedForDelete((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  function toggleAllVisibleUnused() {
    const visibleIds = visible.map((tag) => tag.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => deleteSelection.has(id));
    setSelectedForDelete((current) => {
      if (allSelected) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  }

  async function deleteSelected() {
    await onDeleteMany(selectedTagsForDeactivation, { force: selectedActiveUsage > 0 });
    setSelectedForDelete([]);
  }

  return (
    <div className="tag-filter-control">
      <button type="button" className={selected.length ? 'tag-filter-button has-selection' : 'tag-filter-button'} onClick={() => setOpen((value) => !value)}>
        {selected.length ? `Tags (${selected.length}, ${mode.toUpperCase()})` : 'Todas as tags'}
      </button>
      {open && (
        <div className="tag-filter-menu">
          <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tags…" />

          <div className="tag-mode-toggle" aria-label="Modo de combinação de tags">
            <span>Combinar tags</span>
            <button type="button" className={mode !== 'or' ? 'active' : ''} onClick={() => onModeChange('and')}>
              AND
            </button>
            <button type="button" className={mode === 'or' ? 'active' : ''} onClick={() => onModeChange('or')}>
              OR
            </button>
          </div>

          <div className="tag-bulk-delete-bar">
            <label>
              <input type="checkbox" checked={visible.length > 0 && visible.every((tag) => deleteSelection.has(tag.id))} disabled={!visible.length} onChange={toggleAllVisibleUnused} />
              <span>Selecionar visíveis</span>
            </label>
            <button type="button" className={selectedActiveUsage > 0 ? 'button danger small' : 'button secondary small'} disabled={!selectedTagsForDeactivation.length} onClick={deleteSelected}>
              {selectedActiveUsage > 0 ? 'Forçar desativação' : 'Desativar'} ({selectedTagsForDeactivation.length})
            </button>
          </div>

          <div className="tag-filter-options">
            {visible.map((tag) => (
              <div className="tag-filter-option" key={tag.id}>
                <input
                  type="checkbox"
                  className="tag-delete-checkbox"
                  title={`Selecionar ${tag.name} para desativar`}
                  aria-label={`Selecionar tag ${tag.name} para desativar`}
                  checked={deleteSelection.has(tag.id)}
                  onChange={() => toggleDelete(tag.id)}
                />
                <label>
                  <input type="checkbox" checked={selectedKeys.has(normalize(tag.name))} onChange={() => toggle(tag.name)} />
                  <span>#{tag.name}</span>
                </label>
                <small>{tag.activeUsageCount ?? tag.usageCount} ativas / {tag.usageCount} total</small>
                <button
                  type="button"
                  className={(tag.activeUsageCount ?? tag.usageCount) > 0 ? 'delete-tag-button force' : 'delete-tag-button'}
                  title={`${(tag.activeUsageCount ?? tag.usageCount) > 0 ? 'Forçar desativação de' : 'Desativar'} ${tag.name}`}
                  aria-label={`${(tag.activeUsageCount ?? tag.usageCount) > 0 ? 'Forçar desativação da tag' : 'Desativar tag'} ${tag.name}`}
                  onClick={() => onDelete(tag, { force: (tag.activeUsageCount ?? tag.usageCount) > 0 })}
                >
                  ×
                </button>
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
