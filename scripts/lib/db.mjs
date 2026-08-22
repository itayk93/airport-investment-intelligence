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

  return { get, insert };
}
