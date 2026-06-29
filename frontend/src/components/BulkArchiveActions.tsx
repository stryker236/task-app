type BulkArchiveActionsProps = {
  onArchiveDone: () => void;
  onArchiveCancelled: () => void;
};

export default function BulkArchiveActions({ onArchiveDone, onArchiveCancelled }: BulkArchiveActionsProps) {
  return (
    <div className="bulk-archive-actions">
      <span>Arquivo rapido</span>
      <button type="button" className="button secondary small" onClick={onArchiveDone}>
        Arquivar Done
      </button>
      <button type="button" className="button secondary small" onClick={onArchiveCancelled}>
        Arquivar Cancelled
      </button>
    </div>
  );
}
