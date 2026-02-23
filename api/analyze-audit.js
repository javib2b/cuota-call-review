// POST /api/analyze-audit — consolidated audit analysis endpoint
// Body: { type, client, data }
// type: "gtm_strategy" | "tof" | "hiring" | "metrics"
import { authenticateUser } from "./lib/supabase.js";

const PROMPTS = {
  gtm_strategy: `You are an expert B2B GTM strategist. Evaluate the following GTM strategy inputs for {CLIENT} and score each dimension of their go-to-market strategy.

SCORING SCALE:
- Needs Improvement: 0-39 (critical gaps, no clear strategy)
- Below Average: 40-49 (exists but weak, inconsistent)
- Average: 50-64 (functional but generic, lacks depth)
- Great: 65-79 (solid, clear, mostly well-executed)
- Excellent: 80-100 (best-in-class, precise, differentiated)

EVALUATE THESE 6 DIMENSIONS (score each 0-100):
1. GTM Hypothesis: Is there a crisp "who, why now, how, where" defined? Is targeting specific or still broad?
2. Ideal Customer Profile: How precise and operationalized is the ICP? Does it include company type, headcount, industry, revenue band?
3. Buyer Persona: How well-defined are the buyer personas? Do they include roles, KPIs, decision criteria, buying signals?
4. Customer Acquisition Channels: Is there a clear multi-channel strategy? Are channels prioritized and owned?
5. Channel Targeting: Is there a specific playbook per channel (LinkedIn, email, phone, emerging)?
6. Competitive Analysis & Positioning: Is competitive differentiation clear and trained? Can the team articulate it?

GTM STRATEGY INPUTS:
{DATA}

Respond ONLY with valid JSON:
{
  "overall_score": <integer 0-100, weighted average>,
  "summary": "<3-4 sentence direct assessment of GTM strategy maturity>",
  "sub_scores": [
    {"category": "GTM Hypothesis", "score": <0-100>, "status": "<needs_improvement|below_average|average|great|excellent>", "note": "<1 sentence>"},
    {"category": "Ideal Customer Profile", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Buyer Persona", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Customer Acquisition Channels", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Channel Targeting", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Competitive Analysis", "score": <0-100>, "status": "...", "note": "..."}
  ],
  "strengths": [
    {"title": "<strength>", "description": "<1-2 sentences>"},
    {"title": "<strength>", "description": "<1-2 sentences>"}
  ],
  "gaps": [
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"}
  ],
  "recommendations": [
    {"title": "<action>", "description": "<specific recommendation with rationale>"},
    {"title": "<action>", "description": "<specific recommendation with rationale>"}
  ]
}`,

  tof: `You are an expert B2B demand generation analyst. Evaluate the following top-of-funnel metrics and strategy for {CLIENT}.

SCORING SCALE:
- Needs Improvement: 0-39 (critical gaps)
- Below Average: 40-49 (exists but weak)
- Average: 50-64 (functional but not optimized)
- Great: 65-79 (strong, well-executed)
- Excellent: 80-100 (best-in-class)

EVALUATE THESE 6 DIMENSIONS (score each 0-100):
1. Target Audience & Segmentation: How specific is targeting? Is there a crisp ICP applied to campaigns with clear messaging per segment?
2. Lead Generation Channels & Tactics: Is there a diversified, owned channel strategy? Are outbound and inbound both functioning well?
3. Brand Building: Is there consistent thought leadership, message consistency, and social proof being built?
4. Website & Landing Page Optimization: Does the website convert well, communicate clearly, and attract the right traffic?
5. Content Strategy & Assets: Is content being published regularly, distributed across channels, and enabling the sales team?
6. Outbound Email & Conversion Rates: Are outbound sequences performing at benchmark? Is there testing and personalization?

TOP OF FUNNEL DATA:
{DATA}

INDUSTRY BENCHMARKS (B2B SaaS):
- Outbound email open rate: 30-50% is good; below 20% is poor
- Outbound reply rate: 3-8% is good; below 1% is poor
- Meeting conversion (outbound): 1-3% of touches; below 0.5% is poor
- Inbound lead quality: High volume ≠ high quality; qualification rate matters

Respond ONLY with valid JSON:
{
  "overall_score": <integer 0-100>,
  "summary": "<3-4 sentence direct assessment>",
  "sub_scores": [
    {"category": "Target Audience & Segmentation", "score": <0-100>, "status": "<needs_improvement|below_average|average|great|excellent>", "note": "<1 sentence>"},
    {"category": "Lead Generation Channels", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Brand Building", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Website Optimization", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Content Strategy", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Outbound Email Performance", "score": <0-100>, "status": "...", "note": "..."}
  ],
  "strengths": [
    {"title": "<strength>", "description": "<1-2 sentences>"},
    {"title": "<strength>", "description": "<1-2 sentences>"}
  ],
  "gaps": [
    {"title": "<gap>", "description": "<what's missing and why it matters>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"}
  ],
  "recommendations": [
    {"title": "<action>", "description": "<specific recommendation>"},
    {"title": "<action>", "description": "<specific recommendation>"}
  ]
}`,

  hiring: `You are an expert B2B sales talent and hiring consultant. Evaluate the following sales hiring practices for {CLIENT}.

SCORING SCALE:
- Needs Improvement: 0-39 (no structure, reactive hiring)
- Below Average: 40-49 (some process but inconsistent)
- Average: 50-64 (structured but not optimized)
- Great: 65-79 (well-designed, mostly consistent)
- Excellent: 80-100 (best-in-class, data-driven, repeatable)

EVALUATE THESE 6 DIMENSIONS (score each 0-100):
1. SDR & AE Profiling: Are ideal candidate profiles defined with specific competencies, skills, and disqualifiers?
2. Interview Process: Is there a structured multi-stage process with clear evaluation criteria at each stage?
3. Interview Conversions: Are conversion rates tracked at each stage? Is the funnel optimized?
4. Interview Panel: Is there a diverse, consistent panel? Are evaluators calibrated on what good looks like?
5. Mock Pitches: Is a mock pitch or role-play part of the process? Are evaluation rubrics defined?
6. Manager 30/60/90: Is there a structured onboarding plan for new managers? Does it include defined milestones and accountability checkpoints?

HIRING DATA:
{DATA}

Respond ONLY with valid JSON:
{
  "overall_score": <integer 0-100>,
  "summary": "<3-4 sentence direct assessment of hiring program maturity>",
  "sub_scores": [
    {"category": "SDR & AE Profiling", "score": <0-100>, "status": "<needs_improvement|below_average|average|great|excellent>", "note": "<1 sentence>"},
    {"category": "Interview Process", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Interview Conversions", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Interview Panel", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Mock Pitches", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Manager 30/60/90", "score": <0-100>, "status": "...", "note": "..."}
  ],
  "strengths": [
    {"title": "<strength>", "description": "<1-2 sentences>"},
    {"title": "<strength>", "description": "<1-2 sentences>"}
  ],
  "gaps": [
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's missing>", "fix": "<specific action>"}
  ],
  "recommendations": [
    {"title": "<action>", "description": "<specific recommendation>"},
    {"title": "<action>", "description": "<specific recommendation>"}
  ]
}`,

  full_assessment: `You are a McKinsey senior GTM consultant conducting a comprehensive Go-To-Market assessment for {CLIENT}. You have been provided with the following company documents:

{DATA}

Analyze ONLY what is evidenced in these documents. Score lower where evidence is absent — do not assume. Be direct, specific, and quantitative.

SCORING SCALE (0-100):
- Needs Improvement: 0-39 (critical gaps, minimal evidence)
- Below Average: 40-49 (exists but weak or inconsistent)
- Average: 50-64 (functional but generic, lacks depth)
- Great: 65-79 (solid, clear, mostly well-executed)
- Excellent: 80-100 (best-in-class, precise, differentiated)

ASSESS THESE 7 DIMENSIONS:
1. gtm_strategy — GTM hypothesis clarity, ICP precision, value proposition, competitive differentiation, channel strategy
2. tof — Top-of-funnel motion, demand gen strategy, outbound/inbound performance, brand building
3. sales_readiness — Call methodology, discovery process, objection handling, deal qualification rigor
4. enablement — Sales materials quality, playbooks, battle cards, training content, onboarding
5. revops — CRM process, pipeline visibility, metrics tracking, forecast rigor, process adherence
6. hiring — Talent strategy, candidate profiling, interview process, onboarding structure
7. metrics — Performance vs industry benchmarks, quota attainment, pipeline coverage, revenue efficiency

Respond ONLY with valid JSON (no markdown, no preamble, no text after closing brace):
{
  "overall_score": <integer 0-100, weighted average of 7 dimensions>,
  "executive_summary": {
    "headline": "<1 bold sentence capturing the single most important insight>",
    "narrative": "<3-4 sentence executive narrative — direct, specific, what they do well and where the biggest leverage is>",
    "top_findings": [
      {"type": "critical", "title": "<finding title>", "description": "<1-2 sentences specific to their documents>"},
      {"type": "warning", "title": "<finding title>", "description": "<1-2 sentences>"},
      {"type": "strength", "title": "<finding title>", "description": "<1-2 sentences>"}
    ]
  },
  "dimensions": [
    {
      "id": "gtm_strategy",
      "label": "GTM Strategy",
      "score": <0-100>,
      "status": "<needs_improvement|below_average|average|great|excellent>",
      "summary": "<2-3 sentences based on what's in the docs>",
      "evidence": "<specific reference from documents that informed this score>",
      "sub_scores": [
        {"category": "<subcategory name>", "score": <0-100>, "note": "<1 sentence>"},
        {"category": "<subcategory name>", "score": <0-100>, "note": "<1 sentence>"}
      ],
      "key_gaps": [
        {"title": "<gap>", "fix": "<specific action>"},
        {"title": "<gap>", "fix": "<specific action>"}
      ]
    },
    {
      "id": "tof",
      "label": "Top of Funnel",
      "score": <0-100>,
      "status": "<needs_improvement|below_average|average|great|excellent>",
      "summary": "<2-3 sentences>",
      "evidence": "<specific reference>",
      "sub_scores": [{"category": "<name>", "score": <0-100>, "note": "<1 sentence>"}],
      "key_gaps": [{"title": "<gap>", "fix": "<action>"}]
    },
    {
      "id": "sales_readiness",
      "label": "Sales Readiness",
      "score": <0-100>,
      "status": "<needs_improvement|below_average|average|great|excellent>",
      "summary": "<2-3 sentences>",
      "evidence": "<specific reference>",
      "sub_scores": [{"category": "<name>", "score": <0-100>, "note": "<1 sentence>"}],
      "key_gaps": [{"title": "<gap>", "fix": "<action>"}]
    },
    {
      "id": "enablement",
      "label": "Sales Enablement",
      "score": <0-100>,
      "status": "<needs_improvement|below_average|average|great|excellent>",
      "summary": "<2-3 sentences>",
      "evidence": "<specific reference>",
      "sub_scores": [{"category": "<name>", "score": <0-100>, "note": "<1 sentence>"}],
      "key_gaps": [{"title": "<gap>", "fix": "<action>"}]
    },
    {
      "id": "revops",
      "label": "RevOps",
      "score": <0-100>,
      "status": "<needs_improvement|below_average|average|great|excellent>",
      "summary": "<2-3 sentences>",
      "evidence": "<specific reference>",
      "sub_scores": [{"category": "<name>", "score": <0-100>, "note": "<1 sentence>"}],
      "key_gaps": [{"title": "<gap>", "fix": "<action>"}]
    },
    {
      "id": "hiring",
      "label": "Hiring",
      "score": <0-100>,
      "status": "<needs_improvement|below_average|average|great|excellent>",
      "summary": "<2-3 sentences>",
      "evidence": "<specific reference>",
      "sub_scores": [{"category": "<name>", "score": <0-100>, "note": "<1 sentence>"}],
      "key_gaps": [{"title": "<gap>", "fix": "<action>"}]
    },
    {
      "id": "metrics",
      "label": "Metrics & Benchmarks",
      "score": <0-100>,
      "status": "<needs_improvement|below_average|average|great|excellent>",
      "summary": "<2-3 sentences>",
      "evidence": "<specific reference>",
      "sub_scores": [{"category": "<name>", "score": <0-100>, "note": "<1 sentence>"}],
      "key_gaps": [{"title": "<gap>", "fix": "<action>"}]
    }
  ],
  "priority_gaps": [
    {
      "rank": 1,
      "title": "<issue title>",
      "dimension": "<gtm_strategy|tof|sales_readiness|enablement|revops|hiring|metrics>",
      "severity": "critical",
      "business_impact": "<1-2 sentences on revenue/growth impact>",
      "root_cause": "<1 sentence>",
      "fix": "<specific actionable recommendation>"
    },
    {"rank": 2, "title": "<title>", "dimension": "<id>", "severity": "critical|high|medium", "business_impact": "<text>", "root_cause": "<text>", "fix": "<text>"},
    {"rank": 3, "title": "<title>", "dimension": "<id>", "severity": "high|medium", "business_impact": "<text>", "root_cause": "<text>", "fix": "<text>"},
    {"rank": 4, "title": "<title>", "dimension": "<id>", "severity": "high|medium", "business_impact": "<text>", "root_cause": "<text>", "fix": "<text>"},
    {"rank": 5, "title": "<title>", "dimension": "<id>", "severity": "medium", "business_impact": "<text>", "root_cause": "<text>", "fix": "<text>"}
  ],
  "scope_of_work": {
    "wave1": {
      "label": "Quick Wins",
      "timeline": "0-30 days",
      "initiatives": [
        {
          "title": "<initiative title>",
          "description": "<what to do and why>",
          "owner": "<CRO|VP Sales|RevOps|Marketing|HR|CEO>",
          "effort": "<Low|Medium|High>",
          "impact": "<Low|Medium|High>",
          "success_metric": "<how to measure success>"
        }
      ]
    },
    "wave2": {
      "label": "Strategic Initiatives",
      "timeline": "30-90 days",
      "initiatives": [
        {"title": "<title>", "description": "<text>", "owner": "<owner>", "effort": "<L/M/H>", "impact": "<L/M/H>", "success_metric": "<metric>"}
      ]
    },
    "wave3": {
      "label": "Transformation",
      "timeline": "90-180 days",
      "initiatives": [
        {"title": "<title>", "description": "<text>", "owner": "<owner>", "effort": "<L/M/H>", "impact": "<L/M/H>", "success_metric": "<metric>"}
      ]
    }
  }
}`,

  metrics: `You are an expert B2B SaaS revenue operations analyst. Benchmark the following sales metrics for {CLIENT} against industry standards and evaluate performance across 5 dimensions.

SCORING SCALE:
- Needs Improvement: 0-39 (significantly below benchmark)
- Below Average: 40-49 (somewhat below benchmark)
- Average: 50-64 (at benchmark)
- Great: 65-79 (above benchmark)
- Excellent: 80-100 (top quartile performance)

B2B SAAS INDUSTRY BENCHMARKS:
- Quota Attainment: Top quartile = 70%+ of reps at quota; average = 50-60%
- Pipeline Coverage: Healthy = 3-4x quota; < 2.5x is risky
- Win Rate: Top = 25-35%; average = 15-25%; poor = < 15%
- Sales Cycle: Depends on ACV but SMB <30d, mid-market 30-90d, enterprise 90-180d
- SDR Meetings/Month: Top = 15-20+; average = 8-12; poor = <6
- AE Ramp Time: Top = 3-4 months; average = 4-6 months; poor = >6 months
- Manager:Rep Ratio: Ideal = 1:6-8; too wide = 1:10+
- CAC: Benchmark varies by segment; LTV:CAC > 3x is healthy

EVALUATE THESE 5 DIMENSIONS (score each 0-100):
1. Outbound Benchmarks: How does outbound performance (reply rates, meetings booked) compare to industry benchmarks?
2. SDR Benchmarks: How do SDR productivity metrics (meetings/month, pipeline contribution) compare?
3. AE Benchmarks: How do AE performance metrics (quota attainment, win rate, cycle time) compare?
4. Management Benchmarks: How does pipeline coverage, forecast accuracy, and manager leverage compare?
5. Revenue Benchmarks: How do revenue efficiency metrics (CAC, LTV, ARR growth) compare?

METRICS DATA FOR {CLIENT}:
{DATA}

Respond ONLY with valid JSON:
{
  "overall_score": <integer 0-100>,
  "summary": "<3-4 sentence benchmarking assessment — be direct and quantitative>",
  "sub_scores": [
    {"category": "Outbound Benchmarks", "score": <0-100>, "status": "<needs_improvement|below_average|average|great|excellent>", "note": "<1 sentence with specific comparison to benchmark>"},
    {"category": "SDR Benchmarks", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "AE Benchmarks", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Management Benchmarks", "score": <0-100>, "status": "...", "note": "..."},
    {"category": "Revenue Benchmarks", "score": <0-100>, "status": "...", "note": "..."}
  ],
  "key_metrics": [
    {"label": "<metric>", "value": "<formatted value>", "benchmark": "<industry benchmark>", "status": "<good|warning|bad|neutral>"},
    ... up to 6 most important metrics
  ],
  "strengths": [
    {"title": "<strength>", "description": "<1-2 sentences>"}
  ],
  "gaps": [
    {"title": "<gap>", "description": "<what's below benchmark>", "fix": "<specific action>"},
    {"title": "<gap>", "description": "<what's below benchmark>", "fix": "<specific action>"}
  ],
  "recommendations": [
    {"title": "<action>", "description": "<specific recommendation tied to the data>"},
    {"title": "<action>", "description": "<specific recommendation>"}
  ]
}`,
};

