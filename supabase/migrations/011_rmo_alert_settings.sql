-- Per-RMO alert preferences (ntfy push + email). RMO-only; server reads/writes via service role.
CREATE TABLE IF NOT EXISTS public.rmo_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  ntfy_server text NOT NULL DEFAULT 'https://ntfy.sh',
  ntfy_topic text,
  ntfy_token text,
  alert_emails text,
  notify_new_report boolean NOT NULL DEFAULT true,
  notify_flagged boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rmo_alert_settings IS
  'Per-RMO outside-portal alerts (ntfy + email) for CEO report submissions. Digest on/off + hour live in compliance_settings per license.';

ALTER TABLE public.rmo_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_alert_settings_own ON public.rmo_alert_settings;
CREATE POLICY rmo_alert_settings_own ON public.rmo_alert_settings
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

REVOKE ALL ON public.rmo_alert_settings FROM anon, authenticated;
-- Explicit grants. SELECT for client roles is column-scoped so the ntfy_token secret is never readable
-- by anon/authenticated (a table-wide SELECT cannot be narrowed by a column REVOKE). RLS still limits rows.
GRANT SELECT (id, user_id, ntfy_server, ntfy_topic, alert_emails, notify_new_report, notify_flagged, created_at, updated_at) ON public.rmo_alert_settings TO anon;
GRANT SELECT (id, user_id, ntfy_server, ntfy_topic, alert_emails, notify_new_report, notify_flagged, created_at, updated_at) ON public.rmo_alert_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rmo_alert_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rmo_alert_settings TO service_role;
