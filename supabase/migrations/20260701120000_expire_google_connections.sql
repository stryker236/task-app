ALTER TABLE public.google_connections
ADD COLUMN expires_at timestamptz;

UPDATE public.google_connections
SET expires_at = created_at + interval '1 hour'
WHERE expires_at IS NULL;

ALTER TABLE public.google_connections
ALTER COLUMN expires_at SET NOT NULL,
ALTER COLUMN expires_at SET DEFAULT (now() + interval '1 hour');

CREATE INDEX google_connections_expires_at_idx
ON public.google_connections(expires_at);
