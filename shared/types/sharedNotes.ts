export interface SharedNote {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  linkedTaskIds?: string[];
}

export type SharedNoteInput = {
  title: string;
  body?: string;
  tags?: string[];
};
