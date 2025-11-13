import { RequestHandler } from "express";
import {
  getState,
  importFromCsvRows,
  parseCSV,
  saveConfig,
  assignUnassignedLeads,
} from "../services/crm";
import type { UpdateConfigRequest, ImportSheetRequest } from "@shared/api";

async function fetchCsvText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  return await res.text();
}

function toCsvExportUrl(input: string): string {
  const m = input.match(/docs.google.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return input;
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
}

export const getConfig: RequestHandler = async (_req, res) => {
  const { config } = await getState();
  res.json(config);
};

export const updateConfig: RequestHandler = async (req, res) => {
  const body = req.body as UpdateConfigRequest;
  const state = await getState();
  const next = { ...state.config };
  if (body.sheetUrl) next.sheetUrl = toCsvExportUrl(body.sheetUrl);
  await saveConfig(next);
  res.json(next);
};

export const importSheet: RequestHandler = async (req, res) => {
  const body = req.body as ImportSheetRequest;
  const state = await getState();
  const sheetUrl = toCsvExportUrl(body.sheetUrl || state.config.sheetUrl || "");
  if (!sheetUrl)
    return res.status(400).json({ error: "sheetUrl not configured" });
  try {
    const csv = await fetchCsvText(sheetUrl);
    const parsed = parseCSV(csv);
    const rows = parsed.rows;
    const headers = parsed.headers;
    const { imported, updated, assigned, skipped } = await importFromCsvRows(
      rows,
      headers,
    );
    const now = new Date().toISOString();
    await saveConfig({ ...state.config, sheetUrl, lastSyncAt: now, headers });
    res.json({ imported, updated, assigned, skipped, lastSyncAt: now });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
};

export const assignLeads: RequestHandler = async (_req, res) => {
  const assigned = await assignUnassignedLeads();
  res.json({ assigned });
};
