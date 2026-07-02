ALTER TABLE public.google_connections
ALTER COLUMN expires_at SET DEFAULT (now() + interval '1 day');

UPDATE public.google_connections
SET expires_at = created_at + interval '1 day'
WHERE expires_at > now()
  AND expires_at < created_at + interval '1 day';
