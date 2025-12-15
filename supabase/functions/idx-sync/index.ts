function corsHeaders(origin: string | null) {
  const allowOrigin = origin ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
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

serve(async (req) => {
  const origin = req.headers.get("origin");

  // ✅ Preflight must succeed fast (no auth, no network calls)
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const supabase = getSupabaseAdmin();

  try {
    const url = new URL(req.url);
    const connectionId = url.searchParams.get("connection_id");
    const dryRun = url.searchParams.get("dry_run") === "1";

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

        // NOTE: MLSListings enforces $top <= 300
        const raw = await fetchResoVowUniverse(conn, { top: 300, maxPages: 20 });

        const mlsSource = conn.mls_name || conn.vendor_name || conn.endpoint_url;
        const normalized: NormalizedListing[] = raw
          .map((r) => mapResoPropertyToNormalized(r, mlsSource))
          .filter(Boolean) as NormalizedListing[];

        if (dryRun) {
          results.push({ connection_id: conn.id, ok: true, dry_run: true, fetched_raw: raw.length, normalized: normalized.length });
          await markConnection(supabase, conn.id, { last_status_at: startedAt, last_error: null });
          continue;
        }

        const { upserted } = await upsertListings(supabase, conn, normalized);

        await markConnection(supabase, conn.id, { status: "live", last_status_at: startedAt, last_error: null });

        results.push({ connection_id: conn.id, ok: true, fetched_raw: raw.length, normalized: normalized.length, upserted });
      } catch (e: any) {
        await markConnection(supabase, conn.id, { last_status_at: startedAt, last_error: e?.message ?? "IDX sync error" });
        results.push({ connection_id: conn.id, ok: false, error: e?.message ?? "IDX sync error" });
      }
    }

    return jsonResponse({ ok: true, dry_run: dryRun, count: results.length, results }, 200, origin);
  } catch (e: any) {
    return jsonResponse({ ok: false, error: e?.message ?? "Unhandled error" }, 500, origin);
  }
});


