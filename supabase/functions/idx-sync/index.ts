// supabase/functions/idx-sync/index.ts

// Generic IDX sync function for Hayvn-RE.
// - Reads idx_connections for each brokerage
// - For each connection, fetches listings (Active, Pending, limited Sold)
// - Upserts into mls_listings + mls_listing_photos
//
// Preferred IDX format for Hayvn-RE:
// - RESO Web API / OData "Property" endpoint
// - JSON responses
// - Authorization: Bearer <token> (stored in idx_connections.api_key)
//
// NOTE: Different MLSs may tweak field names. Once you see real CRMLS
// JSON, you can adjust mapResoPropertyToNormalized mappings.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type IdxStatus = "pending" | "live" | "disabled";

type IdxConnection = {
  id: string;
  brokerage_id: string;
  mls_name: string | null;
  connection_label: string | null;
  vendor_name: string | null;
  endpoint_url: string | null;
  username: string | null;
  password: string | null;
  api_key: string | null;
  notes: string | null;
  status: IdxStatus | null;
};

type NormalizedListing = {
  mls_number: string;
  mls_source: string | null;

  status: "active" | "pending" | "sold" | "other";
  list_date: string | null;      // ISO date ("YYYY-MM-DD")
  close_date: string | null;     // ISO date or null
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

  photos: {
    url: string;
    caption?: string | null;
    sort_order?: number | null;
  }[];

  raw_payload: unknown;
};

function getSupabaseClient(): SupabaseClient {
  const url = Deno.env.get("PROJECT_URL");
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!url || !serviceKey) {
    // Match the env var names you set with `supabase secrets set`
    throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY env vars");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
    },
  });
}

