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

export async function getState(): Promise<CRMState> {
  const [leads, salespersons, config] = await Promise.all([
    readJSON<Lead[]>(FILE_LEADS, DEFAULT_STATE.leads),
    readJSON<Salesperson[]>(FILE_SALESPERSONS, DEFAULT_STATE.salespersons),
    readJSON<ConfigState>(FILE_CONFIG, DEFAULT_STATE.config),
  ]);
  return { leads, salespersons, config };
}

async function saveLeads(leads: Lead[]) {
  await writeJSON(FILE_LEADS, leads);
}

async function saveSalespersons(salespersons: Salesperson[]) {
  await writeJSON(FILE_SALESPERSONS, salespersons);
}

export async function saveConfig(config: ConfigState) {
  await writeJSON(FILE_CONFIG, config);
}

export async function listLeads(): Promise<Lead[]> {
  const { leads } = await getState();
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSalespersons(): Promise<Salesperson[]> {
  const { salespersons } = await getState();
  return salespersons.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSalesperson(input: Pick<Salesperson, "name" | "email">) {
  const state = await getState();
  const person: Salesperson = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    active: true,
    createdAt: new Date().toISOString(),
  };
  await saveSalespersons([...state.salespersons, person]);
  return person;
}

export async function updateSalesperson(id: string, patch: Partial<Salesperson>) {
  const state = await getState();
  const idx = state.salespersons.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = { ...state.salespersons[idx], ...patch } as Salesperson;
  state.salespersons[idx] = updated;
  await saveSalespersons(state.salespersons);
  return updated;
}

export async function deleteSalesperson(id: string) {
  const state = await getState();
  const next = state.salespersons.filter((s) => s.id !== id);
  await saveSalespersons(next);
  // Unassign leads owned by this salesperson
  const leads = state.leads.map((l) => (l.ownerId === id ? { ...l, ownerId: null } : l));
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
  const state = await getState();
  await saveLeads([lead, ...state.leads]);
  return lead;
}

export async function updateLead(id: string, patch: Partial<Lead>) {
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
    company: (patch.company as string) || mergedFields["Company"] || current.company,
    notes: (patch.notes as string) || mergedFields["Notes"] || current.notes,
    updatedAt: new Date().toISOString(),
  };
  state.leads[idx] = updated;
  await saveLeads(state.leads);
  return updated;
}

export async function deleteLead(id: string) {
  const state = await getState();
  const next = state.leads.filter((l) => l.id !== id);
  await saveLeads(next);
  return true;
}

export async function assignUnassignedLeads() {
  const state = await getState();
  const active = state.salespersons.filter((s) => s.active);
  if (active.length === 0) return 0;
  // Calculate current load per salesperson
  const load = new Map<string, number>();
  for (const s of active) load.set(s.id, 0);
  for (const l of state.leads) if (l.ownerId && load.has(l.ownerId)) load.set(l.ownerId, (load.get(l.ownerId) || 0) + 1);

  let assigned = 0;
  const leads = state.leads.map((l) => {
    if (!l.ownerId) {
      const target = findLeastLoaded(load);
      if (target) {
        assigned++;
        load.set(target, (load.get(target) || 0) + 1);
        return { ...l, ownerId: target, updatedAt: new Date().toISOString() } as Lead;
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

export async function importFromCsvRows(rows: Record<string, string>[], headers?: string[]) {
  const state = await getState();
  const byEmail = new Map(state.leads.filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l] as const));
  const byPhone = new Map(state.leads.filter((l) => l.phone).map((l) => [normalizePhone(l.phone!), l] as const));

  let imported = 0;
  let updated = 0;

  const now = new Date().toISOString();

  for (const r of rows) {
    const name = r["name"] || r["Name"] || r["full_name"] || r["Full Name"] || r["lead_name"] || "";
    const email = (r["email"] || r["Email"] || r["e-mail"] || r["E-mail"] || "").trim() || undefined;
    const phoneRaw = (r["phone"] || r["Phone"] || r["mobile"] || r["Mobile"] || "").trim();
    const phone = phoneRaw ? normalizePhone(phoneRaw) : undefined;
    const company = r["company"] || r["Company"] || undefined;
    const source = r["source"] || r["Source"] || r["utm_source"] || undefined;
    const statusRaw = (r["status"] || r["Status"] || "").trim().toLowerCase();
    const status = (statusRaw || "new") as LeadStatus;
    const notes = r["notes"] || r["Notes"] || undefined;

    let existing: Lead | undefined;
    if (email) existing = byEmail.get(email.toLowerCase());
    if (!existing && phone) existing = byPhone.get(phone);

    const fields: Record<string, string | undefined> = {};
    for (const k of Object.keys(r)) fields[k] = r[k] ?? undefined;

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
      state.leads = state.leads.map((l) => (l.id === existing!.id ? merged : l));
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
      imported++;
    }
  }

  await writeJSON("leads.json", state.leads);
  const assigned = await assignUnassignedLeads();
  return { imported, updated, assigned };
}

export function normalizePhone(p: string) {
  return p.replace(/[^\d+]/g, "");
}

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
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
      } else if (ch === ',') {
        pushCell();
      } else if (ch === '\n') {
        pushCell();
        rows.push([...arr]);
        arr.length = 0;
      } else if (ch === '\r') {
        // ignore
      } else {
        cur += ch;
      }
    }
  }
  // flush last cell/row
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
