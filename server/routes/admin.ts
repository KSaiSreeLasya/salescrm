import { RequestHandler } from "express";
import { importSheet } from "./sheets";

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
