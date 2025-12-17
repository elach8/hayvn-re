// supabase/functions/idx-sync/index.ts
// IDX sync for Hayvn-RE (MLSListings Web API - VOW, RESO OData).
// - Syncs Property per live idx_connection
// - Upserts into mls_listings keyed by (brokerage_id, mls_number)
// - Optionally fetches photos PER LISTING via /Media + ResourceRecordKeyNumeric (MLSListings compatible)
// - Supports photos_only=1 to backfill photos for listings already in DB (no Property fetch/upsert)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

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
  raw_payload: any;
};

type UpsertedListingRow = {
  id: string; // mls_listings.id
  mls_number: string;
  raw_payload: any;
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

/** Keep your normalization so mls_listings_status_check passes */
function normalizeStatus(raw: unknown): NormalizedListing["status"] {
  const s = String(raw ?? "").toLowerCase().trim();

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

async function fetchResoEntity(
  conn: IdxConnection,
  entity: "Property" | "Media",
  opts: { top: number; maxPages: number; filter?: string }
) {
  const endpointUrl = conn.endpoint_url;
  const token = conn.api_key;

  if (!endpointUrl || !token) {
    throw new Error(`idx_connection ${conn.id} missing endpoint_url or api_key`);
  }

  const base = entity === "Property"
    ? toPropertyEndpoint(endpointUrl)
    : toMediaEndpoint(endpointUrl);

  const safeTop = Math.min(300, Math.max(1, opts.top));

  const all: any[] = [];
  let skip = 0;

  for (let page = 0; page < opts.maxPages; page++) {
    const url = new URL(base);
    url.searchParams.set("$orderby", "ModificationTimestamp desc");
    url.searchParams.set("$top", String(safeTop));
    url.searchParams.set("$skip", String(skip));
    if (opts.filter) url.searchParams.set("$filter", opts.filter);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (entity === "Media") {
        throw new Error(`MLS Media HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
      }
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

/** IMPORTANT: upsert conflict target matches your UNIQUE(brokerage_id, mls_number) */
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
    .upsert(rows, { onConflict: "brokerage_id,mls_number" })
    .select("id, mls_number, raw_payload");

  if (error) {
    throw new Error(`Upsert mls_listings failed: ${error.message}`);
  }

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

/** MLSListings: Media.ResourceRecordKeyNumeric === Property.ListingKeyNumeric */
function deriveMediaLinkValue(listingRaw: any): { field: string; value: string } | null {
  const vNumeric =
    listingRaw?.ListingKeyNumeric ?? // MUST be first
    listingRaw?.SourceSystemKey ??   // fallback only
    null;

  if (vNumeric != null && String(vNumeric).trim()) {
    return { field: "ResourceRecordKeyNumeric", value: String(vNumeric).trim() };
  }

  const vId =
    listingRaw?.ResourceRecordID ??
    listingRaw?.OriginatingSystemKey ??
    null;

  if (vId != null && String(vId).trim()) {
    return { field: "ResourceRecordID", value: String(vId).trim() };
  }

  return null;
}

async function writePhotosPerListing(
  supabase: SupabaseClient,
  conn: IdxConnection,
  listingRows: UpsertedListingRow[],
  knobs: { top: number; mediaPages: number; photoListingLimit: number }
): Promise<{ photos_written: number; listings_with_media: number; media_calls: number }> {
  let photos_written = 0;
  let listings_with_media = 0;
  let media_calls = 0;

  const slice = listingRows.slice(0, knobs.photoListingLimit);

  for (const lr of slice) {
    const link = deriveMediaLinkValue(lr.raw_payload);
    if (!link) continue;

    media_calls++;

    const isNumeric = link.field === "ResourceRecordKeyNumeric";
    const filterValue = isNumeric ? link.value : `'${String(link.value).replace(/'/g, "''")}'`;
    const filter = `${link.field} eq ${filterValue}`;

    const media = await fetchResoEntity(conn, "Media", {
      top: knobs.top,
      maxPages: knobs.mediaPages,
      filter,
    });

    if (!Array.isArray(media) || media.length === 0) continue;

    listings_with_media++;

    const { error: delErr } = await supabase
      .from("mls_listing_photos")
      .delete()
      .eq("listing_id", lr.id);

    if (delErr) throw new Error(`Delete photos failed: ${delErr.message}`);

    media.sort((a, b) => (extractMediaOrder(a) ?? 999999) - (extractMediaOrder(b) ?? 999999));

    const rows = media
      .map((m: any, idx: number) => {
        const url = extractMediaUrl(m);
        if (!url) return null;
        return {
          listing_id: lr.id,
          sort_order: extractMediaOrder(m) ?? idx,
          url,
          caption: extractMediaCaption(m),
        };
      })
      .filter(Boolean) as { listing_id: string; sort_order: number; url: string; caption: string | null }[];

    if (rows.length === 0) continue;

    const { error: insErr } = await supabase.from("mls_listing_photos").insert(rows);
    if (insErr) throw new Error(`Insert photos failed: ${insErr.message}`);

    photos_written += rows.length;
  }

  return { photos_written, listings_with_media, media_calls };
}

/** Photos-only backfill: load existing listings from DB (already ingested) */
/** Photos-only backfill: load ONLY listings that currently have zero photos */
/** Photos-only backfill: prioritize listings used by matches (property_recommendations) */
async function loadExistingListingsForPhotoBackfill(
  supabase: SupabaseClient,
  conn: IdxConnection,
  limit: number
): Promise<UpsertedListingRow[]> {
  // 1) Pull recent recs for this brokerage (via clients join)
  const { data: recs, error: recErr } = await supabase
    .from("property_recommendations")
    .select("mls_listing_id, created_at, clients!inner(brokerage_id)")
    .eq("clients.brokerage_id", conn.brokerage_id)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 5, 500)); // pull more so we can filter missing

  if (recErr) throw new Error(`Load recommendations for photo backfill failed: ${recErr.message}`);

  const listingIds = Array.from(
    new Set((recs ?? []).map((r: any) => r.mls_listing_id).filter(Boolean))
  ).slice(0, Math.max(limit * 5, 500));

  if (listingIds.length === 0) return [];

  // 2) Find which of those already have at least 1 photo
  const { data: photoRows, error: photoErr } = await supabase
    .from("mls_listing_photos")
    .select("listing_id")
    .in("listing_id", listingIds)
    .limit(100000);

  if (photoErr) throw new Error(`Load existing photos failed: ${photoErr.message}`);

  const hasPhoto = new Set((photoRows ?? []).map((p: any) => p.listing_id));

  // 3) Keep only listing_ids that currently have 0 photos
  const missingIds = listingIds.filter((id) => !hasPhoto.has(id)).slice(0, limit);

  if (missingIds.length === 0) return [];

  // 4) Load listing rows we will backfill
  const { data: listings, error: listErr } = await supabase
    .from("mls_listings")
    .select("id, mls_number, raw_payload")
    .in("id", missingIds);

  if (listErr) throw new Error(`Load listings missing photos failed: ${listErr.message}`);

  return (listings ?? []) as UpsertedListingRow[];
}



