import type { ChecklistItem } from '../../../shared/types';

type EditableChecklistItem = Partial<ChecklistItem> & {
  _key?: string;
  title: string;
  isDone: boolean;
};

type ChecklistEditorProps = {
  items: EditableChecklistItem[];
  onChange: (items: EditableChecklistItem[]) => void;
};

const newItem = (): EditableChecklistItem => ({
  _key: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  title: '',
  isDone: false
});

export default function ChecklistEditor({ items, onChange }: ChecklistEditorProps) {
  function update(index: number, changes: Partial<EditableChecklistItem>) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  return (
    <div className="checklist-editor">
      <div className="field-heading">
        <span>Checklist</span>
        <button type="button" className="button secondary small" onClick={() => onChange([...items, newItem()])}>+ Adicionar item</button>
      </div>
      {items.length === 0 && <span className="muted">Sem itens.</span>}
      {items.map((item, index) => (
        <div className="checklist-edit-row" key={item.id || item._key || index}>
          <input type="checkbox" checked={item.isDone === true} onChange={(event) => update(index, { isDone: event.target.checked })} />
          <input required value={item.title} maxLength={300} placeholder="Item do checklist" onChange={(event) => update(index, { title: event.target.value })} />
          <button type="button" className="icon-text-button danger-link" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remover</button>
        </div>
      ))}
    </div>
  );
}
