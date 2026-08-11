const SB_URL = 'https://zsoipevhkyttxoydifma.supabase.co/rest/v1';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpzb2lwZXZoa3l0dHhveWRpZm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTk3NjUsImV4cCI6MjEwMTk5NTc2NX0._TLv-SLXyyL1xojYIk3IhvrLELe6gLQEiBWJ1Ffp1uQ';
const HDR  = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

export async function sbSelect(table, query = '') {
  const res = await fetch(`${SB_URL}/${table}${query}`, { headers: HDR });
  if (!res.ok) { const e = await res.json(); console.error(`GET ${table}:`, e); return []; }
  return res.json();
}

export async function sbUpsert(table, data) {
  const res = await fetch(`${SB_URL}/${table}`, {
    method: 'POST',
    headers: { ...HDR, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(Array.isArray(data) ? data : [data]),
  });
  if (!res.ok) { const e = await res.json(); console.error(`UPSERT ${table}:`, e); }
}

export async function sbDelete(table, column, value) {
  const res = await fetch(`${SB_URL}/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: HDR,
  });
  if (!res.ok) { const e = await res.json(); console.error(`DELETE ${table}:`, e); }
}
