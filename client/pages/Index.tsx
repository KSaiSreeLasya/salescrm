import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lead, LeadStatus, Salesperson, ImportSheetResponse, ConfigState } from "@shared/api";

const statusOptions: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "call", label: "Call" },
  { value: "not lifted", label: "Not lifted" },
  { value: "quotation sent", label: "Quotation sent" },
  { value: "site visit", label: "Site visit" },
  { value: "advance payment", label: "Advance payment" },
  { value: "lead finished", label: "Lead finished" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

function useApi<T>(key: string[], url: string) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as T;
    },
  });
}

export default function Index() {
  const qc = useQueryClient();

  const leadsQ = useApi<{ items: Lead[]; total: number }>(["leads"], "/api/leads");
  const teamQ = useApi<{ items: Salesperson[]; total: number }>(["salespersons"], "/api/salespersons");
  const configQ = useApi<ConfigState>(["config"], "/api/config");

  const [activeTab, setActiveTab] = useState<"leads" | "team">("leads");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const columns = useMemo(() => {
    const cfgHeaders = configQ.data?.headers;
    if (cfgHeaders && cfgHeaders.length) return cfgHeaders;
    const items = leadsQ.data?.items || [];
    const seen = new Set<string>();
    const cols: string[] = [];
    for (const l of items) {
      const keys = Object.keys(l.fields || {});
      for (const k of keys) {
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
      }
    }
    return cols;
  }, [configQ.data?.headers, leadsQ.data?.items]);

  const filteredLeads = useMemo(() => {
    const src = leadsQ.data?.items || [];
    const s = search.toLowerCase();
    const byText = s
      ? src.filter((l) => {
          // search across fields
          const fv = Object.values(l.fields || {}).join(" ").toLowerCase();
          return fv.includes(s) || l.name.toLowerCase().includes(s) || (l.email || "").toLowerCase().includes(s) || (l.phone || "").toLowerCase().includes(s) || (l.company || "").toLowerCase().includes(s);
        })
      : src;
    const byStatus = statusFilter === "all" ? byText : byText.filter((l) => l.status === statusFilter);
    return byStatus;
  }, [leadsQ.data?.items, search, statusFilter]);

  const kpis = useMemo(() => {
    const items = leadsQ.data?.items || [];
    const total = items.length;
    const assigned = items.filter((l) => !!l.ownerId).length;
    const unassigned = total - assigned;
    const won = items.filter((l) => l.status === "won").length;
    return { total, assigned, unassigned, won };
  }, [leadsQ.data?.items]);

  const createLead = useMutation({
    mutationFn: async (payload: Partial<Lead>) => {
      const r = await fetch(`/api/leads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as Lead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Lead> }) => {
      const r = await fetch(`/api/leads/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as Lead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error(await r.text());
      return true as const;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const createSalesperson = useMutation({
    mutationFn: async (payload: Partial<Salesperson>) => {
      const r = await fetch(`/api/salespersons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as Salesperson;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salespersons"] }),
  });

  const updateSalesperson = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Salesperson> }) => {
      const r = await fetch(`/api/salespersons/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as Salesperson;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salespersons"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const deleteSalesperson = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/salespersons/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error(await r.text());
      return true as const;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salespersons"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const importSheet = useMutation({
    mutationFn: async (sheetUrl?: string) => {
      const r = await fetch(`/api/import-sheet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheetUrl }) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as ImportSheetResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["config"] });
    },
  });

  const assignLeads = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/assign-leads`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { assigned: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  useEffect(() => {
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    }, 30000);
    return () => clearInterval(id);
  }, [qc]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white dark:from-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      <Header onImport={() => importSheet.mutate()} syncing={importSheet.isPending} lastSyncAt={configQ.data?.lastSyncAt} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Kpis {...kpis} />

        <div className="mt-8 flex items-center justify-between">
          <div className="inline-flex rounded-xl bg-neutral-100/70 dark:bg-neutral-800 p-1 shadow-inner">
            <button
              onClick={() => setActiveTab("leads")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "leads" ? "bg-white dark:bg-neutral-700 shadow" : "opacity-70 hover:opacity-100"}`}
            >
              Leads
            </button>
            <button
              onClick={() => setActiveTab("team")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === "team" ? "bg-white dark:bg-neutral-700 shadow" : "opacity-70 hover:opacity-100"}`}
            >
              Team
            </button>
          </div>

          <SheetControls
            defaultUrl={configQ.data?.sheetUrl}
            onSync={(url) => importSheet.mutate(url)}
            syncing={importSheet.isPending}
            lastSyncAt={configQ.data?.lastSyncAt}
          />
        </div>

        {activeTab === "leads" ? (
          <section className="mt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leads"
                  className="w-64 rounded-lg border border-neutral-200 bg-white/70 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:bg-neutral-800 dark:border-neutral-700"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-neutral-200 bg-white/70 px-3 py-2 text-sm dark:bg-neutral-800 dark:border-neutral-700"
                >
                  <option value="all">All statuses</option>
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => assignLeads.mutate()}
                  className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60"
                  disabled={assignLeads.isPending}
                >
                  Auto-assign Unassigned
                </button>
                <NewLead onCreate={(payload) => createLead.mutate(payload)} />
              </div>
            </div>
            <LeadsTable
              columns={columns}
              leads={filteredLeads}
              team={teamQ.data?.items || []}
              onUpdate={(id, patch) => updateLead.mutate({ id, patch })}
              onDelete={(id) => deleteLead.mutate(id)}
            />
          </section>
        ) : (
          <section className="mt-6">
            <TeamSection
              team={teamQ.data?.items || []}
              onCreate={(p) => createSalesperson.mutate(p)}
              onUpdate={(id, patch) => updateSalesperson.mutate({ id, patch })}
              onDelete={(id) => deleteSalesperson.mutate(id)}
            />
          </section>
        )}
      </main>
      <footer className="mt-10 border-t border-neutral-200/60 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        Sales CRM • Auto-sync from Google Sheets • Built for efficiency
      </footer>
    </div>
  );
}

function Header({ onImport, syncing, lastSyncAt }: { onImport: () => void; syncing: boolean; lastSyncAt?: string }) {
  return (
    <header className="bg-[radial-gradient(1200px_600px_at_90%_-10%,theme(colors.brand.200)/70,transparent_60%),linear-gradient(to_bottom_right,theme(colors.brand.50),white)] dark:bg-[radial-gradient(1200px_600px_at_90%_-10%,theme(colors.brand.900)/40,transparent_60%),linear-gradient(to_bottom_right,theme(colors.neutral.900),theme(colors.neutral.950))]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-600 shadow-inner ring-4 ring-brand-200/50 dark:ring-brand-900/50" />
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">LeadFlow</h1>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">Convert faster with smart routing</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={onImport}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60"
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync from Sheet"}
            </button>
          </div>
        </div>
        <div className="mt-6 max-w-2xl">
          <h2 className="text-3xl font-black leading-tight tracking-tight">
            Sales website for capturing and managing leads with automatic assignment
          </h2>
          <p className="mt-3 text-neutral-700 dark:text-neutral-300">
            Connect your Google Sheet, auto-import leads in real-time, and let the system assign them to your sales team. Track
            updates, statuses, and outcomes effortlessly.
          </p>
          <div className="mt-4 text-xs text-neutral-600 dark:text-neutral-400">
            {lastSyncAt ? `Last sync: ${new Date(lastSyncAt).toLocaleString()}` : "No sync performed yet"}
          </div>
          <div className="mt-6 flex gap-3 md:hidden">
            <button
              onClick={onImport}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60"
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync from Sheet"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function Kpis({ total, assigned, unassigned, won }: { total: number; assigned: number; unassigned: number; won: number }) {
  const items = [
    { label: "Total Leads", value: total },
    { label: "Assigned", value: assigned },
    { label: "Unassigned", value: unassigned },
    { label: "Won", value: won },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="rounded-2xl border border-neutral-200/70 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-800/60">
          <div className="text-xs text-neutral-600 dark:text-neutral-400">{k.label}</div>
          <div className="mt-1 text-2xl font-extrabold">{k.value}</div>
        </div>
      ))}
    </div>
  );
}

function SheetControls({ defaultUrl, onSync, syncing, lastSyncAt }: { defaultUrl?: string; onSync: (url?: string) => void; syncing: boolean; lastSyncAt?: string }) {
  const [url, setUrl] = useState<string>(defaultUrl || "");
  useEffect(() => setUrl(defaultUrl || ""), [defaultUrl]);
  return (
    <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste Google Sheet URL"
        className="w-full md:w-96 rounded-lg border border-neutral-200 bg-white/70 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:bg-neutral-800 dark:border-neutral-700"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSync(url)}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60"
          disabled={syncing}
        >
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>
    </div>
  );
}

function NewLead({ onCreate }: { onCreate: (payload: Partial<Lead>) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string | undefined>>({ Name: "", Email: "", Phone: "", Company: "", Source: "", Notes: "" });

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium shadow hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
        + New Lead
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold">Create Lead</div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="Name" value={form.Name || ""} onChange={(v) => setForm({ ...form, Name: v })} />
              <Input label="Email" value={form.Email || ""} onChange={(v) => setForm({ ...form, Email: v })} />
              <Input label="Phone" value={form.Phone || ""} onChange={(v) => setForm({ ...form, Phone: v })} />
              <Input label="Company" value={form.Company || ""} onChange={(v) => setForm({ ...form, Company: v })} />
              <Input label="Source" value={form.Source || ""} onChange={(v) => setForm({ ...form, Source: v })} />
              <div>
                <label className="text-xs text-neutral-600 dark:text-neutral-400">Status</label>
                <select
                  value={(form["Status"] as string) || "new"}
                  onChange={(e) => setForm({ ...form, Status: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-neutral-600 dark:text-neutral-400">Notes</label>
                <textarea
                  value={form.Notes || ""}
                  onChange={(e) => setForm({ ...form, Notes: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800">
                Cancel
              </button>
              <button
                onClick={() => {
                  const payload: Partial<Lead> = {
                    fields: form,
                    name: (form.Name as string) || "",
                    email: form.Email,
                    phone: form.Phone,
                    company: form.Company,
                    source: form.Source,
                    notes: form.Notes,
                    status: (form.Status as LeadStatus) || "new",
                  };
                  onCreate(payload);
                  setOpen(false);
                  setForm({ Name: "", Email: "", Phone: "", Company: "", Source: "", Notes: "" });
                }}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LeadsTable({ columns, leads, team, onUpdate, onDelete }: { columns: string[]; leads: Lead[]; team: Salesperson[]; onUpdate: (id: string, patch: Partial<Lead>) => void; onDelete: (id: string) => void }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <table className="min-w-full table-auto divide-y divide-neutral-200 dark:divide-neutral-800">
        <thead className="bg-neutral-50/60 dark:bg-neutral-800/40">
          <tr>
            {columns.map((c, idx) => (
              <Th key={`${c}-${idx}`}>{c}</Th>
            ))}
            <Th>Status</Th>
            <Th>Owner</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {leads.map((l) => (
            <tr key={l.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
              {columns.map((c, idx) => (
                <Td key={`${l.id}-${c}-${idx}`}>
                  <CellField lead={l} fieldKey={c} onChange={(next) => onUpdate(l.id, { fields: { ...(l.fields || {}), [c]: next } })} />
                </Td>
              ))}

              <Td>
                <select
                  value={l.status}
                  onChange={(e) => onUpdate(l.id, { status: e.target.value as LeadStatus })}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Td>
              <Td>
                <select
                  value={l.ownerId || ""}
                  onChange={(e) => onUpdate(l.id, { ownerId: e.target.value || null })}
                  className="w-44 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <option value="">Unassigned</option>
                  {team.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Td>
              <Td className="text-right">
                <button onClick={() => onDelete(l.id)} className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  Delete
                </button>
              </Td>
            </tr>
          ))}
          {leads.length === 0 && (
            <tr>
              <Td colSpan={columns.length + 3} className="py-8 text-center text-neutral-500">
                No leads yet. Sync from Google Sheets or create one.
              </Td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CellField({ lead, fieldKey, onChange }: { lead: Lead; fieldKey: string; onChange: (next: string) => void }) {
  const [value, setValue] = useState<string>((lead.fields && (lead.fields[fieldKey] || "")) || "");
  useEffect(() => setValue((lead.fields && (lead.fields[fieldKey] || "")) || ""), [lead.id, fieldKey, lead.fields]);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onChange(value)}
      className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 whitespace-normal break-words"
    />
  );
}

function TeamSection({ team, onCreate, onUpdate, onDelete }: { team: Salesperson[]; onCreate: (p: Partial<Salesperson>) => void; onUpdate: (id: string, patch: Partial<Salesperson>) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <Input label="Name" value={name} onChange={setName} className="md:w-64" />
          <Input label="Email" value={email} onChange={setEmail} className="md:w-64" />
          <button
            onClick={() => {
              if (!name.trim()) return;
              onCreate({ name: name.trim(), email: email.trim() || undefined });
              setName("");
              setEmail("");
            }}
            className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800"
          >
            Add Salesperson
          </button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <table className="min-w-full table-auto divide-y divide-neutral-200 dark:divide-neutral-800">
          <thead className="bg-neutral-50/60 dark:bg-neutral-800/40">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {team.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                <Td className="font-medium">{p.name}</Td>
                <Td>{p.email || "—"}</Td>
                <Td>
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={p.active} onChange={(e) => onUpdate(p.id, { active: e.target.checked })} />
                    Active
                  </label>
                </Td>
                <Td className="text-right">
                  <button onClick={() => onDelete(p.id)} className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                    Remove
                  </button>
                </Td>
              </tr>
            ))}
            {team.length === 0 && (
              <tr>
                <Td colSpan={4} className="py-8 text-center text-neutral-500">
                  No team members. Add your first salesperson.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, className }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs text-neutral-600 dark:text-neutral-400">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-neutral-700 dark:bg-neutral-800"
      />
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 align-top text-left text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 ${className}`}>
      <div className="whitespace-normal break-words">{children}</div>
    </th>
  );
}
function Td({ children, className = "", colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 text-sm ${className}`}>
      {children}
    </td>
  );
}
