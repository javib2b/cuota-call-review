// ── Core entities ────────────────────────────────────────────────────────────

export type RepType = "AE" | "SDR";
export type CallType = "Discovery" | "Demo" | "Follow-up" | "Negotiation" | "Close";
export type DealStage = "Early" | "Mid" | "Late";
export type CallOutcome = "Still Active" | "Won" | "Lost" | "No Decision";
export type AssessmentType =
  | "gtm_strategy"
  | "top_of_funnel"
  | "revops"
  | "hiring"
  | "metrics";

// ── AE scoring categories (9 × /10 = /90) ───────────────────────────────────
export interface AEScores {
  pre_call_research?: CategoryScore;
  intro_opening?: CategoryScore;
  agenda?: CategoryScore;
  discovery?: CategoryScore;
  pitch?: CategoryScore;
  services_product?: CategoryScore;
  pricing?: CategoryScore;
  next_steps?: CategoryScore;
  objection_handling?: CategoryScore;
}

// ── SDR scoring categories (5 × /10 = /50) ──────────────────────────────────
export interface SDRScores {
  call_opener?: CategoryScore;
  product_pitch?: CategoryScore;
  qualification?: CategoryScore;
  call_to_action?: CategoryScore;
  objection_handling?: CategoryScore;
}

export type CallScores = AEScores & SDRScores;

export interface CategoryScore {
  score: number; // 0–10
  details: string;
}

// ── AI Insights ──────────────────────────────────────────────────────────────
export interface AIInsights {
  gut_check: string;
  strengths: Array<{ title: string; description: string }>;
  areas_of_opportunity: Array<{ description: string; fix: string }>;
  risks: Record<
    string,
    { flagged: boolean; details: string }
  >;
  metadata?: {
    rep_name?: string;
    prospect_company?: string;
    prospect_name?: string;
    call_type?: string;
    deal_stage?: string;
  };
}

// ── Call Review ──────────────────────────────────────────────────────────────
export interface CallReview {
  id: string;
  org_id: string;
  rep_id?: string;
  reviewed_by?: string;
  // Metadata
  prospect_company: string;
  call_date: string;
  call_type: CallType;
  deal_stage: DealStage;
  deal_value?: number;
  // New fields
  outcome: CallOutcome;
  close_date?: string;
  call_duration_minutes?: number;
  next_meeting_scheduled: boolean;
  next_meeting_date?: string;
  // Scores & analysis
  category_scores: CallScores & {
    rep_name?: string;
    client?: string;
    rep_type?: RepType;
    prospect_name?: string;
  };
  overall_score: number;
  ai_analysis?: AIInsights;
  coaching_notes?: string;
  transcript?: string;
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

// ── Rep ──────────────────────────────────────────────────────────────────────
export interface Rep {
  id: string;
  org_id: string;
  full_name: string;
  type?: RepType;
  client?: string;
  created_at?: string;
}

// ── Profile / Auth ────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  org_id: string;
  role: "rep" | "manager" | "admin";
  full_name?: string;
}

// ── Assessments ──────────────────────────────────────────────────────────────
export interface ClientAssessment {
  id: string;
  org_id: string;
  client_id: string;
  assessment_type: AssessmentType;
  answers: Record<string, string>;
  score?: number;
  ai_narrative?: string;
  assessed_at: string;
}

export interface AssessmentQuestion {
  key: string;
  label: string;
  placeholder?: string;
}

// ── ARR / Revenue Settings ────────────────────────────────────────────────────
export interface WorkspaceSettings {
  id?: string;
  org_id: string;
  current_arr?: number;
  arr_goal?: number;
  target_date?: string;
  avg_deal_size_override?: number;
  avg_win_rate?: number; // 0–100 percent
  avg_sales_cycle_days?: number;
  updated_at?: string;
}

// ── Gap Analysis (computed) ───────────────────────────────────────────────────
export interface GapAnalysis {
  arrGap: number;
  dealsNeeded: number;
  pipelineNeeded: number;
  monthsRemaining: number;
  dealsPerMonth: number;
  aesNeeded: number;
}

// ── Scoring helpers (re-exported) ────────────────────────────────────────────
export type ScoreStatus = "critical" | "needs_work" | "average" | "good" | "excellent";
