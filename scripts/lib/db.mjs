// Thin PostgREST client — same reasoning as ingest.mjs: no Postgres driver dependency,
// service key bypasses RLS, plain fetch().
export function makeDb(supabaseUrl, serviceKey) {
  async function get(table, query) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
    return res.json();
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
