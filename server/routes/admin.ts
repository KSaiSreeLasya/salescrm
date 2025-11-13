import { RequestHandler } from "express";
import { importSheet } from "./sheets";
import { getState, saveLeads, saveSalespersons, saveConfig } from "../services/crm";

export const adminImportSheet: RequestHandler = async (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(500).json({ error: "admin token not configured" });

  let provided: any = req.headers["x-admin-token"] || req.headers["authorization"];
  if (!provided) return res.status(401).json({ error: "unauthorized" });

  if (typeof provided === "string" && provided.startsWith("Bearer ")) {
    provided = provided.slice(7);
  }

  if (provided !== token) return res.status(401).json({ error: "unauthorized" });

  // Delegate to existing importSheet handler
  return importSheet(req, res);
};

export const adminMigrateToSupabase: RequestHandler = async (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(500).json({ error: "admin token not configured" });

  let provided: any = req.headers["x-admin-token"] || req.headers["authorization"];
  if (!provided) return res.status(401).json({ error: "unauthorized" });

  if (typeof provided === "string" && provided.startsWith("Bearer ")) {
    provided = provided.slice(7);
  }

  if (provided !== token) return res.status(401).json({ error: "unauthorized" });

  try {
    const state = await getState();

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Supabase not configured" });
    }

    // Force save to Supabase
    await saveLeads(state.leads);
    await saveSalespersons(state.salespersons);
    await saveConfig(state.config);

    res.json({
      success: true,
      message: "Data migrated to Supabase",
      counts: {
        leads: state.leads.length,
        salespersons: state.salespersons.length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Migration failed" });
  }
};
