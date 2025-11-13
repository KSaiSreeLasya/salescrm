import fs from 'fs/promises';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

async function supabaseFetch(path, opts = {}) {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
  opts.headers = { ...(opts.headers || {}), ...headers };
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>');
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res;
}

async function deleteAllLeads() {
  try {
    console.log('Deleting all leads from Supabase...');
    const res = await supabaseFetch('leads', { method: 'DELETE' });
    console.log('✓ All leads deleted');
  } catch (e) {
    console.log('Note: Delete all may not be supported, trying alternative approach...');
  }
}

async function readJsonIfExists(rel) {
  const p = path.join(process.cwd(), rel);
  try {
    const txt = await fs.readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

async function insertLeads() {
  const data = await readJsonIfExists('server/data/leads.json');
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log('No leads.json data found');
    return;
  }

  console.log(`Inserting ${data.length} leads...`);
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/leads`;
  
  for (let i = 0; i < data.length; i += 50) {
    const chunk = data.slice(i, i + 50);
    const body = chunk.map(l => ({
      id: l.id,
      fields: l.fields || {},
      name: l.name || null,
      email: l.email || null,
      phone: l.phone || null,
      company: l.company || null,
      source: l.source || null,
      status: l.status || 'new',
      owner_id: l.ownerId || null,
      notes: l.notes || null,
      created_at: l.createdAt,
      updated_at: l.updatedAt
    }));

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase ${res.status}: ${text}`);
      }

      console.log(`✓ Inserted ${Math.min(50, data.length - i)} leads (${i + Math.min(50, data.length - i)}/${data.length})`);
    } catch (e) {
      console.error(`Error inserting chunk at offset ${i}:`, e.message);
      throw e;
    }
  }

  console.log(`\n✅ Successfully inserted ${data.length} cleaned leads to Supabase`);
}

(async () => {
  try {
    await deleteAllLeads();
    await insertLeads();
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
