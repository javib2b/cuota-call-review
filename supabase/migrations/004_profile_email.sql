-- Add email column to profiles for Gravatar lookup
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
