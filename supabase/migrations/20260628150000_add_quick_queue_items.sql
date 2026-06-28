CREATE TABLE public.quick_queue_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  text text NOT NULL CHECK (
    length(trim(text)) > 0
    AND length(text) <= 500
  ),
  is_done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT quick_queue_items_pkey PRIMARY KEY (id)
);

CREATE INDEX quick_queue_items_position_idx
ON public.quick_queue_items(position, created_at);

CREATE INDEX quick_queue_items_done_idx
ON public.quick_queue_items(is_done);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quick_queue_items_set_updated_at
BEFORE UPDATE ON public.quick_queue_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