function buildDataLines(type, data) {
  const fmt = (n) => Number(n).toLocaleString();
  const lines = [];

  if (type === "gtm_strategy") {
    if (data.icp?.trim()) lines.push(`ICP Definition: ${data.icp}`);
    if (data.personas?.trim()) lines.push(`Buyer Personas: ${data.personas}`);
    if (data.valueProposition?.trim()) lines.push(`Value Proposition: ${data.valueProposition}`);
    if (data.channels?.trim()) lines.push(`Acquisition Channels: ${data.channels}`);
    if (data.competitive?.trim()) lines.push(`Competitive Positioning: ${data.competitive}`);
    if (data.notes?.trim()) lines.push(`Additional Context: ${data.notes}`);
    return lines.join("\n\n");
  }

  if (type === "tof") {
    if (data.inboundVolume) lines.push(`Inbound Leads/Month: ${fmt(data.inboundVolume)}`);
    if (data.outboundVolume) lines.push(`Outbound Sequences Active/Month: ${fmt(data.outboundVolume)}`);
    if (data.inboundConvRate) lines.push(`Inbound → Meeting Conversion Rate: ${data.inboundConvRate}%`);
    if (data.outboundReplyRate) lines.push(`Outbound Email Reply Rate: ${data.outboundReplyRate}%`);
    if (data.emailOpenRate) lines.push(`Email Open Rate: ${data.emailOpenRate}%`);
    if (data.contentCadence?.trim()) lines.push(`Content Strategy / Cadence: ${data.contentCadence}`);
    if (data.brandDescription?.trim()) lines.push(`Brand Building Efforts: ${data.brandDescription}`);
    if (data.websiteNotes?.trim()) lines.push(`Website / Landing Pages: ${data.websiteNotes}`);
    if (data.notes?.trim()) lines.push(`Additional Context: ${data.notes}`);
    return lines.join("\n");
  }

  if (type === "hiring") {
    if (data.profileCriteria?.trim()) lines.push(`Candidate Profile Criteria: ${data.profileCriteria}`);
    if (data.interviewProcess?.trim()) lines.push(`Interview Process Description: ${data.interviewProcess}`);
    if (data.hasScorecard !== undefined) lines.push(`Standardized Interview Scorecard: ${data.hasScorecard ? "Yes" : "No"}`);
    if (data.hasMockPitch !== undefined) lines.push(`Mock Pitch in Interview Process: ${data.hasMockPitch ? "Yes" : "No"}`);
    if (data.hasManagerPlan !== undefined) lines.push(`Manager 30/60/90 Plan Exists: ${data.hasManagerPlan ? "Yes" : "No"}`);
    if (data.timeToHire) lines.push(`Average Time to Hire: ${data.timeToHire} days`);
    if (data.offerAcceptRate) lines.push(`Offer Acceptance Rate: ${data.offerAcceptRate}%`);
    if (data.rampTime) lines.push(`Average AE Ramp Time: ${data.rampTime} months`);
    if (data.notes?.trim()) lines.push(`Additional Context: ${data.notes}`);
    return lines.join("\n");
  }

  if (type === "metrics") {
    if (data.quotaAttainment) lines.push(`% of Reps at Quota: ${data.quotaAttainment}%`);
    if (data.pipelineCoverage) lines.push(`Pipeline Coverage Ratio: ${data.pipelineCoverage}x`);
    if (data.winRate) lines.push(`Win Rate: ${data.winRate}%`);
    if (data.avgDealSize) lines.push(`Average Deal Size: $${fmt(data.avgDealSize)}`);
    if (data.saleCycleDays) lines.push(`Average Sales Cycle: ${data.saleCycleDays} days`);
    if (data.sdrMeetings) lines.push(`SDR Meetings Booked/Month (per SDR): ${data.sdrMeetings}`);
    if (data.outboundReplyRate) lines.push(`Outbound Email Reply Rate: ${data.outboundReplyRate}%`);
    if (data.aeRampMonths) lines.push(`AE Average Ramp Time: ${data.aeRampMonths} months`);
    if (data.managerRatio) lines.push(`Manager:Rep Ratio: 1:${data.managerRatio}`);
    if (data.cac) lines.push(`Customer Acquisition Cost (CAC): $${fmt(data.cac)}`);
    if (data.ltv) lines.push(`Lifetime Value (LTV): $${fmt(data.ltv)}`);
    if (data.notes?.trim()) lines.push(`Additional Context: ${data.notes}`);
    return lines.join("\n");
  }

  return "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const auth = await authenticateUser(token);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { type, client, data = {}, documents = [] } = req.body || {};
    if (!type || !PROMPTS[type]) return res.status(400).json({ error: "Invalid or missing type. Must be: gtm_strategy, tof, hiring, metrics, full_assessment" });
    if (!client) return res.status(400).json({ error: "Client name is required" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured." });

    let dataStr;
    let truncated = false;
    if (type === "full_assessment") {
      if (!Array.isArray(documents) || documents.length === 0) return res.status(400).json({ error: "At least one document is required for full_assessment." });
      const MAX_CHARS = 60000;
      let combined = documents.map((d) => `=== DOCUMENT: ${d.filename} (${d.docType}) ===\n${d.content || ""}`).join("\n\n");
      if (combined.length > MAX_CHARS) {
        combined = combined.slice(0, MAX_CHARS) + "\n\n[NOTE: Document content truncated at 60,000 characters due to length]";
        truncated = true;
      }
      dataStr = combined;
    } else {
      dataStr = buildDataLines(type, data);
      if (!dataStr) return res.status(400).json({ error: "No data provided." });
    }

    const prompt = PROMPTS[type].replace(/{CLIENT}/g, client).replace("{DATA}", dataStr);
    const maxTokens = type === "full_assessment" ? 4096 : 2048;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(claudeRes.status === 401 ? 401 : 502).json({ error: e.error?.message || `Claude API error (${claudeRes.status})` });
    }

    const result = await claudeRes.json();
    const text = result.content.map((c) => c.text || "").join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (truncated) parsed._truncated = true;
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Analyze-audit error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
