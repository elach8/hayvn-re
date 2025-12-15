// supabase/functions/idx-sync/index.ts
// IDX sync for Hayvn-RE (MLSListings RESO Web API / OData).
// Key behavior:
// - Syncs the VOW universe for each live idx_connection (not just brokerage-owned listings).
// - Upserts into mls_listings keyed by (idx_connection_id, mls_number)
// - Paginates via $top + $skip (MLSListings cap: $top <= 300)
// - Includes CORS so you can trigger from Vercel (/ingest page)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type IdxStatus = "pending" | "live" | "disabled";

type IdxConnection = {
  id: string;
  brokerage_id: string;
  mls_name: string | null;
  connection_label: string | null;
  vendor_name: string | null;
  endpoint_url: string | null; // e.g. https://vendordata.api-v2.mlslistings.com/vow OR .../vow/Property
  api_key: string | null; // Bearer token
  status: IdxStatus | null;
};

type NormalizedListing = {
  mls_number: string;
  mls_source: string | null;
  status: string | null;
  list_date: string | null; // YYYY-MM-DD
  close_date: string | null; // YYYY-MM-DD
  status_last_changed_at: string | null; // ISO timestamp
  property_type: string | null;
  listing_title: string | null;
  description: string | null;
  list_price: number | null;
  original_list_price: number | null;
  close_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  street_number: string | null;
  street_dir_prefix: string | null;
  street_name: string | null;
  street_suffix: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  raw_payload: unknown;
};

