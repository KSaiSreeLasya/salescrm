import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { getLeads, postLead, putLead, deleteLeadHandler } from "./routes/leads";
import {
  getSalespersons,
  postSalesperson,
  putSalesperson,
  deleteSalespersonHandler,
} from "./routes/salespersons";
import {
  getConfig,
  updateConfig,
  importSheet,
  assignLeads,
} from "./routes/sheets";

import { startSheetSync } from "./scheduler";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // CRM routes
  app.get("/api/leads", getLeads);
  app.post("/api/leads", postLead);
  app.put("/api/leads/:id", putLead);
  app.delete("/api/leads/:id", deleteLeadHandler);

  app.get("/api/salespersons", getSalespersons);
  app.post("/api/salespersons", postSalesperson);
  app.put("/api/salespersons/:id", putSalesperson);
  app.delete("/api/salespersons/:id", deleteSalespersonHandler);

  app.get("/api/config", getConfig);
  app.put("/api/config", updateConfig);
  app.post("/api/import-sheet", importSheet);
  app.post("/api/assign-leads", assignLeads);

  // Background sync
  startSheetSync();

  return app;
}
