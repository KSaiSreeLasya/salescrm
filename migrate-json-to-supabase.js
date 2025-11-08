/*
Migration script: migrate server/data JSON files into Supabase via REST
Usage:
  SUPABASE_URL="https://<project>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
  node migrate-json-to-supabase.js
Runs from repository root and reads server/data/{leads.json,salespersons.json,config.json}
*/

import fs from 'fs/promises';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

function supabaseUrl(table, q = ''){
  return `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/${table}${q}`;
}

async function postJson(url, body){
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
    const t = await res.text().catch(()=>'<no body>');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
  return res.json().catch(()=>null);
}

async function readJsonIfExists(rel){
  const p = path.join(process.cwd(), rel);
  try{
    const txt = await fs.readFile(p, 'utf8');
    return JSON.parse(txt);
  }catch(e){
    return null;
  }
}

function chunkArray(arr, size){
  const out = [];
  for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size));
  return out;
}

async function migrateSales(){
  const data = await readJsonIfExists('server/data/salespersons.json');
  if (!data || !Array.isArray(data) || data.length===0){
    console.log('No salespersons.json data found, skipping');
    return;
  }
  const url = supabaseUrl('salespersons','?on_conflict=id');
  // batch upserts in chunks
  for (const chunk of chunkArray(data, 100)){
    const body = chunk.map(s=>({
      id: s.id,
      name: s.name,
      email: s.email ?? null,
      active: !!s.active,
      created_at: s.createdAt || new Date().toISOString()
    }));
    await postJson(url, body);
    console.log(`Upserted ${body.length} salespersons`);
  }
}

async function migrateLeads(){
  const data = await readJsonIfExists('server/data/leads.json');
  if (!data || !Array.isArray(data) || data.length===0){
    console.log('No leads.json data found, skipping');
    return;
  }
  const url = supabaseUrl('leads','?on_conflict=id');
  for (const chunk of chunkArray(data, 100)){
    const body = chunk.map(l=>({
      id: l.id,
      fields: l.fields || {},
      name: l.name || null,
      email: l.email || null,
      phone: l.phone || null,
      company: l.company || null,
      source: l.source || null,
      status: l.status || null,
      owner_id: l.ownerId || null,
      notes: l.notes || null,
      created_at: l.createdAt || new Date().toISOString(),
      updated_at: l.updatedAt || new Date().toISOString()
    }));
    await postJson(url, body);
    console.log(`Upserted ${body.length} leads`);
  }
}

async function migrateConfig(){
  const data = await readJsonIfExists('server/data/config.json');
  if (!data){
    console.log('No config.json found, skipping');
    return;
  }
  const url = supabaseUrl('config','?on_conflict=id');
  const body = [{ id: 1, sheet_url: data.sheetUrl ?? null, last_sync_at: data.lastSyncAt ?? null, headers: data.headers ?? null }];
  await postJson(url, body);
  console.log('Upserted config');
}

(async ()=>{
  try{
    console.log('Starting migration to Supabase...');
    await migrateSales();
    await migrateLeads();
    await migrateConfig();
    console.log('Migration completed successfully');
    process.exit(0);
  }catch(err){
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
