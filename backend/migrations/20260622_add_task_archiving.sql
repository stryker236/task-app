BEGIN;

ALTER TYPE public.activity_type
ADD VALUE IF NOT EXISTS 'archive';

ALTER TABLE public.tasks
ADD COLUMN archived_at timestamptz;

CREATE INDEX tasks_archived_at_idx
ON public.tasks(archived_at)
WHERE archived_at IS NOT NULL;

COMMIT;
