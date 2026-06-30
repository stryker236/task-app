BEGIN;

CREATE TABLE public.shared_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (
    length(btrim(title)) > 0
    AND length(title) <= 200
  ),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 50000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,

  CONSTRAINT shared_notes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.task_shared_notes (
  task_id uuid NOT NULL,
  note_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT task_shared_notes_pkey PRIMARY KEY (task_id, note_id),

  CONSTRAINT task_shared_notes_task_id_fkey
    FOREIGN KEY (task_id)
    REFERENCES public.tasks(id)
    ON DELETE CASCADE,

  CONSTRAINT task_shared_notes_note_id_fkey
    FOREIGN KEY (note_id)
    REFERENCES public.shared_notes(id)
    ON DELETE CASCADE
);

CREATE INDEX shared_notes_archived_at_idx
ON public.shared_notes(archived_at);

CREATE INDEX shared_notes_updated_at_idx
ON public.shared_notes(updated_at DESC);

CREATE INDEX task_shared_notes_note_id_idx
ON public.task_shared_notes(note_id);

COMMIT;
