BEGIN;

-- 1) tasks: description -> notes, preserving notes_markdown
ALTER TABLE public.tasks
RENAME COLUMN description TO notes;

UPDATE public.tasks
SET notes = concat_ws(E'\n\n', notes, notes_markdown)
WHERE notes_markdown <> '';

ALTER TABLE public.tasks
DROP COLUMN notes_markdown;

ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_description_check;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_notes_check
CHECK (length(notes) <= 50000);


-- 2) Estimated duration
ALTER TABLE public.tasks
ADD COLUMN estimated_minutes integer
CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0);


-- 3) Favorites
ALTER TABLE public.tasks
ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;


-- 4) Checklist items
CREATE TABLE public.task_checklist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  title text NOT NULL CHECK (
    length(trim(title)) > 0
    AND length(title) <= 300
  ),
  is_done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT task_checklist_items_pkey PRIMARY KEY (id),
  CONSTRAINT task_checklist_items_task_id_fkey
    FOREIGN KEY (task_id)
    REFERENCES public.tasks(id)
    ON DELETE CASCADE
);

CREATE INDEX task_checklist_items_task_id_idx
ON public.task_checklist_items(task_id);

CREATE INDEX task_checklist_items_task_position_idx
ON public.task_checklist_items(task_id, position);


-- 5) Generic task relations
CREATE TYPE public.task_relation_type AS ENUM (
  'blocks',
  'blocked_by',
  'relates_to',
  'duplicates',
  'parent_of',
  'child_of'
);

CREATE TABLE public.task_relations (
  task_id uuid NOT NULL,
  related_task_id uuid NOT NULL,
  relation_type public.task_relation_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT task_relations_pkey
    PRIMARY KEY (task_id, related_task_id, relation_type),

  CONSTRAINT task_relations_task_id_fkey
    FOREIGN KEY (task_id)
    REFERENCES public.tasks(id)
    ON DELETE CASCADE,

  CONSTRAINT task_relations_related_task_id_fkey
    FOREIGN KEY (related_task_id)
    REFERENCES public.tasks(id)
    ON DELETE CASCADE,

  CONSTRAINT task_relations_no_self_relation
    CHECK (task_id <> related_task_id)
);

CREATE INDEX task_relations_task_id_idx
ON public.task_relations(task_id);

CREATE INDEX task_relations_related_task_id_idx
ON public.task_relations(related_task_id);

CREATE INDEX task_relations_type_idx
ON public.task_relations(relation_type);


-- 6) Migrate existing dependencies into generic relations
INSERT INTO public.task_relations (
  task_id,
  related_task_id,
  relation_type,
  created_at
)
SELECT
  task_id,
  dependency_task_id,
  'blocked_by'::public.task_relation_type,
  created_at
FROM public.task_dependencies
ON CONFLICT DO NOTHING;


-- 7) Remove the old dependency table
DROP TABLE public.task_dependencies;


-- 8) Additional useful indexes
CREATE INDEX tasks_is_favorite_idx
ON public.tasks(is_favorite)
WHERE is_favorite = true;

CREATE INDEX tasks_estimated_minutes_idx
ON public.tasks(estimated_minutes)
WHERE estimated_minutes IS NOT NULL;


COMMIT;
