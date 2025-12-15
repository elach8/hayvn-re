// supabase/functions/idx-sync/index.ts
// FIXED: CORS + OPTIONS handling + safe error returns
// Your ingest logic remains intact

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ---------------- CORS ---------------- */

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

/* ---------------- Supabase ---------------- */

function getSupabaseAdmin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ---------------- Types ---------------- */

type IdxConnection = {
  id: string;
  brokerage_id: string;
  endpoint_url: string | null;
  api_key: string | null;
};

/* ---------------- Helpers ---------------- */

function normalizeStatus(raw: unknown): "active" | "pending" | "sold" | "other" {
  const s = String(raw ?? "").toLowerCase();
  if (["active", "comingsoon", "activeundercontract"].includes(s)) return "active";
  if (["pending", "undercontract", "contingent"].includes(s)) return "pending";
  if (["sold", "closed"].includes(s)) return "sold";
  return "other";
}

function toPropertyEndpoint(url: string) {
  const u = url.replace(/\/+$/, "");
  return u.toLowerCase().endsWith("/property") ? u : `${u}/Property`;
}

/* ---------------- Main ---------------- */

serve(async (req) => {
  const origin = req.headers.get("origin");

  // 🔴 REQUIRED: handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405, origin);
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: connections, error } = await supabase
      .from("idx_connections")
      .select("id, brokerage_id, endpoint_url, api_key")
      .eq("status", "live");

    if (error) throw error;
    if (!connections || connections.length === 0) {
      return json({ ok: true, message: "No live connections" }, 200, origin);
    }

    const results: any[] = [];

    for (const conn of connections as IdxConnection[]) {
      if (!conn.endpoint_url || !conn.api_key) {
        results.push({
          connection_id: conn.id,
          ok: false,
          error: "Missing endpoint_url or api_key",
        });
        continue;
      }

      const endpoint = toPropertyEndpoint(conn.endpoint_url);
      const url = new URL(endpoint);
      url.searchParams.set("$top", "300"); // MLS hard limit
      url.searchParams.set("$orderby", "ModificationTimestamp desc");

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${conn.api_key}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        results.push({
          connection_id: conn.id,
          ok: false,
          error: text.slice(0, 300),
        });
        continue;
      }

      const body = await res.json();
      const rows = Array.isArray(body?.value) ? body.value : [];

      const mapped = rows
        .map((r: any) => ({
          brokerage_id: conn.brokerage_id,
          idx_connection_id: conn.id,
          mls_number: String(r.ListingKey ?? r.ListingId),
          status: normalizeStatus(r.StandardStatus),
          list_price: Number(r.ListPrice) || null,
          city: r.City ?? null,
          state: r.StateOrProvince ?? null,
          postal_code: r.PostalCode ?? null,
          raw_payload: r,
          last_seen_at: new Date().toISOString(),
        }))
        .filter((r) => r.mls_number);

      const { error: upsertErr } = await supabase
        .from("mls_listings")
        .upsert(mapped, {
          onConflict: "idx_connection_id,mls_number",
        });

      if (upsertErr) {
        results.push({
          connection_id: conn.id,
          ok: false,
          error: upsertErr.message,
        });
      } else {
        results.push({
          connection_id: conn.id,
          ok: true,
          upserted: mapped.length,
        });
      }
    }

    return json({ ok: true, results }, 200, origin);
  } catch (e: any) {
    // 🔴 CRITICAL: even errors return CORS headers
    return json(
      { ok: false, error: e?.message ?? "Unhandled error" },
      500,
      origin
    );
  }
});
