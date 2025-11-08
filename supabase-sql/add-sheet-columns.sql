-- Add columns for sheet headers (run in Supabase SQL editor)
alter table if exists public.leads
  add column if not exists what_type_of_property text,
  add column if not exists average_monthly_bill text,
  add column if not exists full_name text,
  add column if not exists street_address text,
  add column if not exists post_code text,
  add column if not exists lead_status text,
  add column if not exists note1 text,
  add column if not exists note2 text;

-- Backfill these columns from fields JSON where possible
update public.leads set
  what_type_of_property = coalesce(fields ->> 'what_type_of_property_do_you_want_to_install_solar_on?', fields ->> 'what_type_of_property', fields ->> 'what type of property do you want to install solar on?'),
  average_monthly_bill = coalesce(fields ->> 'what_is_your_average_monthly_electricity_bill?', fields ->> 'average_monthly_bill', fields ->> 'what is your average monthly electricity bill?'),
  full_name = coalesce(fields ->> 'full name', fields ->> 'Full Name', fields ->> 'name'),
  street_address = coalesce(fields ->> 'street address', fields ->> 'street_address'),
  post_code = coalesce(fields ->> 'post_code', fields ->> 'post code'),
  lead_status = coalesce(fields ->> 'lead_status', fields ->> 'Lead Status', fields ->> 'status'),
  note1 = coalesce(fields ->> 'note1', fields ->> 'note 1', fields ->> ''),
  note2 = coalesce(fields ->> 'note2', fields ->> 'note 2', fields ->> '');

-- Add indexes for quick filtering
create index if not exists idx_leads_full_name on public.leads (lower(full_name));
create index if not exists idx_leads_post_code on public.leads (post_code);
