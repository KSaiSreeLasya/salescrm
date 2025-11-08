import { getState, parseCSV, importFromCsvRows, saveConfig } from "./services/crm";

async function runOnce() {
  try {
    const state = await getState();
    const sheetUrl = state.config.sheetUrl;
    if (!sheetUrl) return;
    const res = await fetch(sheetUrl);
    if (!res.ok) return;
    const csv = await res.text();
    const rows = parseCSV(csv);
    const changed = await importFromCsvRows(rows);
    if (changed.imported > 0 || changed.updated > 0 || changed.assigned > 0) {
      await saveConfig({ ...state.config, lastSyncAt: new Date().toISOString(), sheetUrl });
    }
  } catch {
    // ignore background errors
  }
}

export function startSheetSync() {
  // initial delay to allow server start
  setTimeout(runOnce, 5000);
  setInterval(runOnce, 5 * 60 * 1000);
}
