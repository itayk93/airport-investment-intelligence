// Thin PostgREST client — same reasoning as ingest.mjs: no Postgres driver dependency,
// service key bypasses RLS, plain fetch().
export function makeDb(supabaseUrl, serviceKey) {
  // PostgREST caps a response at its configured max-rows (1000 on Supabase) and says so
  // only in the Content-Range header — the body is a perfectly valid JSON array of the
  // first 1000 rows. A caller that just reads the body gets a silently partial answer, and
  // for a scoring average that is worse than an error: chunking by 80 airports over a
  // 24-month window asks for 1,920 rows, so 34 of those 80 airports came back with no
  // months at all and the rest were fine, which looks exactly like sparse coverage.
  // Every read here pages until the server stops returning a full page.
  const PAGE = 1000;
  async function get(table, query) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      // Paging an unordered query is not just untidy, it is wrong: PostgREST hands the
      // range to Postgres, which is free to return rows in a different order per request,
      // so page 2 can repeat rows from page 1 and omit others entirely. That produced
      // airports with 11 of 24 months and a capacity-pressure average over whichever
      // months happened to survive. Every query that can exceed one page must sort.
      if (offset > 0 && !/(^|&)order=/.test(query)) {
        throw new Error(`GET ${table}: result exceeds one page and the query has no order= clause`);
      }
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          // Range beats limit/offset in the query string: it composes with whatever
          // filters and ordering the caller already put there.
          Range: `${offset}-${offset + PAGE - 1}`,
          'Range-Unit': 'items',
        },
      });
      if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
      const page = await res.json();
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  async function insert(table, rows) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`INSERT ${table} failed: ${res.status} ${await res.text()}`);
  }

  /**
   * Update named columns on the rows a filter selects. Used instead of an upsert when only
   * some columns are being written: a PostgREST upsert replaces the whole row, which would
   * blank every column the caller did not supply.
   */
  async function patch(table, query, values) {
    if (!query) throw new Error('patch() requires a filter — refusing to update a whole table');
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(`PATCH ${table} failed: ${res.status} ${await res.text()}`);
  }

  /** PostgREST requires a filter on DELETE — callers must pass one, never a bare table. */
  async function remove(table, query) {
    if (!query) throw new Error('remove() requires a filter — refusing to delete a whole table');
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=minimal',
      },
    });
    if (!res.ok) throw new Error(`DELETE ${table} failed: ${res.status} ${await res.text()}`);
  }

  return { get, insert, patch, remove };
}
