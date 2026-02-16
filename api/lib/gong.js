// Gong API client for fetching calls and transcripts

export function createGongClient(accessKey, accessKeySecret, baseUrl = "https://us-11211.api.gong.io") {
  const authHeader = "Basic " + Buffer.from(`${accessKey}:${accessKeySecret}`).toString("base64");

  async function gongFetch(path, options = {}) {
    const url = `${baseUrl}${path}`;
    const r = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...options.headers,
      },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Gong API ${r.status}: ${body || r.statusText}`);
    }
    return r.json();
  }

  return {
    // List calls with optional date range, handles cursor pagination
    async listCalls(fromDateTime, toDateTime, cursor) {
      const params = new URLSearchParams();
      if (fromDateTime) params.set("fromDateTime", fromDateTime);
      if (toDateTime) params.set("toDateTime", toDateTime);
      if (cursor) params.set("cursor", cursor);
      const qs = params.toString();
      return gongFetch(`/v2/calls?${qs}`);
    },

    // Fetch all calls with pagination
    async listAllCalls(fromDateTime, toDateTime) {
      const allCalls = [];
      let cursor = null;
      do {
        const result = await this.listCalls(fromDateTime, toDateTime, cursor);
        if (result.calls) allCalls.push(...result.calls);
        cursor = result.records?.cursor || null;
      } while (cursor);
      return allCalls;
    },

    // Get transcript for a specific call
    async getTranscript(callId) {
      return gongFetch("/v2/calls/transcript", {
        method: "POST",
        body: JSON.stringify({ filter: { callIds: [callId] } }),
      });
    },

    // Get extended call data (parties, etc.)
    async getCallData(callIds) {
      return gongFetch("/v2/calls/extensive", {
        method: "POST",
        body: JSON.stringify({
          filter: { callIds: Array.isArray(callIds) ? callIds : [callIds] },
          contentSelector: { exposedFields: { parties: true, content: { structure: true } } },
        }),
      });
    },

    // Test connection by listing one call
    async testConnection() {
      const now = new Date().toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await this.listCalls(weekAgo, now);
      return { ok: true, callCount: result.calls?.length || 0 };
    },
  };
}

// Build a map of speakerIds to names from call parties data
export function buildSpeakerMap(parties) {
  const map = {};
  if (!Array.isArray(parties)) return map;
  for (const party of parties) {
    if (party.speakerId != null) {
      map[party.speakerId] = party.name || party.emailAddress || `Speaker ${party.speakerId}`;
    }
  }
  return map;
}

// Convert Gong transcript JSON to plain text
export function formatTranscript(callTranscripts, speakerMap = {}) {
  if (!Array.isArray(callTranscripts) || callTranscripts.length === 0) return "";

  const transcript = callTranscripts[0];
  if (!transcript?.transcript) return "";

  const lines = [];
  for (const entry of transcript.transcript) {
    const speaker = speakerMap[entry.speakerId] || `Speaker ${entry.speakerId}`;
    const sentences = (entry.sentences || []).map((s) => s.text).join(" ");
    if (sentences.trim()) {
      lines.push(`[${speaker}] ${sentences.trim()}`);
    }
  }
  return lines.join("\n\n");
}
