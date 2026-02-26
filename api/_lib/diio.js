// Diio API client for fetching meetings, phone calls, and transcripts

// Refresh an expired Diio access token using long-lived credentials
export async function refreshDiioToken(subdomain, clientId, clientSecret, refreshToken) {
  const baseUrl = `https://${subdomain}.diio.com/api/external`;
  const r = await fetch(`${baseUrl}/refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Diio token refresh failed (${r.status}): ${body || r.statusText}`);
  }
  return r.json(); // { access_token, refresh_token? }
}

// Create a Diio API client
// onRefresh: async callback invoked on 401 — should refresh the token, save it, and return the new access_token
export function createDiioClient(subdomain, accessToken, onRefresh) {
  const baseUrl = `https://${subdomain}.diio.com/api/external`;
  let currentToken = accessToken;

  async function diioFetch(path, options = {}, isRetry = false) {
    const r = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
        ...options.headers,
      },
    });

    if (r.status === 401 && !isRetry && onRefresh) {
      const newToken = await onRefresh();
      if (newToken) {
        currentToken = newToken;
        return diioFetch(path, options, true);
      }
    }

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Diio API ${r.status}: ${body || r.statusText}`);
    }
    return r.json();
  }

  return {
    async listMeetings(page = 1, limit = 50) {
      return diioFetch(`/v1/meetings?page=${page}&limit=${limit}`);
    },

    async listAllMeetings(daysBack = 30) {
      const allMeetings = [];
      let page = 1;
      const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      for (let i = 0; i < 20; i++) {
        const result = await this.listMeetings(page, 50);
        const batch = result.meetings || [];
        allMeetings.push(...batch);
        if (!result.next || batch.length < 50) break;
        const oldestDate = new Date(batch[batch.length - 1]?.scheduled_at || batch[batch.length - 1]?.created_at || 0);
        if (oldestDate < cutoff) break;
        page++;
      }
      return allMeetings;
    },

    async listPhoneCalls(page = 1, limit = 50) {
      return diioFetch(`/v1/phone_calls?page=${page}&limit=${limit}`);
    },

    async listAllPhoneCalls(daysBack = 30) {
      const allCalls = [];
      let page = 1;
      const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      for (let i = 0; i < 20; i++) {
        const result = await this.listPhoneCalls(page, 50);
        const batch = result.phone_calls || [];
        allCalls.push(...batch);
        if (!result.next || batch.length < 50) break;
        const oldestDate = new Date(batch[batch.length - 1]?.occurred_at || batch[batch.length - 1]?.created_at || 0);
        if (oldestDate < cutoff) break;
        page++;
      }
      return allCalls;
    },

    async getTranscript(transcriptId) {
      return diioFetch(`/v1/transcripts/${transcriptId}`);
    },

    async testConnection() {
      const result = await this.listMeetings(1, 1);
      return { ok: true, total: result.total || 0 };
    },
  };
}
