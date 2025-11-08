/* Patch config row id=1 in Supabase from server/data/config.json
Usage: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env
Run: node patch-config-to-supabase.js
*/

import fs from 'fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function main(){
  const txt = await fs.readFile(new URL('server/data/config.json', import.meta.url), 'utf8');
  const cfg = JSON.parse(txt);
  const body = { sheet_url: cfg.sheetUrl ?? null, last_sync_at: cfg.lastSyncAt ?? null, headers: cfg.headers ?? null };
  const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/config?id=eq.1`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('Patch failed', await res.text());
    process.exit(1);
  }
  console.log('Config patched');
}

main().catch(e=>{console.error(e); process.exit(1)});