async function markConnection(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("idx_connections").update(patch).eq("id", id);
  if (error) console.error("Failed to update idx_connections:", id, error.message);
}

Deno.serve(async (req: Request) => {
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
    const photosOnly = url.searchParams.get("photos_only") === "1";

    // knobs (safe defaults)
    const top = Math.min(300, Math.max(1, Number(url.searchParams.get("top") ?? "100")));
    const propPages = Math.max(1, Number(url.searchParams.get("prop_pages") ?? "1"));
    const mediaPages = Math.max(1, Number(url.searchParams.get("media_pages") ?? "1"));
    const photoListingLimit = Math.max(1, Number(url.searchParams.get("photo_listing_limit") ?? "30"));

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

        // --- photos_only mode: skip Property fetch/upsert ---
        if (photosOnly) {
          if (!includePhotos) {
            results.push({
              connection_id: conn.id,
              ok: true,
              photos_only: true,
              include_photos: false,
              message: "photos_only=1 but include_photos=0; nothing to do",
              knobs: { top, propPages, mediaPages, photoListingLimit },
            });
            continue;
          }

          const existing = await loadExistingListingsForPhotoBackfill(supabase, conn, photoListingLimit);

          const photoRes = await writePhotosPerListing(
            supabase,
            conn,
            existing,
            { top: 300, mediaPages, photoListingLimit }
          );

          results.push({
            connection_id: conn.id,
            ok: true,
            photos_only: true,
            upserted: 0,
            photos_written: photoRes.photos_written,
            listings_with_media: photoRes.listings_with_media,
            media_calls: photoRes.media_calls,
            fetched_raw: 0,
            knobs: { top, propPages, mediaPages, photoListingLimit },
          });

          continue;
        }

        // --- Normal Property ingest ---
        const rawProps = await fetchResoEntity(conn, "Property", { top, maxPages: propPages });
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
            knobs: { top, propPages, mediaPages, photoListingLimit },
          });
          await markConnection(supabase, conn.id, { last_status_at: startedAt, last_error: null });
          continue;
        }

        const { upserted, rows: upsertedRows } = await upsertListings(supabase, conn, normalized);

        let photos_written = 0;
        let listings_with_media = 0;
        let media_calls = 0;

        if (includePhotos && upsertedRows.length > 0) {
          const photoRes = await writePhotosPerListing(
            supabase,
            conn,
            upsertedRows,
            { top: 300, mediaPages, photoListingLimit }
          );
          photos_written = photoRes.photos_written;
          listings_with_media = photoRes.listings_with_media;
          media_calls = photoRes.media_calls;
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
          listings_with_media,
          media_calls,
          fetched_raw: rawProps.length,
          knobs: { top, propPages, mediaPages, photoListingLimit },
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

