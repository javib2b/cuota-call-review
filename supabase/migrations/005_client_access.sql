-- Migration 005: Multi-tenant client access
-- Allows client users to log in and see only their own company's call reviews.
--
-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/vflmrqtpdrhnyvokquyu/sql

-- 1. Add client_company to profiles and invitations
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS client_company TEXT;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS client_company TEXT;

-- 2. Helper: get current user's role (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION get_user_role()
  RETURNS TEXT
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
  $$;

-- 3. Helper: get current user's client_company
CREATE OR REPLACE FUNCTION get_user_client_company()
  RETURNS TEXT
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  AS $$
    SELECT client_company FROM profiles WHERE id = auth.uid();
  $$;

-- 4. Drop ALL existing call_reviews RLS policies and recreate
--    (handles unknown policy names from prior migrations)
DO $$
DECLARE pol_name TEXT;
BEGIN
  FOR pol_name IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'call_reviews' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON call_reviews', pol_name);
  END LOOP;
END;
$$;

-- SELECT: org members see all calls; client-role users see only their company's
CREATE POLICY "call_reviews_select" ON call_reviews
  FOR SELECT
  USING (
    org_id = get_user_org_id() AND (
      get_user_role() != 'client' OR
      lower(coalesce(category_scores->>'client', '')) = lower(coalesce(get_user_client_company(), ''))
    )
  );

-- INSERT: only non-client org members may insert
CREATE POLICY "call_reviews_insert" ON call_reviews
  FOR INSERT
  WITH CHECK (org_id = get_user_org_id() AND get_user_role() != 'client');

-- UPDATE: only non-client org members may update
CREATE POLICY "call_reviews_update" ON call_reviews
  FOR UPDATE
  USING (org_id = get_user_org_id() AND get_user_role() != 'client');

-- DELETE: only non-client org members may delete
CREATE POLICY "call_reviews_delete" ON call_reviews
  FOR DELETE
  USING (org_id = get_user_org_id() AND get_user_role() != 'client');
