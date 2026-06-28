BEGIN;

ALTER TABLE public.tags
ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS tags_deactivated_at_idx
ON public.tags(deactivated_at)
WHERE deactivated_at IS NOT NULL;

COMMIT;
