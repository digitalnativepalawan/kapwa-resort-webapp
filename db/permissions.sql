-- ============================================================================
-- KAPWA Hospitality OS — Neon PostgreSQL Application & Database Permissions
-- ============================================================================
-- Standard PostgreSQL session-variable helpers (`app.employee_id`, `app.is_admin`,
-- `app.permissions`) set per request by the KAPWA Node/Express backend, alongside
-- application-layer RBAC enforcement in `server/middleware/permissions.js`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_permissions()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.permissions', true), '')::jsonb,
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(NULLIF(current_setting('app.employee_id', true), ''), NULL) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    current_setting('app.is_admin', true) = 'true'
    OR public.app_permissions() ? 'admin',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(section text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    public.is_admin()
    OR public.app_permissions() ? section
    OR public.app_permissions() ? (section || ':view')
    OR public.app_permissions() ? (section || ':edit')
    OR public.app_permissions() ? (section || ':manage'),
    false
  );
$$;

-- Safe view for employees that never exposes `password_hash`
CREATE OR REPLACE VIEW public.employees_public AS
  SELECT
    id,
    name,
    display_name,
    role,
    hourly_rate,
    monthly_rate,
    rate_type,
    active,
    whatsapp_number,
    messenger_link,
    preferred_contact_method,
    created_at
  FROM public.employees;
