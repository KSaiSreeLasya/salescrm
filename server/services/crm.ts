import { readJSON, writeJSON } from "../utils/storage";
import { randomUUID } from "crypto";
import type { Lead, LeadStatus, Salesperson, ConfigState } from "@shared/api";

export interface CRMState {
  leads: Lead[];
  salespersons: Salesperson[];
  config: ConfigState;
}

const DEFAULT_STATE: CRMState = {
  leads: [],
  salespersons: [],
  config: {
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/1QY8_Q8-ybLKNVs4hynPZslZDwUfC-PIJrViJfL0-tpM/export?format=csv",
    lastSyncAt: undefined,
  },
};

const FILE_LEADS = "leads.json";
const FILE_SALESPERSONS = "salespersons.json";
const FILE_CONFIG = "config.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function hasSupabase() {
  return !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE;
}

async function supabaseFetch(path: string, opts: RequestInit = {}) {
  const url = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE || "",
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE || ""}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  opts.headers = { ...(opts.headers || {}), ...headers } as any;
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  return res;
}

async function supabaseListLeads(): Promise<Lead[]> {
  const res = await supabaseFetch("leads?select=*&order=created_at.desc");
  const data = await res.json();
  // ensure types
  return (data || []).map((d: any) => ({
    id: d.id,
    fields: d.fields || {},
    name: d.name,
    email: d.email || undefined,
    phone: d.phone || undefined,
    company: d.company || undefined,
    source: d.source || undefined,
    status: d.status || "new",
    ownerId: d.owner_id || null,
    notes: d.notes || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));
}

async function supabaseGetSalespersons(): Promise<Salesperson[]> {
  const res = await supabaseFetch("salespersons?select=*&order=name.asc");
  const data = await res.json();
  return (data || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    email: d.email || undefined,
    active: !!d.active,
    createdAt: d.created_at,
  }));
}

async function supabaseGetConfig(): Promise<ConfigState> {
  try {
    const res = await supabaseFetch("config?select=*&limit=1");
    const data = await res.json();
    const row = (data && data[0]) || {};
    return {
      sheetUrl: row.sheet_url || undefined,
      lastSyncAt: row.last_sync_at || undefined,
      headers: row.headers || undefined,
    };
  } catch (e) {
    return DEFAULT_STATE.config;
  }
}

export async function getState(): Promise<CRMState> {
  if (hasSupabase()) {
    try {
      const [leads, salespersons, config] = await Promise.all([
        supabaseListLeads(),
        supabaseGetSalespersons(),
        supabaseGetConfig(),
      ]);
      return { leads, salespersons, config };
    } catch (e) {
      // fallback
    }
  }

  const [leads, salespersons, config] = await Promise.all([
    readJSON<Lead[]>(FILE_LEADS, DEFAULT_STATE.leads),
    readJSON<Salesperson[]>(FILE_SALESPERSONS, DEFAULT_STATE.salespersons),
    readJSON<ConfigState>(FILE_CONFIG, DEFAULT_STATE.config),
  ]);
  return { leads, salespersons, config };
}

function getFieldValue(
  fields: Record<string, string | undefined>,
  candidates: string[],
) {
  for (const c of candidates) {
    if (!c) continue;
    if (
      fields[c] !== undefined &&
      fields[c] !== null &&
      String(fields[c]).trim() !== ""
    )
      return String(fields[c]);
  }
  return undefined;
}