function corsHeaders(origin: string | null) {
  // reflect origin (fine for internal tool). lock down later if you want.
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function getSupabaseAdmin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// endpoint_url might be:
// - https://vendordata.api-v2.mlslistings.com/vow
// - https://vendordata.api-v2.mlslistings.com/vow/Property
function toPropertyEndpoint(endpointUrl: string): string {
  const trimmed = endpointUrl.replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/property")) return trimmed;
  return `${trimmed}/Property`;
}

function toNumber(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function toDateOnly(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toIso(val: unknown): string | null {
  if (val == null) return null;
  const d = new Date(String(val));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapResoPropertyToNormalized(record: any, mlsSource: string | null): NormalizedListing | null {
  const mlsNumber: string | null =
    record.ListingKey ??
    record.ListingId ??
    (record.ListingKeyNumeric != null ? String(record.ListingKeyNumeric) : null);

  if (!mlsNumber) return null;

  const city: string | null = record.City ?? record.PostalCity ?? null;

  return {
    mls_number: mlsNumber,
    mls_source: mlsSource,
    status: record.StandardStatus ?? record.MlsStatus ?? record.Status ?? null,
    list_date: toDateOnly(record.OnMarketDate ?? record.ListingContractDate ?? record.ListDate),
    close_date: toDateOnly(record.CloseDate),
    status_last_changed_at: toIso(
      record.StatusChangeTimestamp ??
        record.ContractStatusChangeDate ??
        record.ModificationTimestamp ??
        record.OriginatingSystemModificationTimestamp
    ),
    property_type: record.PropertyType ?? record.PropertySubType ?? null,
    listing_title: record.UnparsedAddress ?? record.StreetAddress ?? record.ListingTitle ?? null,
    description: record.PublicRemarks ?? record.PrivateRemarks ?? record.Description ?? null,
    list_price: toNumber(record.ListPrice),
    original_list_price: toNumber(record.OriginalListPrice),
    close_price: toNumber(record.ClosePrice),
    beds: toNumber(record.BedroomsTotal),
    baths: toNumber(record.BathroomsTotalInteger ?? record.BathroomsTotal),
    sqft: toNumber(record.LivingArea ?? record.BuildingAreaTotal),
    lot_sqft: toNumber(record.LotSizeSquareFeet),
    year_built: toNumber(record.YearBuilt),
    street_number: record.StreetNumber ?? null,
    street_dir_prefix: record.StreetDirPrefix ?? null,
    street_name: record.StreetName ?? null,
    street_suffix: record.StreetSuffix ?? null,
    unit: record.UnitNumber ?? record.Unit ?? null,
    city,
    state: record.StateOrProvince ?? null,
    postal_code: record.PostalCode ?? record.PostalCodePlus4 ?? null,
    county: record.CountyOrParish ?? null,
    latitude: toNumber(record.Latitude),
    longitude: toNumber(record.Longitude),
    raw_payload: record,
  };
}

async function loadConnectionsToSync(
  supabase: SupabaseClient,
  brokerageId: string,
  connectionId: string | null
): Promise<IdxConnection[]> {
  let q = supabase
    .from("idx_connections")
    .select("id, brokerage_id, mls_name, connection_label, vendor_name, endpoint_url, api_key, status")
    .eq("status", "live")
    .eq("brokerage_id", brokerageId);

  if (connectionId) q = q.eq("id", connectionId);

  const { data, error } = await q;
  if (error) throw new Error(`Failed to load idx_connections: ${error.message}`);
  return (data ?? []) as IdxConnection[];
}

async function fetchResoVowUniverse(conn: IdxConnection, opts: { top: number; maxPages: number }) {
  const endpointUrl = conn.endpoint_url;
  const token = conn.api_key;
  if (!endpointUrl || !token) {
    throw new Error(`idx_connection ${conn.id} missing endpoint_url or api_key`);
  }

  const propertyEndpoint = toPropertyEndpoint(endpointUrl);

  // MLSListings: $top limit is 300
  const top = Math.max(1, Math.min(300, opts.top));

  // Optional filter (comment out if MLS rejects it)
  const soldWindowDays = 90;
  const soldCutoff = new Date();
  soldCutoff.setDate(soldCutoff.getDate() - soldWindowDays);
  const soldCutoffStr = soldCutoff.toISOString().slice(0, 10);

  const filterExpr =
    "(" +
    "StandardStatus eq 'Active'" +
    " or StandardStatus eq 'Pending'" +
    ` or (StandardStatus eq 'Closed' and CloseDate ge ${soldCutoffStr})` +
    ")";

  const all: any[] = [];
  let skip = 0;

  for (let page = 0; page < opts.maxPages; page++) {
    const url = new URL(propertyEndpoint);

    // If filter causes 400s, comment this line:
    // url.searchParams.set("$filter", filterExpr);

    url.searchParams.set("$orderby", "ModificationTimestamp desc");
    url.searchParams.set("$top", String(top));
    url.searchParams.set("$skip", String(skip));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MLS HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }

    const body = await res.json().catch(() => null);
    const value = body?.value;

    if (!Array.isArray(value) || value.length === 0) break;

    all.push(...value);

    if (value.length < top) break; // last page
    skip += top;
  }

  return all;
}

async function upsertListings(
  supabase: SupabaseClient,
  conn: IdxConnection,
  listings: NormalizedListing[]
) {
  const nowIso = new Date().toISOString();

  const rows = listings.map((l) => ({
    brokerage_id: conn.brokerage_id,
    idx_connection_id: conn.id,
    mls_number: l.mls_number,
    mls_source: l.mls_source,
    status: l.status,
    list_date: l.list_date,
    close_date: l.close_date,
    status_last_changed_at: l.status_last_changed_at,
    last_seen_at: nowIso,
    property_type: l.property_type,
    listing_title: l.listing_title,
    description: l.description,
    list_price: l.list_price,
    original_list_price: l.original_list_price,
    close_price: l.close_price,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    lot_sqft: l.lot_sqft,
    year_built: l.year_built,
    street_number: l.street_number,
    street_dir_prefix: l.street_dir_prefix,
    street_name: l.street_name,
    street_suffix: l.street_suffix,
    unit: l.unit,
    city: l.city,
    state: l.state,
    postal_code: l.postal_code,
    county: l.county,
    latitude: l.latitude,
    longitude: l.longitude,
    raw_payload: l.raw_payload ?? null,
  }));

  const { data, error } = await supabase
    .from("mls_listings")
    .upsert(rows, { onConflict: "idx_connection_id,mls_number" })
    .select("id");

  if (error) throw new Error(`Upsert mls_listings failed: ${error.message}`);

  return { upserted: data?.length ?? 0 };
}

async function markConnection(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("idx_connections").update(patch).eq("id", id);
  if (error) console.error("Failed to update idx_connections:", id, error.message);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Use POST" }, 405, cors);
  }

  const supabase = getSupabaseAdmin();

  // Require a logged-in user (agent) to trigger ingest
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Missing Authorization bearer token" }, 401, cors);

  const { data: authData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !authData?.user) {
    return jsonResponse({ ok: false, error: "Invalid session" }, 401, cors);
  }

  const agentId = authData.user.id;

  // Load agent brokerage_id (scope)
  const { data: agentRow, error: agentRowErr } = await supabase
    .from("agents")
    .select("id, brokerage_id")
    .eq("id", agentId)
    .maybeSingle();

  if (agentRowErr) return jsonResponse({ ok: false, error: agentRowErr.message }, 500, cors);

  const brokerageId = (agentRow as any)?.brokerage_id ?? null;
  if (!brokerageId) {
    return jsonResponse(
      { ok: false, error: "Agent is missing brokerage_id (cannot scope idx-sync)." },
      400,
      cors
    );
  }

  try {
    const url = new URL(req.url);
    const connectionId = url.searchParams.get("connection_id");
    const dryRun = url.searchParams.get("dry_run") === "1";

    const connections = await loadConnectionsToSync(supabase, brokerageId, connectionId);
    if (connections.length === 0) {
      return jsonResponse({ ok: true, message: "No live IDX connections to sync", connectionId }, 200, cors);
    }

    const results: any[] = [];

    for (const conn of connections) {
      const startedAt = new Date().toISOString();

      try {
        if (!conn.endpoint_url || !conn.api_key) {
          await markConnection(supabase, conn.id, {
            last_status_at: startedAt,
            last_error: "Missing endpoint_url or api_key on idx_connections row",
          });

          results.push({ connection_id: conn.id, ok: false, error: "Missing endpoint_url or api_key" });
          continue;
        }

        // Use $top=300 and paginate
        const raw = await fetchResoVowUniverse(conn, { top: 300, maxPages: 50 }); // up to 15k rows cap
        const mlsSource = conn.mls_name || conn.vendor_name || conn.endpoint_url;

        const normalized: NormalizedListing[] = raw
          .map((r) => mapResoPropertyToNormalized(r, mlsSource))
          .filter(Boolean) as NormalizedListing[];

        if (dryRun) {
          results.push({
            connection_id: conn.id,
            ok: true,
            dry_run: true,
            fetched_raw: raw.length,
            normalized: normalized.length,
          });
          await markConnection(supabase, conn.id, { last_status_at: startedAt, last_error: null });
          continue;
        }

        const { upserted } = await upsertListings(supabase, conn, normalized);

        await markConnection(supabase, conn.id, {
          status: "live",
          last_status_at: startedAt,
          last_error: null,
        });

        results.push({
          connection_id: conn.id,
          ok: true,
          fetched_raw: raw.length,
          normalized: normalized.length,
          upserted,
        });
      } catch (e: any) {
        await markConnection(supabase, conn.id, {
          last_status_at: startedAt,
          last_error: e?.message ?? "IDX sync error",
        });

        results.push({ connection_id: conn.id, ok: false, error: e?.message ?? "IDX sync error" });
      }
    }

    return jsonResponse({ ok: true, dry_run: dryRun, count: results.length, results }, 200, cors);
  } catch (e: any) {
    return jsonResponse({ ok: false, error: e?.message ?? "Unhandled error" }, 500, cors);
  }
});

