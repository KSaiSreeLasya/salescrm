/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

export type LeadStatus =
  | "new"
  | "call"
  | "not lifted"
  | "quotation sent"
  | "site visit"
  | "advance payment"
  | "lead finished"
  | "contacted"
  | "qualified"
  | "won"
  | "lost";

export interface Lead {
  id: string;
  // store original sheet fields dynamically
  fields: Record<string, string | undefined>;
  // convenience columns
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status: LeadStatus;
  ownerId?: string | null;
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface Salesperson {
  id: string;
  name: string;
  email?: string;
  active: boolean;
  createdAt: string;
}

export interface ConfigState {
  sheetUrl?: string;
  lastSyncAt?: string; // ISO
  headers?: string[]; // last seen sheet headers (preserve order)
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface ListLeadsResponse extends Paginated<Lead> {}
export interface ListSalespersonsResponse extends Paginated<Salesperson> {}

export interface ImportSheetRequest {
  sheetUrl?: string;
}

export interface ImportSheetResponse {
  imported: number;
  updated: number;
  assigned: number;
  lastSyncAt: string;
}

export interface UpdateConfigRequest {
  sheetUrl?: string;
}

export interface UpdateConfigResponse extends ConfigState {}

export interface ErrorResponse {
  error: string;
}