function sanitizeKey(k?: string) {
  if (!k) return "";
  return k
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export async function saveLeads(leads: Lead[]) {
  if (hasSupabase()) {
    try {
      // Upsert each lead individually (simple and robust)
      for (const l of leads) {
        const fields = l.fields || {};
        // candidates mapping - check common header variations
        const whatType = getFieldValue(fields, [
          "what_type_of_property_do_you_want_to_install_solar_on?",
          "what_type_of_property",
          "what type of property do you want to install solar on?",
          "property_type",
        ]);
        const avgBill = getFieldValue(fields, [
          "what_is_your_average_monthly_electricity_bill?",
          "average_monthly_bill",
          "what is your average monthly electricity bill?",
        ]);
        const fullName = getFieldValue(fields, [
          "full name",
          "Full Name",
          "name",
          "Name",
        ]);
        const phoneField = getFieldValue(fields, [
          "phone",
          "Phone",
          "mobile",
          "Mobile",
        ]);
        const emailField = getFieldValue(fields, [
          "email",
          "Email",
          "e-mail",
          "E-mail",
        ]);
        const street = getFieldValue(fields, [
          "street address",
          "street_address",
          "Street Address",
        ]);
        const postCode = getFieldValue(fields, [
          "post_code",
          "post code",
          "Post Code",
        ]);
        const leadStatusField = getFieldValue(fields, [
          "lead_status",
          "Lead Status",
          "lead status",
          "status",
        ]);
        const note1 = getFieldValue(fields, ["note1", "note 1", ""]);
        const note2 = getFieldValue(fields, ["note2", "note 2", ""]);

        const body: any = {
          id: l.id,
          fields: fields || {},
          name: l.name || fullName || null,
          email: l.email || emailField || null,
          phone: l.phone || phoneField || null,
          company: l.company || null,
          source: l.source || null,
          status: l.status || (leadStatusField as LeadStatus) || "new",
          owner_id: l.ownerId || null,
          notes: l.notes || null,
          created_at: l.createdAt,
          updated_at: l.updatedAt,
        };

        // add top-level sheet columns if available (these columns should exist in DB schema)
        if (whatType) body.what_type_of_property = whatType;
        if (avgBill) body.average_monthly_bill = avgBill;
        if (fullName) body.full_name = fullName;
        if (street) body.street_address = street;
        if (postCode) body.post_code = postCode;
        if (note1) body.note1 = note1;
        if (note2) body.note2 = note2;
        if (leadStatusField) body.lead_status = leadStatusField;

        // upsert via POST with on_conflict requires query param ?on_conflict=id
        await supabaseFetch("leads?on_conflict=id", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      return;
    } catch (e) {
      // fallback to file
    }
  }
  await writeJSON(FILE_LEADS, leads);
}

export async function saveSalespersons(salespersons: Salesperson[]) {
  if (hasSupabase()) {
    try {
      for (const s of salespersons) {
        const body = {
          id: s.id,
          name: s.name,
          email: s.email || null,
          active: s.active,
          created_at: s.createdAt,
        };
        await supabaseFetch("salespersons?on_conflict=id", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      return;
    } catch (e) {
      // fallback
    }
  }
  await writeJSON(FILE_SALESPERSONS, salespersons);
}

export async function saveConfig(config: ConfigState) {
  if (hasSupabase()) {
    try {
      const body = {
        id: 1,
        sheet_url: config.sheetUrl || null,
        last_sync_at: config.lastSyncAt || null,
        headers: config.headers || null,
      };
      await supabaseFetch("config?on_conflict=id", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return;
    } catch (e) {
      // fallback
    }
  }
  await writeJSON(FILE_CONFIG, config);
}

export async function listLeads(): Promise<Lead[]> {
  const state = await getState();
  const leads = state.leads;
  const filtered = leads.filter((l) => {
    const vals = Object.values(l.fields || {}).map((v) =>
      (v || "").toString().trim(),
    );
    const nonEmpty = vals.filter((v) => v !== "");
    if (nonEmpty.length === 0) return false;

    // Check if only one non-empty value - likely junk
    if (nonEmpty.length === 1) {
      const v = nonEmpty[0];
      const dateLike =
        /^\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}$/.test(v) ||
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v) ||
        /^`\d{2}-\d{2}-\d{4}$/.test(v);
      const totalLike = /^sum|^total|^subtotal/i.test(v);
      const numericOnly = /^[-+]?\d{1,3}(?:[\,\d]*)(?:\.\d+)?$/.test(
        v.replace(/\s+/g, ""),
      );
      if (dateLike || totalLike || numericOnly) return false;
    }

    // Also check if this is a real lead (has name, email or phone)
    const hasRealData = !!(l.name || l.email || l.phone);
    if (!hasRealData) {
      // If no name, email or phone, at least need 3+ meaningful fields
      const keyFields = [
        "full name",
        "phone",
        "email",
        "what_is_your_average_monthly_electricity_bill?",
        "what_type_of_property_do_you_want_to_install_solar_on?",
      ];
      const realFieldCount = keyFields.filter(
        (k) => (l.fields?.[k] || "").toString().trim() !== "",
      ).length;
      if (realFieldCount < 2) return false;
    }

    return true;
  });
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSalespersons(): Promise<Salesperson[]> {
  const state = await getState();
  return state.salespersons.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSalesperson(
  input: Pick<Salesperson, "name" | "email">,
) {
  const now = new Date().toISOString();
  const person: Salesperson = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    active: true,
    createdAt: now,
  };
  if (hasSupabase()) {
    try {
      await supabaseFetch("salespersons", {
        method: "POST",
        body: JSON.stringify(person),
      });
      return person;
    } catch (e) {
      // continue to file fallback
    }
  }
  const state = await getState();
  await saveSalespersons([...state.salespersons, person]);
  return person;
}

export async function updateSalesperson(
  id: string,
  patch: Partial<Salesperson>,
) {
  if (hasSupabase()) {
    try {
      const supabasePatch: any = { ...patch };
      if (supabasePatch.createdAt !== undefined) {
        supabasePatch.created_at = supabasePatch.createdAt;
        delete supabasePatch.createdAt;
      }
      await supabaseFetch(`salespersons?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify(supabasePatch),
      });
      const items = await supabaseGetSalespersons();
      const updated = items.find((s) => s.id === id) || null;
      return updated;
    } catch (e) {
      // fallback
    }
  }
  const state = await getState();
  const idx = state.salespersons.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = { ...state.salespersons[idx], ...patch } as Salesperson;
  state.salespersons[idx] = updated;
  await saveSalespersons(state.salespersons);
  return updated;
}

export async function deleteSalesperson(id: string) {
  if (hasSupabase()) {
    try {
      await supabaseFetch(`salespersons?id=eq.${id}`, { method: "DELETE" });
      // unassign leads
      await supabaseFetch(`leads?owner_id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ owner_id: null }),
      });
      return true;
    } catch (e) {
      // fallback
    }
  }
  const state = await getState();
  const next = state.salespersons.filter((s) => s.id !== id);
  await saveSalespersons(next);
  const leads = state.leads.map((l) =>
    l.ownerId === id ? { ...l, ownerId: null } : l,
  );
  await saveLeads(leads);
  return true;
}

export async function createLead(input: Partial<Lead>) {
  const now = new Date().toISOString();
  const fields = input.fields || {
    Name: input.name || "",
    Email: input.email,
    Phone: input.phone,
    Company: input.company,
    Source: input.source,
    Notes: input.notes,
  };
  const lead: Lead = {
    id: randomUUID(),
    name: input.name || (fields["Name"] || "")!,
    email: input.email || (fields["Email"] as string | undefined),
    phone: input.phone || (fields["Phone"] as string | undefined),
    company: input.company || (fields["Company"] as string | undefined),
    source: input.source || (fields["Source"] as string | undefined),
    status: (input.status as LeadStatus) || "new",
    ownerId: input.ownerId || null,
    notes: input.notes || (fields["Notes"] as string | undefined),
    fields: fields,
    createdAt: now,
    updatedAt: now,
  };
  if (hasSupabase()) {
    try {
      await supabaseFetch("leads", {
        method: "POST",
        body: JSON.stringify(lead),
      });
      return lead;
    } catch (e) {
      // fallback
    }
  }
  const state = await getState();
  await saveLeads([lead, ...state.leads]);
  return lead;
}

export async function updateLead(id: string, patch: Partial<Lead>) {
  if (hasSupabase()) {
    try {
      const supabasePatch: any = { ...patch };
      if (supabasePatch.ownerId !== undefined) {
        supabasePatch.owner_id = supabasePatch.ownerId;
        delete supabasePatch.ownerId;
      }
      if (supabasePatch.createdAt !== undefined) {
        supabasePatch.created_at = supabasePatch.createdAt;
        delete supabasePatch.createdAt;
      }
      if (supabasePatch.updatedAt !== undefined) {
        supabasePatch.updated_at = supabasePatch.updatedAt;
        delete supabasePatch.updatedAt;
      }
      await supabaseFetch(`leads?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify(supabasePatch),
      });
      const items = await supabaseListLeads();
      return items.find((l) => l.id === id) || null;
    } catch (e) {
      // fallback
    }
  }
  const state = await getState();
  const idx = state.leads.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  const current = state.leads[idx];
  const mergedFields = { ...current.fields, ...(patch.fields || {}) };
  const updated: Lead = {
    ...current,
    ...patch,
    fields: mergedFields,
    name: (patch.name as string) || mergedFields["Name"] || current.name,
    email: (patch.email as string) || mergedFields["Email"] || current.email,
    phone: (patch.phone as string) || mergedFields["Phone"] || current.phone,
    company:
      (patch.company as string) || mergedFields["Company"] || current.company,
    notes: (patch.notes as string) || mergedFields["Notes"] || current.notes,
    updatedAt: new Date().toISOString(),
  };
  state.leads[idx] = updated;
  await saveLeads(state.leads);
  return updated;
}

export async function deleteLead(id: string) {
  if (hasSupabase()) {
    try {
      await supabaseFetch(`leads?id=eq.${id}`, { method: "DELETE" });
      return true;
    } catch (e) {
      // fallback
    }
  }
  const state = await getState();
  const next = state.leads.filter((l) => l.id !== id);
  await saveLeads(next);
  return true;
}

export async function assignUnassignedLeads() {
  const state = await getState();
  const active = state.salespersons.filter((s) => s.active);
  if (active.length === 0) return 0;
  const load = new Map<string, number>();
  for (const s of active) load.set(s.id, 0);
  for (const l of state.leads)
    if (l.ownerId && load.has(l.ownerId))
      load.set(l.ownerId, (load.get(l.ownerId) || 0) + 1);

  let assigned = 0;
  const leads = state.leads.map((l) => {
    if (!l.ownerId) {
      const target = findLeastLoaded(load);
      if (target) {
        assigned++;
        load.set(target, (load.get(target) || 0) + 1);
        return {
          ...l,
          ownerId: target,
          updatedAt: new Date().toISOString(),
        } as Lead;
      }
    }
    return l;
  });
  if (assigned > 0) await saveLeads(leads);
  return assigned;
}

function findLeastLoaded(load: Map<string, number>): string | null {
  let minKey: string | null = null;
  let minVal = Infinity;
  for (const [k, v] of load.entries()) {
    if (v < minVal) {
      minVal = v;
      minKey = k;
    }
  }
  return minKey;
}

export async function importFromCsvRows(
  rows: Record<string, string>[],
  headers?: string[],
) {
  const state = await getState();
  const byEmail = new Map(
    state.leads
      .filter((l) => l.email)
      .map((l) => [l.email!.toLowerCase(), l] as const),
  );
  const byPhone = new Map(
    state.leads
      .filter((l) => l.phone)
      .map((l) => [normalizePhone(l.phone!), l] as const),
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const now = new Date().toISOString();
  const importedEmails = new Set<string>();
  const importedPhones = new Set<string>();

  for (const r of rows) {
    const values = Object.values(r).map((v) => (v ?? "").toString().trim());
    const nonEmpty = values.filter((v) => v !== "");
    if (nonEmpty.length === 0) {
      skipped++;
      continue;
    }

    if (nonEmpty.length === 1) {
      const v = nonEmpty[0];
      const dateLike =
        /^\d{1,2}[\-/] \d{1,2}[\-/] \d{2,4}$/.test(v) ||
        /^\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}$/.test(v) ||
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v) ||
        /^`\d{2}-\d{2}-\d{4}$/.test(v);
      const totalLike = /^sum|^total|^subtotal/i.test(v);
      const numericOnly = /^[-+]?\d{1,3}(?:[\,\d]*)(?:\.\d+)?$/.test(
        v.replace(/\s+/g, ""),
      );
      if (dateLike || totalLike || numericOnly) {
        skipped++;
        continue;
      }
    }

    const name =
      r["name"] ||
      r["Name"] ||
      r["full_name"] ||
      r["Full Name"] ||
      r["lead_name"] ||
      "";
    const email =
      (r["email"] || r["Email"] || r["e-mail"] || r["E-mail"] || "").trim() ||
      undefined;
    const phoneRaw = (
      r["phone"] ||
      r["Phone"] ||
      r["mobile"] ||
      r["Mobile"] ||
      ""
    ).trim();
    const phone = phoneRaw ? normalizePhone(phoneRaw) : undefined;
    const company = r["company"] || r["Company"] || undefined;
    const source = r["source"] || r["Source"] || r["utm_source"] || undefined;
    const statusRaw = (r["status"] || r["Status"] || "").trim().toLowerCase();
    const status = (statusRaw || "new") as LeadStatus;
    const notes = r["notes"] || r["Notes"] || undefined;

    let existing: Lead | undefined;
    if (email && !importedEmails.has(email.toLowerCase()))
      existing = byEmail.get(email.toLowerCase());
    if (!existing && phone && !importedPhones.has(phone))
      existing = byPhone.get(phone);

    // Prevent duplicates within this import batch
    if (email && importedEmails.has(email.toLowerCase())) {
      skipped++;
      continue;
    }
    if (phone && importedPhones.has(phone)) {
      skipped++;
      continue;
    }

    const fields: Record<string, string | undefined> = {};
    for (const k of Object.keys(r)) {
      const val = r[k];
      if (val !== null && val !== undefined && val.trim() !== "") {
        fields[k] = val.trim();
      }
    }

    if (existing) {
      const merged: Lead = {
        ...existing,
        name: name || existing.name,
        email: email || existing.email,
        phone: phone || existing.phone,
        company: company ?? existing.company,
        source: source ?? existing.source,
        status: (status || existing.status) as LeadStatus,
        notes: notes ?? existing.notes,
        fields: { ...existing.fields, ...fields },
        updatedAt: now,
      };
      state.leads = state.leads.map((l) =>
        l.id === existing!.id ? merged : l,
      );
      if (email) importedEmails.add(email.toLowerCase());
      if (phone) importedPhones.add(phone);
      updated++;
    } else {
      const newLead: Lead = {
        id: randomUUID(),
        name,
        email,
        phone,
        company,
        source,
        status: (status || "new") as LeadStatus,
        ownerId: null,
        notes,
        fields,
        createdAt: now,
        updatedAt: now,
      };
      state.leads.unshift(newLead);
      if (email) importedEmails.add(email.toLowerCase());
      if (phone) importedPhones.add(phone);
      imported++;
    }
  }

  await saveLeads(state.leads);
  const assigned = await assignUnassignedLeads();
  return { imported, updated, assigned, skipped };
}

export function normalizePhone(p: string) {
  return p.replace(/[^\d+]/g, "");
}

export function parseCSV(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  const arr: string[] = [];
  function pushCell() {
    arr.push(inQuotes ? cur.replace(/""/g, '"') : cur);
    cur = "";
    inQuotes = false;
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        pushCell();
      } else if (ch === "\n") {
        pushCell();
        rows.push([...arr]);
        arr.length = 0;
      } else if (ch === "\r") {
        // ignore
      } else {
        cur += ch;
      }
    }
  }
  pushCell();
  rows.push([...arr]);

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => c.trim() === "")) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (row[j] ?? "").trim();
    }
    out.push(obj);
  }
  return { headers, rows: out };
}
