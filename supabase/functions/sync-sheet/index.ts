export default async function handler(req: Request) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !KEY) return new Response('Missing env', { status: 500 });

  // 1) read config row to get sheet URL
  const cfgRes = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/config?id=eq.1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!cfgRes.ok) return new Response(`Failed to read config: ${cfgRes.status}`, { status: 502 });
  const cfgArr = await cfgRes.json();
  const cfg = (cfgArr && cfgArr[0]) || {};
  const sheetUrl = cfg.sheet_url;
  if (!sheetUrl) return new Response('No sheet_url configured', { status: 400 });

  // 2) fetch CSV
  const csvRes = await fetch(sheetUrl);
  if (!csvRes.ok) return new Response(`Failed to fetch sheet: ${csvRes.status}`, { status: 502 });
  const csvText = await csvRes.text();

  // 3) parse CSV into rows
  const parsed = parseCSV(csvText);
  const rows = parsed.rows; // array of objects
  const headers = parsed.headers || [];

  if (!rows.length) {
    // update last_sync_at anyway
    await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/config?id=eq.1`, {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_sync_at: new Date().toISOString(), headers }),
    });
    return new Response('No rows found', { status: 200 });
  }

  // 4) prepare payload: upsert leads in batches
  function normalizePhone(p) {
    return (p || '').toString().replace(/[^\d+]/g, '');
  }
  function ensureId(r) {
    return r.id || crypto.randomUUID();
  }

  const chunks = chunk(rows, 100);
  for (const chunkRows of chunks) {
    const payload = chunkRows.map((r) => {
      const id = ensureId(r);
      const fields = { ...r };
      delete fields.id;
      return {
        id,
        fields,
        name: r['Full Name'] || r['Name'] || null,
        email: r['Email'] || null,
        phone: r['Phone'] || r['phone'] || null,
        company: r['Company'] || null,
        source: r['Source'] || null,
        status: (r['Lead Status'] || r['Status'] || 'new'),
        owner_id: null,
        notes: r['Notes'] || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    const upsertRes = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/leads?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });

    if (!upsertRes.ok) {
      const txt = await upsertRes.text().catch(() => '');
      return new Response(`Upsert failed: ${upsertRes.status} ${txt}`, { status: 502 });
    }
  }

  // 5) update config last_sync_at and headers
  await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/config?id=eq.1`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ last_sync_at: new Date().toISOString(), headers }),
  });

  return new Response('ok', { status: 200 });
}

function chunk(arr, size){
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Basic CSV parser: returns headers array and rows as objects
function parseCSV(text){
  const rows = [];
  let cur = '';
  let inQuotes = false;
  const arr = [];
  function pushCell(){ arr.push(inQuotes ? cur.replace(/""/g,'"') : cur); cur=''; inQuotes=false; }
  for (let i=0;i<text.length;i++){
    const ch = text[i];
    if (inQuotes){
      if (ch === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') pushCell();
      else if (ch === '\n') { pushCell(); rows.push([...arr]); arr.length = 0; }
      else if (ch === '\r') {}
      else cur += ch;
    }
  }
  // flush
  pushCell(); rows.push([...arr]);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const out = [];
  for (let i=1;i<rows.length;i++){
    const row = rows[i];
    if (row.every(c => (c||'').trim() === '')) continue;
    const obj = {};
    for (let j=0;j<headers.length;j++) obj[headers[j]] = (row[j] ?? '').trim();
    out.push(obj);
  }
  return { headers, rows: out };
}
