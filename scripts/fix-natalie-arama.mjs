// Fix duplicate "Natalie Arama" entries in Diio call_reviews
// Usage: SUPABASE_SERVICE_KEY=xxx node scripts/fix-natalie-arama.mjs

const SUPABASE_URL = "https://vflmrqtpdrhnyvokquyu.supabase.co";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// 1. Fetch all call_reviews and filter to Diio in JS (client is inside category_scores JSON)
const url = `${SUPABASE_URL}/rest/v1/call_reviews?select=id,category_scores&limit=5000`;
const r = await fetch(url, { headers });
if (!r.ok) {
  console.error("Fetch failed:", await r.text());
  process.exit(1);
}

const allRows = await r.json();
// Filter to Diio client only
const rows = allRows.filter(row => row.category_scores?.client === "Diio");
console.log(`Total rows: ${allRows.length}, Diio rows: ${rows.length}`);

// 2. Find all distinct rep_name values that contain "Natalie" (case-insensitive)
const variants = {};
for (const row of rows) {
  const repName = row.category_scores?.rep_name;
  if (repName && repName.toLowerCase().includes("natalie")) {
    variants[repName] = (variants[repName] || 0) + 1;
  }
}

console.log("\nNatalie variants found:");
for (const [name, count] of Object.entries(variants)) {
  console.log(`  "${name}" — ${count} call(s)`);
}

if (Object.keys(variants).length <= 1) {
  console.log("\nOnly one variant found — nothing to consolidate.");
  process.exit(0);
}

// 3. Pick the canonical name (most calls wins)
const sorted = Object.entries(variants).sort((a, b) => b[1] - a[1]);
const canonical = sorted[0][0];
const toFix     = sorted.slice(1).map(([name]) => name);

console.log(`\nCanonical name: "${canonical}"`);
console.log(`Names to rename: ${toFix.map(n => `"${n}"`).join(", ")}`);

// 4. For each non-canonical variant, patch every affected row
let totalPatched = 0;
for (const wrongName of toFix) {
  const affected = rows.filter(r => r.category_scores?.rep_name === wrongName);
  console.log(`\nPatching ${affected.length} rows with rep_name="${wrongName}" → "${canonical}"...`);

  for (const row of affected) {
    const updatedScores = { ...row.category_scores, rep_name: canonical };
    const patchUrl = `${SUPABASE_URL}/rest/v1/call_reviews?id=eq.${row.id}`;
    const pr = await fetch(patchUrl, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ category_scores: updatedScores }),
    });
    if (!pr.ok) {
      console.error(`  ✗ Failed to patch id=${row.id}:`, await pr.text());
    } else {
      totalPatched++;
      console.log(`  ✓ Patched id=${row.id}`);
    }
  }
}

console.log(`\nDone. Patched ${totalPatched} record(s).`);
