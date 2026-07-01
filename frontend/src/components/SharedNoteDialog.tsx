import type { SharedNote } from '../../../shared/types';
import type { MouseEvent } from 'react';

type SharedNoteDialogProps = {
  note: SharedNote;
  onClose: () => void;
};

function stopDialogMouseDown(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export default function SharedNoteDialog({ note, onClose }: SharedNoteDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog shared-note-dialog" role="dialog" aria-modal="true" onMouseDown={stopDialogMouseDown}>
        <div className="dialog-header">
          <div>
            <h2>{note.title}</h2>
            {note.tags.length ? <div className="tag-list shared-note-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>x</button>
        </div>
        <div className="shared-note-dialog-body">
          {note.body ? <p>{note.body}</p> : <p className="details-empty">Sem conteudo.</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button primary" onClick={onClose}>Fechar</button>
        </div>
      </section>
    </div>
  );
}
