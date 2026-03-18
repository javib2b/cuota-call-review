// POST /api/generate-battlecard
// Body: { context: { companyName, productName, companyFunding, companyG2, seriesA, seriesB,
//                    compliance, crmIntegrations, channels, supportModel, targetAudience,
//                    competitorName, competitorFunding, competitorG2, competitorSeriesA,
//                    competitorSeriesB, competitorGaps, primaryColor, accentColor }, apiKey? }
// Returns: { pages: [...] }

import { authenticateUser } from "./_lib/supabase.js";

const SYSTEM_PROMPT = `You are an expert B2B competitive intelligence specialist. Generate highly specific, accurate competitive battlecard content as structured JSON. Be direct, factual, and sales-ready. Every comparison must be concrete — no vague claims. Write like a seasoned SE who knows both products cold.`;

function buildPrompt(ctx) {
  return `Create a 5-page competitive battlecard for this matchup:

OUR COMPANY: ${ctx.companyName || "Our Company"}
OUR PRODUCT: ${ctx.productName || ctx.companyName || "Our Platform"}
OUR G2 RATING: ${ctx.companyG2 || "not provided"}
OUR SERIES A: ${ctx.seriesA || "not provided"}
OUR SERIES B: ${ctx.seriesB || "not provided"}
OUR TOTAL FUNDING: ${ctx.companyFunding || "not provided"}
COMPLIANCE: ${ctx.compliance || "not provided"}
CRM INTEGRATIONS: ${ctx.crmIntegrations || "not provided"}
CHANNELS: ${ctx.channels || "not provided"}
SUPPORT MODEL: ${ctx.supportModel || "not provided"}
TARGET AUDIENCE: ${ctx.targetAudience || "enterprise B2B sales teams"}

COMPETITOR: ${ctx.competitorName || "Competitor"}
COMPETITOR G2: ${ctx.competitorG2 || "not provided"}
COMPETITOR SERIES A: ${ctx.competitorSeriesA || "not provided"}
COMPETITOR SERIES B: ${ctx.competitorSeriesB || "not provided"}
COMPETITOR FUNDING: ${ctx.competitorFunding || "not provided"}
KNOWN COMPETITOR GAPS: ${ctx.competitorGaps || "not provided"}

Return ONLY valid JSON — no markdown fences, no explanation, nothing else.

{
  "pages": [
    {
      "type": "overview",
      "companyName": "${ctx.companyName || "Our Company"}",
      "competitorName": "${ctx.competitorName || "Competitor"}",
      "comparisonRows": [
        {
          "label": "G2 Rating",
          "us": "yes",
          "usText": "${ctx.companyG2 || "4.8/5.0"}",
          "them": "partial",
          "themText": "${ctx.competitorG2 || "4.2/5.0"}"
        },
        {
          "label": "Total Funding",
          "us": "yes",
          "usText": "${ctx.companyFunding || "Well-funded"}",
          "them": "partial",
          "themText": "${ctx.competitorFunding || "Unknown"}"
        },
        {
          "label": "Enterprise Compliance",
          "us": "yes",
          "usText": "Brief description of our compliance posture",
          "them": "partial",
          "themText": "Brief description of their compliance gaps"
        },
        {
          "label": "Support Model",
          "us": "yes",
          "usText": "Brief description of our support model",
          "them": "no",
          "themText": "Brief description of competitor's weaker support"
        }
      ],
      "partnershipStatement": "2-3 sentences about your company's commitment as a long-term strategic partner focused on the customer's ROI and success — not just software delivery.",
      "quotes": [
        {
          "text": "A real, specific customer quote about switching from or evaluating the competitor and choosing us instead. Make it conversational.",
          "name": "First Last",
          "title": "VP of Sales",
          "company": "Company Name"
        },
        {
          "text": "A second specific customer quote about the value they get from our platform, tied to a concrete outcome or pain point solved.",
          "name": "First Last",
          "title": "Director of Revenue Operations",
          "company": "Company Name"
        }
      ]
    },
    {
      "type": "features1",
      "companyName": "${ctx.companyName || "Our Company"}",
      "competitorName": "${ctx.competitorName || "Competitor"}",
      "sections": [
        {
          "label": "DATA & LEAD GENERATION",
          "rows": [
            {
              "capability": "Data Coverage",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our data coverage advantage",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on competitor's limitation"
            },
            {
              "capability": "Data Accuracy",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our accuracy/verification approach",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on their accuracy challenges"
            },
            {
              "capability": "Contact Enrichment",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our enrichment capabilities",
              "themIcon": "no",
              "themDesc": "1-2 sentences on what they lack"
            },
            {
              "capability": "Intent Signals",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our intent data approach",
              "themIcon": "no",
              "themDesc": "1-2 sentences on their gap here"
            }
          ]
        },
        {
          "label": "RESEARCH",
          "rows": [
            {
              "capability": "Account Research",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our account research features",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on their limitation"
            },
            {
              "capability": "Persona Mapping",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our persona mapping capability",
              "themIcon": "no",
              "themDesc": "1-2 sentences on their gap"
            },
            {
              "capability": "News & Triggers",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our trigger/news monitoring",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on their approach"
            },
            {
              "capability": "Tech Stack Detection",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our tech stack data",
              "themIcon": "no",
              "themDesc": "1-2 sentences on what they lack"
            }
          ]
        },
        {
          "label": "OUTREACH & WORKFLOWS",
          "rows": [
            {
              "capability": "Sequence Automation",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our outreach automation",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on competitor limitation"
            },
            {
              "capability": "AI Personalization",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our AI-driven personalization",
              "themIcon": "no",
              "themDesc": "1-2 sentences on their gap"
            },
            {
              "capability": "Multi-Channel",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on channels we support",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on competitor's channel limitations"
            },
            {
              "capability": "CRM Sync",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our CRM integration depth",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on their CRM sync limitations"
            },
            {
              "capability": "Analytics & Reporting",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our reporting capabilities",
              "themIcon": "no",
              "themDesc": "1-2 sentences on their reporting gap"
            }
          ]
        }
      ]
    },
    {
      "type": "features2",
      "companyName": "${ctx.companyName || "Our Company"}",
      "competitorName": "${ctx.competitorName || "Competitor"}",
      "sections": [
        {
          "label": "ENTERPRISE READINESS & INTEGRATIONS",
          "rows": [
            {
              "capability": "Security & Compliance",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our security certifications and compliance",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on their compliance posture"
            },
            {
              "capability": "SSO / SCIM",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our SSO and provisioning",
              "themIcon": "partial",
              "themDesc": "1-2 sentences on their SSO limitations"
            },
            {
              "capability": "API Access",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our API and developer ecosystem",
              "themIcon": "no",
              "themDesc": "1-2 sentences on their API gaps"
            },
            {
              "capability": "Dedicated Success",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our enterprise success model",
              "themIcon": "no",
              "themDesc": "1-2 sentences on competitor support model gap"
            }
          ]
        },
        {
          "label": "ADDITIONAL FEATURES",
          "rows": [
            {
              "capability": "Mobile App",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our mobile capabilities",
              "themIcon": "no",
              "themDesc": "1-2 sentences on their mobile gap"
            },
            {
              "capability": "Conversation Intel",
              "usIcon": "yes",
              "usDesc": "1-2 sentences on our conversation intelligence features",
              "themIcon": "no",
              "themDesc": "1-2 sentences on what competitor lacks here"
            }
          ]
        }
      ],
      "enterpriseSummary": "2-3 sentences summarizing our clear enterprise advantage: security posture, integration depth, dedicated support model, and proven ability to scale with complex org structures — all areas where competitor falls short."
    },
    {
      "type": "quotes",
      "competitorName": "${ctx.competitorName || "Competitor"}",
      "quotes": [
        {
          "text": "A specific, real-sounding negative quote about the competitor from a customer review. Should reference a concrete pain (e.g. data quality, support, pricing, bugs). Make it believable.",
          "name": "Reviewer Name",
          "title": "Sales Manager",
          "source": "G2",
          "note": "We solve this with [specific feature or approach] — our customers report [specific positive outcome]."
        },
        {
          "text": "A second specific negative review quote about the competitor. Different pain area — e.g. implementation difficulty, UI, or missing feature.",
          "name": "Reviewer Name",
          "title": "Account Executive",
          "source": "G2",
          "note": "We solve this with [specific feature] — reps are live in [timeframe] with [support model]."
        },
        {
          "text": "A third negative review quote, focused on pricing or value/ROI concerns with the competitor.",
          "name": "Reviewer Name",
          "title": "RevOps Manager",
          "source": "Gartner",
          "note": "Our pricing model is transparent and ROI-linked — customers see [specific outcome] within [timeframe]."
        },
        {
          "text": "A fourth negative review quote, focused on a feature gap or product limitation that frustrated the reviewer.",
          "name": "Reviewer Name",
          "title": "SDR Team Lead",
          "source": "G2",
          "note": "We built [specific capability] specifically for this — it's one of our most-used features by teams like theirs."
        }
      ]
    },
    {
      "type": "objections",
      "objections": [
        {
          "objection": "We already use ${ctx.competitorName || "Competitor"} — switching is risky.",
          "rebuttal": "Specific, confident rebuttal addressing the switching risk. Reference your migration support, implementation team, and a comparable company that made the switch successfully.",
          "proof": "Customer X migrated in Y weeks with zero data loss — their team was fully ramped by week 3."
        },
        {
          "objection": "${ctx.competitorName || "Competitor"} is cheaper.",
          "rebuttal": "Specific rebuttal addressing TCO: hidden costs of poor data quality, manual workarounds, and lack of enterprise support add up fast. Show the true ROI difference.",
          "proof": "Teams that switch see X% more meetings booked within 90 days — the math makes itself."
        },
        {
          "objection": "We don't want to rip and replace our whole stack.",
          "rebuttal": "Specific rebuttal: you don't have to. We layer in alongside existing tools, integrate with your CRM on day 1, and prove value in a pilot before any broad rollout.",
          "proof": "Our average pilot takes 2 weeks to stand up — no IT resources required."
        },
        {
          "objection": "${ctx.competitorName || "Competitor"} has more name recognition.",
          "rebuttal": "Specific rebuttal about market traction, customer outcomes, and why newer doesn't mean smaller — reference funding, team depth, and customer logos in their industry.",
          "proof": "We serve [X] enterprise customers including [relevant logo] — and our G2 score is higher."
        },
        {
          "objection": "We need ${ctx.competitorName || "Competitor"}'s [specific feature].",
          "rebuttal": "Specific rebuttal addressing the feature gap head-on: either we have it (and it's better), or we have a superior alternative, or it's on the roadmap with a specific timeline.",
          "proof": "Show the equivalent in our platform — or name the customer using our approach instead."
        },
        {
          "objection": "Our leadership prefers the status quo.",
          "rebuttal": "Specific rebuttal: the status quo has a cost. Quantify the revenue impact of staying on a platform with data quality issues and limited AI capabilities.",
          "proof": "Teams on outdated tooling book 30% fewer meetings — that's pipeline they're leaving on the table."
        }
      ],
      "winThemes": [
        {
          "title": "Superior Data Quality",
          "description": "1 sentence on why our data beats theirs in accuracy, freshness, and coverage."
        },
        {
          "title": "AI-Native Platform",
          "description": "1 sentence on our AI-first architecture vs their bolt-on approach."
        },
        {
          "title": "Enterprise-Ready",
          "description": "1 sentence on our security, compliance, and support model built for complex orgs."
        }
      ]
    }
  ]
}

CRITICAL RULES:
- Use "yes", "partial", or "no" (lowercase) for all icon fields
- Every description must be 1-2 sentences max — be concise and punchy
- Competitor gaps should be factual and defensible, not hyperbolic
- All quotes must sound like real humans wrote them, not marketing copy
- Objection rebuttals must be specific and confident — no hedging
- Replace ALL placeholder text with real, specific content based on the context provided`;
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

    const { context, apiKey: userKey } = req.body || {};
    if (!context) return res.status(400).json({ error: "Missing context" });

    const anthropicKey = process.env.ANTHROPIC_API_KEY || userKey;
    if (!anthropicKey) return res.status(400).json({ error: "No API key configured." });

    const prompt = buildPrompt(context);

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 6000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(claudeRes.status === 401 ? 401 : 502).json({ error: e.error?.message || `Claude API error (${claudeRes.status})` });
    }

    const data = await claudeRes.json();
    const text = data.content?.map((c) => c.text || "").join("") || "";

    const jsonMatch = text.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) throw new Error("Invalid battlecard structure returned");

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("generate-battlecard error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