// Main handler
serve(async (req) => {
  const supabase = getSupabaseClient();

  try {
    const url = new URL(req.url);
    const connectionId = url.searchParams.get("connection_id");
    const dryRun = url.searchParams.get("dry_run") === "1";

    // 1) Load connections to sync
    const connections = await loadConnectionsToSync(supabase, connectionId);
    if (connections.length === 0) {
      return jsonResponse(
        { ok: true, message: "No IDX connections to sync", connectionId },
        200,
      );
    }

    const results: unknown[] = [];

    for (const conn of connections) {
      const res = await syncConnection({
        supabase,
        connection: conn,
        dryRun,
      });
      results.push(res);
    }

    return jsonResponse(
      {
        ok: true,
        dryRun,
        count: results.length,
        results,
      },
      200,
    );
  } catch (err) {
    console.error("idx-sync error:", err);
    return jsonResponse(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function loadConnectionsToSync(
  supabase: SupabaseClient,
  connectionId: string | null,
): Promise<IdxConnection[]> {
  let query = supabase
    .from("idx_connections")
    .select("*")
    .eq("status", "live" as IdxStatus);

  if (connectionId) {
    query = query.eq("id", connectionId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load idx_connections: ${error.message}`);
  }

  return (data || []) as IdxConnection[];
}

async function syncConnection(opts: {
  supabase: SupabaseClient;
  connection: IdxConnection;
  dryRun: boolean;
}) {
  const { supabase, connection, dryRun } = opts;
  const now = new Date().toISOString();

  console.log(
    `Syncing IDX connection ${connection.id} (brokerage ${connection.brokerage_id})`,
  );

  // 90-day Sold window
  const soldWindowDays = 90;

  try {
    // 2) Fetch listings from MLS/vendor (Hayvn preferred format: RESO Web API / Bearer)
    const listings = await fetchListingsForConnection(connection, {
      soldWindowDays,
    });

    if (dryRun) {
      console.log(
        `Dry run: fetched ${listings.length} listings for connection ${connection.id}`,
      );

      // For the UI "Test sync" button:
      // - We DO NOT change status
      // - We DO update last_status_at
      // - We clear last_error
      await markConnectionStatus(
        supabase,
        connection.id,
        connection.status, // keep whatever it was
        now,
        null,
      );

      return {
        connectionId: connection.id,
        dryRun: true,
        listingCount: listings.length,
      };
    }

    if (listings.length === 0) {
      console.log(`No listings returned for connection ${connection.id}`);
      await markConnectionStatus(
        supabase,
        connection.id,
        "live",
        now,
        null,
      );
      return {
        connectionId: connection.id,
        ok: true,
        listingCount: 0,
      };
    }

    // 3) Upsert listings + photos
    const { insertedOrUpdated, photoInserts } = await upsertListingsAndPhotos(
      supabase,
      connection,
      listings,
    );

    // 4) Update connection status
    await markConnectionStatus(
      supabase,
      connection.id,
      "live",
      now,
      null,
    );

    console.log(
      `IDX sync complete for connection ${connection.id}: ${insertedOrUpdated} listings, ${photoInserts} photos`,
    );

    return {
      connectionId: connection.id,
      ok: true,
      listingCount: listings.length,
      insertedOrUpdated,
      photoInserts,
    };
  } catch (err: any) {
    console.error(
      `Error during IDX sync for connection ${connection.id}:`,
      err,
    );

    const msg =
      err?.message || "Unknown error during IDX sync for this connection";

    // Record the error, but don't force status away from whatever it was
    await markConnectionStatus(
      supabase,
      connection.id,
      connection.status,
      now,
      msg,
    );

    return {
      connectionId: connection.id,
      ok: false,
      listingCount: 0,
      error: msg,
    };
  }
}

async function markConnectionStatus(
  supabase: SupabaseClient,
  connectionId: string,
  status: IdxStatus | null,
  lastStatusAt: string,
  lastError: string | null,
) {
  const { error } = await supabase
    .from("idx_connections")
    .update({
      status,
      last_status_at: lastStatusAt,
      last_error: lastError,
    })
    .eq("id", connectionId);

  if (error) {
    console.error(
      `Failed to update idx_connections status for ${connectionId}:`,
      error.message,
    );
  }
}

async function upsertListingsAndPhotos(
  supabase: SupabaseClient,
  connection: IdxConnection,
  listings: NormalizedListing[],
): Promise<{ insertedOrUpdated: number; photoInserts: number }> {
  if (listings.length === 0) {
    return { insertedOrUpdated: 0, photoInserts: 0 };
  }

  // 1) Upsert listings
  const listingRows = listings.map((l) => ({
    brokerage_id: connection.brokerage_id,
    idx_connection_id: connection.id,
    mls_number: l.mls_number,
    mls_source: l.mls_source || connection.mls_name || connection.vendor_name,

    status: l.status,
    list_date: l.list_date,
    close_date: l.close_date,
    status_last_changed_at: l.status_last_changed_at,

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

    last_seen_at: new Date().toISOString(),
  }));

  const { data: upserted, error: upsertError } = await supabase
    .from("mls_listings")
    .upsert(listingRows, {
      onConflict: "brokerage_id, mls_number",
    })
    .select("id, brokerage_id, mls_number");

  if (upsertError) {
    console.error("Upsert listings error:", upsertError.message);
    throw upsertError;
  }

  const listingIdMap = new Map<string, string>();
  (upserted || []).forEach((row: any) => {
    // key by brokerage_id + mls_number
    const key = `${row.brokerage_id}::${row.mls_number}`;
    listingIdMap.set(key, row.id);
  });

  // 2) Insert photos (simple approach: clear & reinsert by listing)
  let photoInserts = 0;

  for (const l of listings) {
    const key = `${connection.brokerage_id}::${l.mls_number}`;
    const listingId = listingIdMap.get(key);
    if (!listingId) continue;

    // Clear existing photos for this listing
    const { error: delErr } = await supabase
      .from("mls_listing_photos")
      .delete()
      .eq("listing_id", listingId);

    if (delErr) {
      console.error(
        "Delete listing photos error:",
        listingId,
        delErr.message,
      );
      // non-fatal
    }

    if (!l.photos || l.photos.length === 0) continue;

    const rows = l.photos.map((p, idx) => ({
      listing_id: listingId,
      url: p.url,
      caption: p.caption ?? null,
      sort_order:
        typeof p.sort_order === "number" ? p.sort_order : idx,
    }));

    const { error: insErr } = await supabase
      .from("mls_listing_photos")
      .insert(rows);

    if (insErr) {
      console.error(
        "Insert listing photos error:",
        listingId,
        insErr.message,
      );
      // non-fatal
    } else {
      photoInserts += rows.length;
    }
  }

  return {
    insertedOrUpdated: upserted?.length ?? 0,
    photoInserts,
  };
}

/**
 * Fetch listings from an IDX connection.
 *
 * For now, Hayvn-RE's preferred format is:
 * - RESO Web API / OData Property endpoint
 * - JSON response
 * - Bearer token stored in idx_connections.api_key
 *
 * Any connection with endpoint_url + api_key is treated as that.
 * Later, you can branch by adapter_key/vendor if you support more formats.
 */
async function fetchListingsForConnection(
  connection: IdxConnection,
  opts: { soldWindowDays: number },
): Promise<NormalizedListing[]> {
  const mlsName = (connection.mls_name || "").toLowerCase().trim();
  const vendor = (connection.vendor_name || "").toLowerCase().trim();

  console.log("fetchListingsForConnection()", {
    connectionId: connection.id,
    brokerage_id: connection.brokerage_id,
    mls_name: connection.mls_name,
    vendor_name: connection.vendor_name,
    endpoint_url: connection.endpoint_url,
    soldWindowDays: opts.soldWindowDays,
  });

  if (connection.endpoint_url && connection.api_key) {
    return await fetchResoBearerListings(connection, opts);
  }

  console.log(
    "No supported adapter for this connection yet (missing endpoint_url or api_key), returning empty list.",
  );
  return [];
}

/**
 * Hayvn-RE preferred IDX format:
 * - RESO Web API / OData "Property" endpoint
 * - JSON responses
 * - Authorization: Bearer <token> (stored in idx_connections.api_key)
 *
 * Example pattern:
 *   GET <endpoint_url>
 *     ?$filter=StandardStatus eq 'Active' or ...
 *     &$orderby=ModificationTimestamp desc
 *     &$top=500
 *   Authorization: Bearer <access_token>
 */
async function fetchResoBearerListings(
  connection: IdxConnection,
  opts: { soldWindowDays: number },
): Promise<NormalizedListing[]> {
  const baseUrl = connection.endpoint_url;
  const token = connection.api_key;

  if (!baseUrl || !token) {
    console.warn(
      "fetchResoBearerListings(): missing endpoint_url or api_key on connection",
      connection.id,
    );
    return [];
  }

  // Sold window
  const soldCutoff = new Date();
  soldCutoff.setDate(soldCutoff.getDate() - opts.soldWindowDays);
  const soldCutoffStr = soldCutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  // Filter:
  // - Active
  // - Pending
  // - Closed within last N days
  //
  // NOTE: Some RESO implementations need dates quoted, or use
  // CloseDateActual / CloseDateTime, etc. This is a first-pass
  // that you'll tweak when you see CRMLS's exact metadata.
  const filterExpr =
    "(" +
    "StandardStatus eq 'Active'" +
    " or StandardStatus eq 'Pending'" +
    ` or (StandardStatus eq 'Closed' and CloseDate ge ${soldCutoffStr})` +
    ")";

  // Basic first-version strategy:
  // - Pull up to 500 records ordered by ModificationTimestamp.
  // - Later you can follow @odata.nextLink for more pages.
  const url = new URL(baseUrl);
  url.searchParams.set("$filter", filterExpr);
  url.searchParams.set("$orderby", "ModificationTimestamp desc");
  url.searchParams.set("$top", "500");

  console.log("fetchResoBearerListings(): requesting URL", url.toString());

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      "fetchResoBearerListings(): HTTP error",
      res.status,
      res.statusText,
      text,
    );
    // Non-fatal: return [] so the connection doesn't poison the entire sync.
    return [];
  }

  const body = await res.json().catch((err) => {
    console.error("fetchResoBearerListings(): JSON parse error", err);
    return null;
  });

  if (!body || !Array.isArray((body as any).value)) {
    console.warn(
      "fetchResoBearerListings(): response missing 'value' array",
      body,
    );
    return [];
  }

  const records: any[] = (body as any).value;

  const listings: NormalizedListing[] = [];
  const mlsSource =
    connection.mls_name || connection.vendor_name || connection.endpoint_url;

  for (const record of records) {
    const mapped = mapResoPropertyToNormalized(record, mlsSource);
    if (mapped) listings.push(mapped);
  }

  console.log(
    `fetchResoBearerListings(): mapped ${listings.length} listings for connection ${connection.id}`,
  );

  return listings;
}

/**
 * Map a RESO Web API "Property" record into your NormalizedListing shape.
 *
 * NOTE: Field names here follow typical RESO Data Dictionary conventions.
 * Once you see your actual CRMLS metadata / sample JSON, you can adjust
 * the mappings (CloseDate vs CloseDateActual, etc).
 */
function mapResoPropertyToNormalized(
  record: any,
  mlsSource: string | null,
): NormalizedListing | null {
  // Choose some reasonable fallback chain for the MLS number
  const mlsNumber: string | null =
    record.ListingId ??
    record.ListingKey ??
    (record.ListingKeyNumeric != null
      ? String(record.ListingKeyNumeric)
      : null);

  if (!mlsNumber) {
    console.warn("mapResoPropertyToNormalized(): missing ListingId/ListingKey");
    return null;
  }

  const statusRaw: string | null =
    record.StandardStatus ??
    record.MlsStatus ??
    null;

  const status = normalizeResoStatus(statusRaw);

  const toNumber = (val: unknown): number | null => {
    if (val == null) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  };

  const normalized: NormalizedListing = {
    mls_number: mlsNumber,
    mls_source: mlsSource,

    status,
    list_date:
      record.ListingContractDate ??
      record.OnMarketDate ??
      null,
    close_date:
      record.CloseDate ??
      record.CloseDateActual ??
      null,
    status_last_changed_at:
      record.ModificationTimestamp ??
      null,

    property_type: record.PropertyType ?? null,
    listing_title: null, // many feeds don't have a distinct "title"
    description:
      record.PublicRemarks ??
      record.PrivateRemarks ??
      null,

    list_price: toNumber(record.ListPrice),
    original_list_price: toNumber(record.OriginalListPrice),
    close_price: toNumber(record.ClosePrice),

    beds: toNumber(record.BedroomsTotal),
    baths: toNumber(record.BathroomsTotalInteger),
    sqft:
      toNumber(record.LivingArea) ??
      toNumber(record.BuildingAreaTotal),
    lot_sqft: toNumber(record.LotSizeSquareFeet),
    year_built: toNumber(record.YearBuilt),

    street_number: record.StreetNumber ?? null,
    street_dir_prefix: record.StreetDirPrefix ?? null,
    street_name: record.StreetName ?? null,
    street_suffix: record.StreetSuffix ?? null,
    unit: record.UnitNumber ?? null,
    city: record.City ?? null,
    state: record.StateOrProvince ?? null,
    postal_code: record.PostalCode ?? null,
    county: record.CountyOrParish ?? null,

    latitude: toNumber(record.Latitude),
    longitude: toNumber(record.Longitude),

    // For now we are not pulling Media here.
    // Later you can use $expand=Media and map it into photos.
    photos: [],

    raw_payload: record,
  };

  return normalized;
}

function normalizeResoStatus(statusRaw: string | null): NormalizedListing["status"] {
  if (!statusRaw) return "other";

  const s = statusRaw.toLowerCase();

  if (
    s === "active" ||
    s === "comingsoon" ||
    s === "coming soon" ||
    s === "activeundercontract" ||
    s === "active under contract"
  ) {
    return "active";
  }

  if (
    s === "pending" ||
    s === "hold" ||
    s === "undercontract" ||
    s === "under contract"
  ) {
    return "pending";
  }

  if (s === "closed" || s === "sold") {
    return "sold";
  }

  return "other";
}
