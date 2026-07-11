CREATE TABLE public.scheduler_schedule_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'committed',
  source text NOT NULL DEFAULT 'advisor',
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  superseded_at timestamptz,
  CONSTRAINT scheduler_schedule_batches_status_check CHECK (status IN ('preview', 'committed', 'superseded'))
);

CREATE TABLE public.scheduler_reserved_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.scheduler_schedule_batches(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'break',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  source_rule_id uuid,
  source_constraint_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduler_reserved_blocks_time_check CHECK (end_at > start_at)
);

CREATE INDEX scheduler_schedule_batches_status_idx
ON public.scheduler_schedule_batches(status);

CREATE INDEX scheduler_reserved_blocks_batch_id_idx
ON public.scheduler_reserved_blocks(batch_id);

CREATE INDEX scheduler_reserved_blocks_time_idx
ON public.scheduler_reserved_blocks(start_at, end_at);
