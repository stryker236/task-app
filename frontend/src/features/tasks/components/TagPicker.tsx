import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Tag } from '../../../../../shared/types';

type TagPickerProps = {
  tags: Tag[];
  selected: string[];
  onChange: (tags: string[]) => void;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export default function TagPicker({ tags, selected, onChange }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedKeys = useMemo(() => new Set(selected.map(normalize)), [selected]);
  const term = normalize(search);
  const visibleTags = tags.filter((tag) => !term || normalize(tag.name).includes(term));
  const exactTagExists = tags.some((tag) => normalize(tag.name) === term) || selectedKeys.has(term);
  const canCreate = term.length > 0 && term.length <= 50 && !exactTagExists;

  function toggle(name: string) {
    const key = normalize(name);
    onChange(selectedKeys.has(key)
      ? selected.filter((tag) => normalize(tag) !== key)
      : [...selected, name]);
  }

  function createTag() {
    const name = search.trim();
    if (!canCreate) return;
    onChange([...selected, name]);
    setSearch('');
  }

  function stopDialogMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  return (
    <div className="dependency-field">
      <div className="field-heading">
        <span>Tags</span>
        <button type="button" className="button secondary small" onClick={() => setOpen(true)}>+ Adicionar tag</button>
      </div>
      <div className="selected-dependencies">
        {selected.length === 0 && <span className="muted">Sem tags</span>}
        {selected.map((tag) => (
          <span className="dependency-chip tag-chip" key={normalize(tag)}>
            #{tag}
            <button type="button" aria-label={`Remover tag ${tag}`} onClick={() => toggle(tag)}>x</button>
          </span>
        ))}
      </div>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div className="dialog dependency-dialog" role="dialog" aria-modal="true" aria-labelledby="tag-picker-title" onMouseDown={stopDialogMouseDown}>
            <div className="dialog-header">
              <div><h2 id="tag-picker-title">Selecionar tags</h2><p>Reutilize uma tag existente ou crie uma nova.</p></div>
              <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>x</button>
            </div>
            <input autoFocus type="search" maxLength={50} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tags..." />
            <div className="dependency-list">
              {canCreate && (
                <button type="button" className="create-tag-option" onClick={createTag}>+ Criar tag "{search.trim()}"</button>
              )}
              {visibleTags.map((tag) => (
                <label className="dependency-option" key={tag.id}>
                  <input type="checkbox" checked={selectedKeys.has(normalize(tag.name))} onChange={() => toggle(tag.name)} />
                  <span><strong>#{tag.name}</strong></span>
                </label>
              ))}
              {!canCreate && visibleTags.length === 0 && <p className="empty-message">Nenhuma tag encontrada.</p>}
            </div>
            <div className="dialog-actions"><button type="button" className="button primary" onClick={() => setOpen(false)}>Concluir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

