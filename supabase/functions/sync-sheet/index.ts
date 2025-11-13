export default async function handler(req: Request) {
  const SUPABASE_URL = Deno.env.get('SB_URL');
  const KEY = Deno.env.get('SB_KEY');
  const SYNC_TOKEN = Deno.env.get('SYNC_TOKEN'); // optional secret to protect function

  if (!SUPABASE_URL || !KEY) return new Response('Missing env', { status: 500 });

  // Optional: verify simple token header to avoid public abuse
  try {
    const headerToken = req.headers.get('x-sync-token') || req.headers.get('x-api-key') || null;
    if (SYNC_TOKEN && SYNC_TOKEN.length > 0) {
      if (!headerToken || headerToken !== SYNC_TOKEN) return new Response('Unauthorized', { status: 401 });
    }
  } catch (e) {
    // ignore
  }

  // allow override via POST body { sheet_url }
  let sheetUrl: string | undefined;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    // accept both camel and snake
    sheetUrl = (body?.sheet_url as string) || (body?.sheetUrl as string) || undefined;
  } catch (e) {
    // ignore
  }

  // if not provided in body, read from config row in Supabase
  if (!sheetUrl) {
    const cfgRes = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/config?id=eq.1`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!cfgRes.ok) return new Response(`Failed to read config: ${cfgRes.status}`, { status: 502 });
    const cfgArr = await cfgRes.json().catch(() => []);
    const cfg = (cfgArr && cfgArr[0]) || {};
    sheetUrl = (cfg as any).sheet_url || (cfg as any).sheetUrl || undefined;
  }

  if (!sheetUrl) return new Response('No sheet_url configured', { status: 400 });

  // fetch CSV from sheetUrl
  const csvRes = await fetch(sheetUrl);
  if (!csvRes.ok) return new Response(`Failed to fetch sheet: ${csvRes.status}`, { status: 502 });
  const csvText = await csvRes.text();

  // Basic CSV parser: returns headers array and rows as objects
  function parseCSV(text: string) {
    const rows: string[][] = [];
    let cur = '';
    let inQuotes = false;
    const arr: string[] = [];
    function pushCell() {
      arr.push(inQuotes ? cur.replace(/""/g, '"') : cur);
      cur = '';
      inQuotes = false;
    }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') pushCell();
        else if (ch === '\n') {
          pushCell();
          rows.push([...arr]);
          arr.length = 0;
        } else if (ch === '\r') {
          // ignore
        } else cur += ch;
      }
    }
    pushCell();
    rows.push([...arr]);
    if (rows.length === 0) return { headers: [], rows: [] as Record<string, string>[] };
    const headers = rows[0].map((h) => h.trim());
    const out: Record<string, string>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.every((c) => (c || '').trim() === '')) continue;
      const obj: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) obj[headers[j]] = (row[j] ?? '').trim();
      out.push(obj);
    }
    return { headers, rows: out };
  }

  function chunk<T>(arr: T[], size: number) {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function ensureId(r: Record<string, string>) {
    // Use crypto.randomUUID if available, fallback to random bytes
    // @ts-ignore
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') return (crypto as any).randomUUID();
    // Web Crypto fallback
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

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

  // prepare payload and upsert in chunks
  for (const chunkRows of chunk(rows, 100)) {
    const payload = chunkRows.map((r) => {
      const id = ensureId(r);
      const fields = { ...r };
      delete fields.id;
      return {
        id,
        fields,
        name: (r as any)['Full Name'] || (r as any)['Name'] || null,
        email: (r as any)['Email'] || null,
        phone: (r as any)['Phone'] || (r as any)['phone'] || null,
        company: (r as any)['Company'] || null,
        source: (r as any)['Source'] || null,
        status: (r as any)['Lead Status'] || (r as any)['Status'] || 'new',
        owner_id: null,
        notes: (r as any)['Notes'] || null,
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

  // update config last_sync_at and headers
  await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/config?id=eq.1`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ last_sync_at: new Date().toISOString(), headers }),
  });

  return new Response('ok', { status: 200 });
}
