BEGIN;

-- Preserve the current task/tag assignments while the relationship is rebuilt.
ALTER TABLE public.task_tags RENAME TO task_tags_legacy;

CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
    CHECK (length(btrim(name)) > 0 AND length(name) <= 50),
  normalized_name TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tags_normalized_name_key UNIQUE (normalized_name)
);

CREATE TABLE public.task_tags (
  task_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  CONSTRAINT task_tags_new_pkey PRIMARY KEY (task_id, tag_id),
  CONSTRAINT task_tags_new_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_tags_new_tag_id_fkey
    FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE
);

-- Collapse spelling variants that differ only by casing or surrounding spaces.
INSERT INTO public.tags (name)
SELECT DISTINCT ON (lower(btrim(tag))) btrim(tag)
FROM public.task_tags_legacy
ORDER BY lower(btrim(tag)), btrim(tag);

INSERT INTO public.task_tags (task_id, tag_id)
SELECT DISTINCT legacy.task_id, tags.id
FROM public.task_tags_legacy AS legacy
JOIN public.tags AS tags
  ON tags.normalized_name = lower(btrim(legacy.tag));

DROP TABLE public.task_tags_legacy;

ALTER TABLE public.task_tags
  RENAME CONSTRAINT task_tags_new_pkey TO task_tags_pkey;
ALTER TABLE public.task_tags
  RENAME CONSTRAINT task_tags_new_task_id_fkey TO task_tags_task_id_fkey;
ALTER TABLE public.task_tags
  RENAME CONSTRAINT task_tags_new_tag_id_fkey TO task_tags_tag_id_fkey;

CREATE INDEX task_tags_tag_id_idx ON public.task_tags(tag_id);

COMMIT;
