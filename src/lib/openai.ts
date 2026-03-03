import type { AIInsights } from "../types";

const API_ENDPOINT = "/api/analyze";

export async function analyzeTranscript(
  transcript: string,
  repType: "AE" | "SDR" = "AE",
  token: string,
  apiKey?: string
): Promise<AIInsights> {
  const res = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ transcript, repType, apiKey: apiKey || undefined }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || "Analysis failed");
  }
  return res.json() as Promise<AIInsights>;
}

export async function generateRevenueBridge(
  context: Record<string, unknown>,
  token: string,
  apiKey?: string
): Promise<string[]> {
  const res = await fetch("/api/revenue-bridge", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ context, apiKey: apiKey || undefined }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || "Generation failed");
  }
  const data = await res.json() as { bullets?: string[] };
  return data.bullets || [];
}

export async function runAssessment(
  assessmentType: string,
  client: string,
  answers: Record<string, string>,
  token: string,
  apiKey?: string
): Promise<{ score: number; narrative: string }> {
  const res = await fetch("/api/assessment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assessmentType, client, answers, apiKey: apiKey || undefined }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || "Assessment failed");
  }
  return res.json() as Promise<{ score: number; narrative: string }>;
}

export async function generateCoachingPlan(
  repName: string,
  calls: Array<{ date: string; score: number; weaknesses: string[] }>,
  token: string,
  apiKey?: string
): Promise<string[]> {
  const res = await fetch("/api/coaching", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ repName, calls, apiKey: apiKey || undefined }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || "Coaching failed");
  }
  const data = await res.json() as { bullets?: string[] };
  return data.bullets || [];
}
