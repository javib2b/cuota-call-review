// Fireflies.ai GraphQL API client
// Docs: https://docs.fireflies.ai/graphql-api/reference

const FIREFLIES_ENDPOINT = "https://api.fireflies.ai/graphql";

export function createFirefliesClient(apiKey) {
  async function gql(query, variables = {}) {
    const r = await fetch(FIREFLIES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Fireflies HTTP ${r.status}: ${text.slice(0, 200)}`);
    }
    const data = await r.json();
    if (data.errors?.length) {
      throw new Error(`Fireflies GraphQL: ${data.errors[0]?.message || "Unknown error"}`);
    }
    return data.data;
  }

  // List transcripts — Fireflies paginates with skip/limit.
  // fromDate is ISO string; we filter client-side for reliability across plans.
  async function listAllTranscripts(fromDate, batchSize = 50) {
    const fromTs = new Date(fromDate).getTime();
    const allTranscripts = [];
    let skip = 0;
    let keepGoing = true;

    const LIST_QUERY = `
      query ($limit: Int, $skip: Int) {
        transcripts(limit: $limit, skip: $skip) {
          id
          title
          date
          duration
          host_email
          participants
          meeting_attendees {
            displayName
            email
            name
          }
        }
      }
    `;

    while (keepGoing) {
      const data = await gql(LIST_QUERY, { limit: batchSize, skip });
      const batch = data.transcripts || [];
      if (!batch.length) break;

      for (const t of batch) {
        const ts = typeof t.date === "number" ? t.date : new Date(t.date).getTime();
        if (ts >= fromTs) {
          allTranscripts.push(t);
        } else {
          // Fireflies returns newest-first; once we're past the window, stop
          keepGoing = false;
          break;
        }
      }

      if (batch.length < batchSize) keepGoing = false;
      skip += batch.length;
    }

    return allTranscripts;
  }

  // Fetch full transcript including sentences
  async function getTranscript(transcriptId) {
    const TRANSCRIPT_QUERY = `
      query ($id: String!) {
        transcript(id: $id) {
          id
          title
          date
          duration
          host_email
          participants
          sentences {
            index
            speaker_name
            text
            start_time
            end_time
          }
          meeting_attendees {
            displayName
            email
            name
          }
          summary {
            overview
            action_items
            keywords
            short_summary
          }
        }
      }
    `;
    const data = await gql(TRANSCRIPT_QUERY, { id: transcriptId });
    return data.transcript;
  }

  return { listAllTranscripts, getTranscript };
}

// Format Fireflies sentences into a readable transcript string.
// Consecutive sentences from the same speaker are joined into one paragraph.
export function formatFirefliesTranscript(sentences) {
  if (!sentences?.length) return "";

  const lines = [];
  let currentSpeaker = null;
  let currentTexts = [];

  for (const s of sentences) {
    const speaker = (s.speaker_name || "Unknown").trim();
    const text = (s.text || "").trim();
    if (!text) continue;

    if (speaker !== currentSpeaker) {
      if (currentSpeaker !== null && currentTexts.length) {
        lines.push(`${currentSpeaker}: ${currentTexts.join(" ")}`);
      }
      currentSpeaker = speaker;
      currentTexts = [text];
    } else {
      currentTexts.push(text);
    }
  }

  if (currentSpeaker !== null && currentTexts.length) {
    lines.push(`${currentSpeaker}: ${currentTexts.join(" ")}`);
  }

  return lines.join("\n");
}
