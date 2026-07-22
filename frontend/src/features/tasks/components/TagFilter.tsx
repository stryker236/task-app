import { useEffect, useRef, useState } from 'react';
import type { Tag } from '../../../../../shared/types';

type TagMode = 'and' | 'or' | 'not' | 'nand';

const TAG_MODES: Array<{ value: TagMode; label: string }> = [
  { value: 'and', label: 'AND' },
  { value: 'or', label: 'OR' },
  { value: 'not', label: 'NOT' },
  { value: 'nand', label: 'NAND' }
];

type TagFilterProps = {
  tags: Tag[];
  selected: string[];
  mode?: TagMode;
  onChange: (tags: string[]) => void;
  onModeChange: (mode: TagMode) => void;
  onDelete: (tag: Tag, options: { force?: boolean }) => Promise<void> | void;
  onDeleteMany: (tags: Tag[], options: { force?: boolean }) => Promise<void> | void;
};

const normalize = (value: string) => value.toLocaleLowerCase();

function tagUsage(tag: Tag) {
  return tag.activeUsageCount ?? tag.usageCount ?? tag.activeTaskCount ?? tag.taskCount ?? 0;
}

function totalUsage(tag: Tag) {
  return tag.usageCount ?? tag.taskCount ?? tagUsage(tag);
}

export default function TagFilter({
  tags,
  selected,
  mode = 'and',
  onChange,
  onModeChange,
  onDelete,
  onDeleteMany
}: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const selectedKeys = new Set(selected.map(normalize));
  const visible = tags.filter((tag) => normalize(tag.name).includes(normalize(search.trim())));
  const deleteSelection = new Set(selectedForDelete);
  const selectedTagsForDeactivation = tags.filter((tag) => deleteSelection.has(tag.id));
  const selectedActiveUsage = selectedTagsForDeactivation.reduce((sum, tag) => sum + tagUsage(tag), 0);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  function toggle(name: string) {
    const key = normalize(name);
    onChange(selectedKeys.has(key)
      ? selected.filter((tag) => normalize(tag) !== key)
      : [...selected, name]);
  }

  function toggleDelete(id: string) {
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
    <div className="tag-filter-control" ref={controlRef}>
      <button type="button" className={selected.length ? 'tag-filter-button has-selection' : 'tag-filter-button'} onClick={() => setOpen((value) => !value)}>
        {selected.length ? `Tags (${selected.length}, ${mode.toUpperCase()})` : 'Todas as tags'}
      </button>
      {open && (
        <div className="tag-filter-menu">
          <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tags..." />

          <div className="tag-mode-toggle" aria-label="Modo de combinacao de tags">
            <span>Combinar tags</span>
            {TAG_MODES.map((tagMode) => (
              <button type="button" className={mode === tagMode.value ? 'active' : ''} onClick={() => onModeChange(tagMode.value)} key={tagMode.value}>
                {tagMode.label}
              </button>
            ))}
          </div>

          <div className="tag-bulk-delete-bar">
            <label>
              <input type="checkbox" checked={visible.length > 0 && visible.every((tag) => deleteSelection.has(tag.id))} disabled={!visible.length} onChange={toggleAllVisibleUnused} />
              <span>Selecionar visiveis</span>
            </label>
            <button type="button" className={selectedActiveUsage > 0 ? 'button danger small' : 'button secondary small'} disabled={!selectedTagsForDeactivation.length} onClick={deleteSelected}>
              {selectedActiveUsage > 0 ? 'Forcar desativacao' : 'Desativar'} ({selectedTagsForDeactivation.length})
            </button>
          </div>

          <div className="tag-filter-options">
            {visible.map((tag) => {
              const activeUsage = tagUsage(tag);
              return (
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
                  <small>{activeUsage} ativas / {totalUsage(tag)} total</small>
                  <button
                    type="button"
                    className={activeUsage > 0 ? 'delete-tag-button force' : 'delete-tag-button'}
                    title={`${activeUsage > 0 ? 'Forcar desativacao de' : 'Desativar'} ${tag.name}`}
                    aria-label={`${activeUsage > 0 ? 'Forcar desativacao da tag' : 'Desativar tag'} ${tag.name}`}
                    onClick={() => onDelete(tag, { force: activeUsage > 0 })}
                  >
                    x
                  </button>
                </div>
              );
            })}
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

