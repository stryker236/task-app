export default function BulkArchiveActions({ onArchiveDone, onArchiveCancelled }) {
  return (
    <div className="bulk-archive-actions">
      <span>Arquivo rápido</span>
      <button type="button" className="button secondary small" onClick={onArchiveDone}>
        Arquivar Done
      </button>
      <button type="button" className="button secondary small" onClick={onArchiveCancelled}>
        Arquivar Cancelled
      </button>
    </div>
  );
}
