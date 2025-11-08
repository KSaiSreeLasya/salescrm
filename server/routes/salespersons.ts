import { RequestHandler } from "express";
import { createSalesperson, deleteSalesperson, listSalespersons, updateSalesperson } from "../services/crm";
import type { Salesperson } from "@shared/api";

export const getSalespersons: RequestHandler = async (_req, res) => {
  const items = await listSalespersons();
  res.json({ items, total: items.length });
};

export const postSalesperson: RequestHandler = async (req, res) => {
  const body = req.body as Partial<Salesperson>;
  if (!body.name) return res.status(400).json({ error: "name is required" });
  const created = await createSalesperson({ name: body.name!, email: body.email });
  res.status(201).json(created);
};

export const putSalesperson: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const body = req.body as Partial<Salesperson>;
  const updated = await updateSalesperson(id, body);
  if (!updated) return res.status(404).json({ error: "Salesperson not found" });
  res.json(updated);
};

export const deleteSalespersonHandler: RequestHandler = async (req, res) => {
  const { id } = req.params;
  await deleteSalesperson(id);
  res.status(204).end();
};
