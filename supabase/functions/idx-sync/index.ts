// supabase/functions/idx-sync/index.ts


// Generic IDX sync function for Hayvn-RE.
// - Reads idx_connections for each brokerage
// - For each connection, fetches listings (Active, Pending, limited Sold)
// - Upserts into mls_listings + mls_listing_photos
//
// NOTE: You still need to implement `fetchListingsForConnection`
// for each MLS/vendor you support.

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
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
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
        { message: "No IDX connections to sync", connectionId },
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

  // 2) Fetch listings from MLS/vendor (you implement this)
  const listings = await fetchListingsForConnection(connection, {
    soldWindowDays,
  });

  if (dryRun) {
    console.log(
      `Dry run: fetched ${listings.length} listings for connection ${connection.id}`,
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
}

async function markConnectionStatus(
  supabase: SupabaseClient,
  connectionId: string,
  status: IdxStatus,
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
 * Stub: Fetch listings from a specific MLS/vendor.
 *
 * For now, this just returns an empty list. When you integrate CRMLS (or any other
 * MLS), you plug their API / RETS / RESO Web API here and normalize to NormalizedListing.
 */
async function fetchListingsForConnection(
  connection: IdxConnection,
  opts: { soldWindowDays: number },
): Promise<NormalizedListing[]> {
  console.log(
    "fetchListingsForConnection stub called for connection:",
    connection.id,
    "mls_name:",
    connection.mls_name,
    "vendor:",
    connection.vendor_name,
    "soldWindowDays:",
    opts.soldWindowDays,
  );

  // TODO: implement MLS-specific fetching here.
  // Example shape:
  // - Fetch Active + Pending
  // - Fetch Sold where close_date >= now() - soldWindowDays
  // - Normalize each listing to the NormalizedListing type.

  return [];
}
