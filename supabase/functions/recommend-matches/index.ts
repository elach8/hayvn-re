// supabase/functions/recommend-matches/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Json = Record<string, unknown>;

function json(status: number, body: Json, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function corsHeaders(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function normalizeToken(s: string) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// removes spaces/punct for “SanJose” == “San Jose”
function normalizeKey(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isZipToken(t: string) {
  return /^[0-9]{5}$/.test(t);
}

function parsePreferredLocations(raw: string | null) {
  if (!raw) return [];
  return raw
    .split(/[,;\n/|]+/g) // commas, semicolons, new lines, slashes, pipes
    .map((x) => normalizeToken(x))
    .map((x) => x.replace(/[()]/g, "").trim())
    .filter(Boolean);
}

// Builds a safe OR filter string for Supabase PostgREST .or()
// - city ilike for non-zip tokens
// - postal_code eq for zip tokens
function buildOrFilter(tokens: string[]) {
  const cleaned = tokens
    .map((t) => normalizeToken(t).replace(/[%]/g, "").replace(/,/g, " ").trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const t of cleaned) {
    if (isZipToken(t)) {
      parts.push(`postal_code.eq.${t}`);
    } else {
      // allow partial city matches: “newport” -> “Newport Beach”
      parts.push(`city.ilike.%${t}%`);
    }
  }

  return parts.join(",");
}

function daysSince(ts: string | null) {
  if (!ts) return null;
  const d = new Date(ts).getTime();
  if (Number.isNaN(d)) return null;
  const diffMs = Date.now() - d;
  return diffMs / (1000 * 60 * 60 * 24);
}

type Candidate = {
  id: string; // mls_listings.id
  mls_number: string;
  city: string | null;
  postal_code: string | null;
  state: string | null;
  status: string;
  list_price: number | null;
  last_seen_at: string | null;
  status_last_changed_at: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
};

type ClientRow = {
  id: string;
  brokerage_id: string | null;
  agent_id: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_locations: string | null;
};

type QueryMode = "price+location" | "priceOnly" | "open";

function clampLimit(n: number) {
  return Number.isFinite(n) ? Math.max(5, Math.min(200, n)) : 50;
}

// NEW: clamp target queue size (how many "new" recs we want to maintain)
function clampTargetNew(n: number) {
  return Number.isFinite(n) ? Math.max(1, Math.min(25, Math.floor(n))) : 5;
}

function budgetWindow(min: number | null, max: number | null, widenPct: number) {
  // widenPct: 0.10 means ±10%
  const minAllowed = min != null ? Math.floor(min * (1 - widenPct)) : null;
  const maxAllowed = max != null ? Math.ceil(max * (1 + widenPct)) : null;
  return { minAllowed, maxAllowed };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Use POST" }, cors);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(
      500,
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      cors,
    );
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- Auth: require a logged-in user (agent) ---
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : "";

  if (!jwt) {
    return json(401, { error: "Missing Authorization bearer token" }, cors);
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
  if (authErr || !authData?.user) {
    return json(401, { error: "Invalid session" }, cors);
  }

  const agentUserId = authData.user.id;

  // --- Input ---
  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const client_id = (payload?.client_id ?? "").toString();
  const limit = clampLimit(Number(payload?.limit ?? 50));
  const target_new = clampTargetNew(Number(payload?.target_new ?? 5)); // NEW

  if (!client_id) {
    return json(400, { error: "client_id is required" }, cors);
  }

  // --- Load agent brokerage_id (authorization + scoping) ---
  const { data: agentRow, error: agentErr } = await supabaseAdmin
    .from("agents")
    .select("id, brokerage_id")
    .eq("id", agentUserId)
    .maybeSingle();

  if (agentErr) {
    return json(500, { error: agentErr.message }, cors);
  }

  const agentBrokerageId = (agentRow as any)?.brokerage_id ?? null;

  // --- Load client requirements ---
  const { data: client, error: clientErr } = await supabaseAdmin
    .from("clients")
    .select("id, brokerage_id, agent_id, budget_min, budget_max, preferred_locations")
    .eq("id", client_id)
    .single();

  if (clientErr || !client) {
    return json(404, { error: "Client not found" }, cors);
  }

  const c = client as unknown as ClientRow;

  // --- Authorization (MVP safe):
  const allowed =
    (c.agent_id && c.agent_id === agentUserId) ||
    (c.brokerage_id && agentBrokerageId && c.brokerage_id === agentBrokerageId);

  if (!allowed) {
    return json(403, { error: "Not authorized for this client" }, cors);
  }

  const brokerageId = c.brokerage_id ?? agentBrokerageId;
  if (!brokerageId) {
    return json(
      400,
      { error: "Client/agent is not linked to a brokerage_id yet" },
      cors,
    );
  }

  // --- Load existing recs for this client (queue semantics) ---
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("property_recommendations")
    .select("mls_listing_id, status")
    .eq("client_id", client_id);

  if (existingErr) {
    return json(500, { error: existingErr.message }, cors);
  }

  const statusByListing = new Map<string, string>();
  let existingNewCount = 0;
  for (const r of existing ?? []) {
    const lid = (r as any).mls_listing_id as string;
    const st = (r as any).status as string;
    statusByListing.set(lid, st);
    if (st === "new") existingNewCount += 1;
  }

  // NEW: If we already have enough "new" items, do nothing (no recompute/no writes)
  if (existingNewCount >= target_new) {
    return json(
      200,
      {
        ok: true,
        client_id,
        brokerage_id: brokerageId,
        mode_used: "noop",
        widen_used: 0,
        preferred_tokens: parsePreferredLocations(c.preferred_locations),
        candidates_scored: 0,
        recommendations_written: 0,
        recommendations_deleted: 0,
        existing_new_count: existingNewCount,
        target_new,
        needed_new: 0,
        top: [],
      },
      cors,
    );
  }

  const neededNew = Math.max(0, target_new - existingNewCount);

  const preferredTokens = parsePreferredLocations(c.preferred_locations);
  const budgetMin = c.budget_min ?? null;
  const budgetMax = c.budget_max ?? null;

  const orFilter = preferredTokens.length > 0 ? buildOrFilter(preferredTokens) : "";

  async function fetchCandidates(mode: QueryMode, widenPct: number) {
    const { minAllowed, maxAllowed } = budgetWindow(budgetMin, budgetMax, widenPct);

    let q = supabaseAdmin
      .from("mls_listings")
      .select(
        [
          "id",
          "mls_number",
          "city",
          "postal_code",
          "state",
          "status",
          "list_price",
          "last_seen_at",
          "status_last_changed_at",
          "property_type",
          "beds",
          "baths",
          "sqft",
        ].join(", "),
      )
      .eq("brokerage_id", brokerageId)
      .eq("is_active", true)
      .not("list_price", "is", null);

    // price constraints
    if (mode === "price+location" || mode === "priceOnly") {
      if (minAllowed != null) q = q.gte("list_price", minAllowed);
      if (maxAllowed != null) q = q.lte("list_price", maxAllowed);
    }

    // location constraints (only in price+location mode)
    if (mode === "price+location" && orFilter) {
      q = q.or(orFilter);
    }

    // cap raw fetch
    const { data, error } = await q.limit(2000);

    if (error) throw error;
    return (data ?? []) as Candidate[];
  }

  // --- Progressive candidate retrieval ---
  // 1) Try: price + location, widen 10%
  // 2) If too few: price only, widen 10%
  // 3) If still too few: price only, widen 20%
  // 4) If still too few: open (no price + no location), just active + priced
  let modeUsed: QueryMode = "price+location";
  let widenUsed = 0.10;

  let rows: Candidate[] = [];
  try {
    if (preferredTokens.length > 0) {
      modeUsed = "price+location";
      widenUsed = 0.10;
      rows = await fetchCandidates(modeUsed, widenUsed);

      // NOTE: keep the existing "limit" logic for how hard we try to fetch candidates,
      // but we will only *insert* neededNew at the end.
      if (rows.length < limit) {
        modeUsed = "priceOnly";
        widenUsed = 0.10;
        rows = await fetchCandidates(modeUsed, widenUsed);
      }
    } else {
      modeUsed = "priceOnly";
      widenUsed = 0.10;
      rows = await fetchCandidates(modeUsed, widenUsed);
    }

    if (rows.length < limit) {
      modeUsed = "priceOnly";
      widenUsed = 0.20;
      rows = await fetchCandidates(modeUsed, widenUsed);
    }

    if (rows.length < Math.max(10, Math.floor(limit / 2))) {
      modeUsed = "open";
      widenUsed = 0.0;
      rows = await fetchCandidates(modeUsed, widenUsed);
    }
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Query failed" }, cors);
  }

  // --- Score + reasons ---
  const tokenKeys = preferredTokens.map(normalizeKey);
  const zipTokens = preferredTokens.filter(isZipToken);

  const scoredAll = rows.map((l) => {
    const reasons: string[] = [];
    let score = 0;

    // Price fit (0–40)
    const price = l.list_price ?? null;
    if (price != null && budgetMin != null && budgetMax != null) {
      if (price >= budgetMin && price <= budgetMax) {
        score += 40;
        reasons.push("In budget");
      } else {
        score += 22;
        reasons.push("Near budget");
      }
    } else if (price != null) {
      score += 10;
      reasons.push("Price present");
    }

    // Location fit (0–45)
    if (preferredTokens.length > 0) {
      const cityRaw = l.city ?? "";
      const cityKey = normalizeKey(cityRaw);
      const listingZip = (l.postal_code ?? "").trim();

      const zipHit = listingZip && zipTokens.includes(listingZip);

      const exactish = tokenKeys.some((tk) => tk && tk === cityKey);
      const partial = tokenKeys.some((tk) =>
        tk && (cityKey.includes(tk) || tk.includes(cityKey))
      );

      if (zipHit) {
        score += 45;
        reasons.push(`Zip match: ${listingZip}`);
      } else if (exactish && cityRaw) {
        score += 45;
        reasons.push(`City match: ${cityRaw}`);
      } else if (partial && cityRaw) {
        score += 32;
        reasons.push(`City match (partial): ${cityRaw}`);
      } else if (cityRaw) {
        score += 5;
        reasons.push(`Outside preferred area: ${cityRaw}`);
      }
    }

    // Status & freshness (0–15)
    if ((l.status ?? "").toLowerCase() === "active") {
      score += 5;
      reasons.push("Active");
    }

    const seenDays = daysSince(l.last_seen_at);
    if (seenDays != null) {
      if (seenDays <= 2) {
        score += 10;
        reasons.push("Fresh (seen ≤ 2 days)");
      } else if (seenDays <= 7) {
        score += 5;
        reasons.push("Recent (seen ≤ 7 days)");
      }
    }

    // Tiny tie-breakers (helps ordering without being rigid)
    if (l.beds != null) score += 1;
    if (l.baths != null) score += 1;
    if (l.sqft != null) score += 1;

    return { l, score, reasons };
  });

  // Dynamic min score
  const hasBudgetRange = budgetMin != null && budgetMax != null;
  const hasPrefs = preferredTokens.length > 0;

  let minScore = 35;
  if (!hasBudgetRange && !hasPrefs) minScore = 12;
  else if (hasBudgetRange && !hasPrefs) minScore = 18;
  else if (!hasBudgetRange && hasPrefs) minScore = 20;

  // Rank candidates (do NOT slice to "limit" yet; we will slice to neededNew after excluding existing recs)
  let ranked = scoredAll
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);

  // If we got nothing, degrade gracefully: take top-N anyway
  if (ranked.length === 0) {
    ranked = scoredAll.sort((a, b) => b.score - a.score).slice(0, Math.min(limit, 25));
  }

  // NEW: Only pick listings we have never recommended before (any status),
  // and only pick enough to top up the "new" queue.
  const picked = ranked
    .filter((x) => !statusByListing.has(x.l.id))
    .slice(0, neededNew);

  const upserts = picked.map((x) => ({
    client_id,
    mls_listing_id: x.l.id,
    score: x.score,
    reasons: x.reasons,
    status: "new",
  }));

  // Upsert recommendations
  let upserted = 0;
  if (upserts.length > 0) {
    const { error: upErr, data: upData } = await supabaseAdmin
      .from("property_recommendations")
      .upsert(upserts, { onConflict: "client_id,mls_listing_id" })
      .select("id");

    if (upErr) {
      return json(500, { error: upErr.message }, cors);
    }
    upserted = upData?.length ?? 0;
  }

  // NEW: Do NOT prune in queue mode (keeps unreviewed queue stable)
  const deleted = 0;

  return json(
    200,
    {
      ok: true,
      client_id,
      brokerage_id: brokerageId,
      mode_used: modeUsed,
      widen_used: widenUsed,
      preferred_tokens: preferredTokens,
      candidates_scored: rows.length,
      recommendations_written: upserted,
      recommendations_deleted: deleted,
      existing_new_count: existingNewCount,
      target_new,
      needed_new: neededNew,
      top: picked.map((x) => ({
        mls_listing_id: x.l.id,
        mls_number: x.l.mls_number,
        city: x.l.city,
        postal_code: x.l.postal_code,
        state: x.l.state,
        list_price: x.l.list_price,
        property_type: x.l.property_type,
        beds: x.l.beds,
        baths: x.l.baths,
        sqft: x.l.sqft,
        score: x.score,
        reasons: x.reasons,
      })),
    },
    cors,
  );
});

