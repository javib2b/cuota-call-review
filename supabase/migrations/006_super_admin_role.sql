-- Migration 006: Promote existing admin profiles to super_admin
-- Run this in the Supabase SQL editor BEFORE deploying the new code.
-- The new "admin" role is a restricted viewer (all clients, no integrations/invite).
-- "super_admin" retains all previous admin powers.

UPDATE profiles
SET role = 'super_admin'
WHERE role = 'admin';
