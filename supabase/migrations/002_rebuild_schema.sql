-- ── Migration 002: Add outcome tracking + workspace settings + client assessments ──

-- Add new columns to call_reviews
ALTER TABLE call_reviews
  ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT 'Still Active'
    CHECK (outcome IN ('Still Active', 'Won', 'Lost', 'No Decision')),
  ADD COLUMN IF NOT EXISTS close_date DATE,
  ADD COLUMN IF NOT EXISTS call_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS next_meeting_scheduled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_meeting_date DATE;

-- Workspace revenue settings
CREATE TABLE IF NOT EXISTS workspace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  current_arr NUMERIC,
  arr_goal NUMERIC,
  target_date DATE,
  avg_deal_size_override NUMERIC,
  avg_win_rate NUMERIC,
  avg_sales_cycle_days INTEGER,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id)
);

-- Per-client assessments
CREATE TABLE IF NOT EXISTS client_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  assessment_type TEXT NOT NULL
    CHECK (assessment_type IN ('gtm_strategy', 'top_of_funnel', 'revops', 'hiring', 'metrics')),
  answers JSONB,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  ai_narrative TEXT,
  assessed_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies for workspace_settings
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read workspace_settings"
  ON workspace_settings FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "org members can insert workspace_settings"
  ON workspace_settings FOR INSERT
  WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "org members can update workspace_settings"
  ON workspace_settings FOR UPDATE
  USING (org_id = get_user_org_id());

-- RLS policies for client_assessments
ALTER TABLE client_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read client_assessments"
  ON client_assessments FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "org members can insert client_assessments"
  ON client_assessments FOR INSERT
  WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "org members can update client_assessments"
  ON client_assessments FOR UPDATE
  USING (org_id = get_user_org_id());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_settings_org ON workspace_settings (org_id);
CREATE INDEX IF NOT EXISTS idx_client_assessments_org_client ON client_assessments (org_id, client_id);
CREATE INDEX IF NOT EXISTS idx_client_assessments_type ON client_assessments (assessment_type);
CREATE INDEX IF NOT EXISTS idx_call_reviews_outcome ON call_reviews (outcome);
