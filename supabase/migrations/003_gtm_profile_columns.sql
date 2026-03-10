-- Migration 003: Add website and stage columns to client_gtm_profiles
-- Run this in the Supabase SQL editor or via: node scripts/apply-migration.mjs

ALTER TABLE client_gtm_profiles
  ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS stage   TEXT DEFAULT '';
