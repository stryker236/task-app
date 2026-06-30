BEGIN;

CREATE TABLE public.shared_note_tags (
  note_id uuid NOT NULL,
  tag_id uuid NOT NULL,

  CONSTRAINT shared_note_tags_pkey PRIMARY KEY (note_id, tag_id),

  CONSTRAINT shared_note_tags_note_id_fkey
    FOREIGN KEY (note_id)
    REFERENCES public.shared_notes(id)
    ON DELETE CASCADE,

  CONSTRAINT shared_note_tags_tag_id_fkey
    FOREIGN KEY (tag_id)
    REFERENCES public.tags(id)
    ON DELETE CASCADE
);

CREATE INDEX shared_note_tags_tag_id_idx
ON public.shared_note_tags(tag_id);

COMMIT;
