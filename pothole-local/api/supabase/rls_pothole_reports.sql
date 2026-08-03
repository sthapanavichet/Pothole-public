-- Supabase RLS hardening for pothole_reports
-- Run in: Supabase Dashboard → SQL Editor
--
-- The Vercel API uses SUPABASE_SECRET_KEY (service role), which bypasses RLS.
-- Enabling RLS blocks direct anon/authenticated client access to the table.
-- That way a leaked publishable/anon key cannot read or write reports.

alter table public.pothole_reports enable row level security;

-- Drop any prior open policies if they exist (safe if missing).
drop policy if exists "Allow public read pothole_reports" on public.pothole_reports;
drop policy if exists "Allow public insert pothole_reports" on public.pothole_reports;
drop policy if exists "Allow public update pothole_reports" on public.pothole_reports;
drop policy if exists "Allow public delete pothole_reports" on public.pothole_reports;
drop policy if exists "anon_select_pothole_reports" on public.pothole_reports;
drop policy if exists "anon_insert_pothole_reports" on public.pothole_reports;

-- Intentionally no policies for anon/authenticated.
-- Result: browser clients using the publishable key cannot query this table.
-- Only the service-role key used by the API can access the data.

-- Optional: verify RLS is on
-- select relname, relrowsecurity from pg_class where relname = 'pothole_reports';
