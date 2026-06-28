CREATE TABLE public.google_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_email text,
  scopes text[] NOT NULL DEFAULT '{}',
  encrypted_tokens jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT google_connections_pkey PRIMARY KEY (id)
);

CREATE TABLE public.google_oauth_states (
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,

  CONSTRAINT google_oauth_states_pkey PRIMARY KEY (state)
);

CREATE INDEX google_oauth_states_expires_at_idx
ON public.google_oauth_states(expires_at);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER google_connections_set_updated_at
BEFORE UPDATE ON public.google_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
