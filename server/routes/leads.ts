import { RequestHandler } from "express";
import { createLead, deleteLead, listLeads, updateLead } from "../services/crm";
import type { Lead } from "@shared/api";

export const getLeads: RequestHandler = async (_req, res) => {
  const items = await listLeads();
  res.json({ items, total: items.length });
};

export const postLead: RequestHandler = async (req, res) => {
  const body = req.body as Partial<Lead>;
  const created = await createLead(body);
  res.status(201).json(created);
};

export const putLead: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const body = req.body as Partial<Lead>;
  const updated = await updateLead(id, body);
  if (!updated) return res.status(404).json({ error: "Lead not found" });
  res.json(updated);
};

export const deleteLeadHandler: RequestHandler = async (req, res) => {
  const { id } = req.params;
  await deleteLead(id);
  res.status(204).end();
};
