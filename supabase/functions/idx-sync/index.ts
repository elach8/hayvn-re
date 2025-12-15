// supabase/functions/idx-sync/index.ts
// IDX sync for Hayvn-RE (MLSListings Web API - VOW, RESO OData).
// - Syncs the VOW universe per live idx_connection
// - Upserts into mls_listings keyed by (idx_connection_id, mls_number)
// - Optionally fetches photos via /Media and writes mls_listing_photos
//
// Call from browser (Vercel) safely (CORS + OPTIONS handled).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type IdxStatus = "pending" | "live" | "disabled";

type IdxConnection = {
  id: string;
  brokerage_id: string;
  mls_name: string | null;
  connection_label: string | null;
  vendor_name: string | null;
  endpoint_url: string | null; // base VOW url OR Property endpoint
  api_key: string | null; // Bearer token
  status: IdxStatus | null;
};

type NormalizedListing = {
  mls_number: string;
  mls_source: string | null;
  status: "active" | "pending" | "sold" | "other";
  list_date: string | null;
  close_date: string | null;
  status_last_changed_at: string | null;
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

type UpsertedListingRow = {
  id: string; // mls_listings.id
  idx_connection_id: string;
  mls_number: string;
};

function corsHeaders(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
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

function trimTrailingSlashes(u: string) {
  return u.replace(/\/+$/, "");
}

function toPropertyEndpoint(endpointUrl: string): string {
  const trimmed = trimTrailingSlashes(endpointUrl);
  if (trimmed.toLowerCase().endsWith("/property")) return trimmed;
  return `${trimmed}/Property`;
}

function toMediaEndpoint(endpointUrl: string): string {
  const trimmed = trimTrailingSlashes(endpointUrl);
  if (trimmed.toLowerCase().endsWith("/media")) return trimmed;

  if (trimmed.toLowerCase().endsWith("/property")) {
    return trimmed.slice(0, -"/Property".length) + "/Media";
  }

  return `${trimmed}/Media`;
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

function normalizeStatus(raw: unknown): NormalizedListing["status"] {
  const s = String(raw ?? "").toLowerCase().trim();

  // common RESO-ish values
  if (
    s === "active" ||
    s === "comingsoon" ||
    s === "coming soon" ||
    s === "activeundercontract" ||
    s === "active under contract"
  ) return "active";

  if (
    s === "pending" ||
    s === "undercontract" ||
    s === "under contract" ||
    s === "contingent" ||
    s === "hold"
  ) return "pending";

  if (s === "closed" || s === "sold") return "sold";

  return "other";
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
    status: normalizeStatus(record.StandardStatus ?? record.MlsStatus ?? record.Status),
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
  connectionId: string | null
): Promise<IdxConnection[]> {
  let q = supabase
    .from("idx_connections")
    .select("id, brokerage_id, mls_name, connection_label, vendor_name, endpoint_url, api_key, status")
    .eq("status", "live");

  if (connectionId) q = q.eq("id", connectionId);

  const { data, error } = await q;
  if (error) throw new Error(`Failed to load idx_connections: ${error.message}`);
  return (data ?? []) as IdxConnection[];
}

async function fetchReso(conn: IdxConnection, entity: "Property" | "Media", opts: { top: number; maxPages: number }) {
  const endpointUrl = conn.endpoint_url;
  const token = conn.api_key;

  if (!endpointUrl || !token) {
    throw new Error(`idx_connection ${conn.id} missing endpoint_url or api_key`);
  }

  const base = entity === "Property"
    ? toPropertyEndpoint(endpointUrl)
    : toMediaEndpoint(endpointUrl);

  // MLSListings enforces $top <= 300 (you hit that already)
  const safeTop = Math.min(300, Math.max(1, opts.top));

  const all: any[] = [];
  let skip = 0;

  for (let page = 0; page < opts.maxPages; page++) {
    const url = new URL(base);
    url.searchParams.set("$orderby", "ModificationTimestamp desc");
    url.searchParams.set("$top", String(safeTop));
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

    if (value.length < safeTop) break;

    skip += safeTop;
  }

  return all;
}

async function upsertListings(
  supabase: SupabaseClient,
  conn: IdxConnection,
  listings: NormalizedListing[]
): Promise<{ upserted: number; rows: UpsertedListingRow[] }> {
  const nowIso = new Date().toISOString();

  const rows = listings.map((l) => ({
    brokerage_id: conn.brokerage_id,
    idx_connection_id: conn.id,
    mls_number: l.mls_number,
    mls_source: l.mls_source,
    status: l.status, // <- normalized to satisfy mls_listings_status_check
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
    .select("id, idx_connection_id, mls_number");

  if (error) throw new Error(`Upsert mls_listings failed: ${error.message}`);

  return {
    upserted: data?.length ?? 0,
    rows: (data ?? []) as UpsertedListingRow[],
  };
}

function extractMediaUrl(m: any): string | null {
  return (
    m.MediaURL ??
    m.MediaUrl ??
    m.MediaURLLarge ??
    m.MediaURLPrimary ??
    m.MediaURLHttps ??
    m.ResourceRecordURL ??
    null
  );
}

function extractMediaOrder(m: any): number | null {
  const v = m.Order ?? m.OrderNumber ?? m.MediaOrder ?? m.SortOrder ?? m.Sequence ?? null;
  const n = toNumber(v);
  return n == null ? null : Math.trunc(n);
}

function extractMediaCaption(m: any): string | null {
  const c = m.ShortDescription ?? m.LongDescription ?? m.Caption ?? m.MediaCaption ?? null;
  if (c == null) return null;
  const s = String(c).trim();
  return s ? s : null;
}

async function writePhotosForListings(
  supabase: SupabaseClient,
  conn: IdxConnection,
  listingRows: UpsertedListingRow[],
  mediaRecords: any[]
): Promise<{ photos_written: number }> {
  // Build ListingKey -> listing_id map
  const idByKey = new Map<string, string>();
  for (const r of listingRows) {
    idByKey.set(r.mls_number, r.id);
  }

  // Group media by ListingKey-ish field
  const mediaByKey = new Map<string, any[]>();
  for (const m of mediaRecords ?? []) {
    const key =
      m.ListingKey ??
      m.ListingId ??
      (m.ListingKeyNumeric != null ? String(m.ListingKeyNumeric) : null) ??
      m.ResourceRecordKey ??
      null;

    if (!key) continue;

    if (!mediaByKey.has(String(key))) mediaByKey.set(String(key), []);
    mediaByKey.get(String(key))!.push(m);
  }

  let totalInserted = 0;

  // Write photos per listing (delete then insert)
  for (const [mlsNumber, listingId] of idByKey.entries()) {
    const media = mediaByKey.get(mlsNumber) ?? [];
    if (media.length === 0) continue;

    // Sort media by order if provided
    media.sort((a, b) => {
      const ao = extractMediaOrder(a) ?? 999999;
      const bo = extractMediaOrder(b) ?? 999999;
      return ao - bo;
    });

    // delete existing photos for this listing_id
    await supabase.from("mls_listing_photos").delete().eq("listing_id", listingId);

    const rows = media
      .map((m, idx) => {
        const url = extractMediaUrl(m);
        if (!url) return null;
        return {
          listing_id: listingId,
          sort_order: extractMediaOrder(m) ?? idx,
          url,
          caption: extractMediaCaption(m),
        };
      })
      .filter(Boolean) as { listing_id: string; sort_order: number; url: string; caption: string | null }[];

    if (rows.length === 0) continue;

    const { error } = await supabase.from("mls_listing_photos").insert(rows);
    if (!error) totalInserted += rows.length;
  }

  return { photos_written: totalInserted };
}

async function markConnection(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("idx_connections").update(patch).eq("id", id);
  if (error) console.error("Failed to update idx_connections:", id, error.message);
}

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Use POST" }, 405, origin);
  }

  const supabase = getSupabaseAdmin();

  try {
    const url = new URL(req.url);
    const connectionId = url.searchParams.get("connection_id");
    const dryRun = url.searchParams.get("dry_run") === "1";
    const includePhotos = url.searchParams.get("include_photos") === "1";

    const connections = await loadConnectionsToSync(supabase, connectionId);
    if (connections.length === 0) {
      return jsonResponse({ ok: true, message: "No live IDX connections to sync", connectionId }, 200, origin);
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

        // Pull properties (cap by pages; raise maxPages later if needed)
        const rawProps = await fetchReso(conn, "Property", { top: 300, maxPages: 20 }); // up to 6000 rows
        const mlsSource = conn.mls_name || conn.vendor_name || conn.endpoint_url;

        const normalized: NormalizedListing[] = rawProps
          .map((r) => mapResoPropertyToNormalized(r, mlsSource))
          .filter(Boolean) as NormalizedListing[];

        if (dryRun) {
          results.push({
            connection_id: conn.id,
            ok: true,
            dry_run: true,
            fetched_raw: rawProps.length,
            normalized: normalized.length,
          });
          await markConnection(supabase, conn.id, { last_status_at: startedAt, last_error: null });
          continue;
        }

        const { upserted, rows: upsertedRows } = await upsertListings(supabase, conn, normalized);

        let photos_written = 0;

        if (includePhotos && upsertedRows.length > 0) {
          // Pull media (same paging cap as properties, adjust later)
          // NOTE: Some MLS implementations require specific filters/fields; this is the generic RESO approach.
          const rawMedia = await fetchReso(conn, "Media", { top: 300, maxPages: 40 }); // up to 12000 media rows
          const photoRes = await writePhotosForListings(supabase, conn, upsertedRows, rawMedia);
          photos_written = photoRes.photos_written;
        }

        await markConnection(supabase, conn.id, {
          status: "live",
          last_status_at: startedAt,
          last_error: null,
        });

        results.push({
          connection_id: conn.id,
          ok: true,
          upserted,
          photos_written,
          fetched_raw: rawProps.length,
        });
      } catch (e: any) {
        await markConnection(supabase, conn.id, {
          last_status_at: startedAt,
          last_error: e?.message ?? "IDX sync error",
        });

        results.push({ connection_id: conn.id, ok: false, error: e?.message ?? "IDX sync error" });
      }
    }

    return jsonResponse({ ok: true, dry_run: dryRun, count: results.length, results }, 200, origin);
  } catch (e: any) {
    return jsonResponse({ ok: false, error: e?.message ?? "Unhandled error" }, 500, origin);
  }
});
