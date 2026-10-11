-- Run this in the Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 80),
 project_type text not null default 'static' check (project_type in ('static','frontend','api')),
 created_at timestamptz not null default now()
);
alter table public.projects enable row level security;
drop policy if exists "read own projects" on public.projects;
create policy "read own projects" on public.projects for select to authenticated using (auth.uid() = owner_id);
drop policy if exists "create own projects" on public.projects;
create policy "create own projects" on public.projects for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "update own projects" on public.projects;
create policy "update own projects" on public.projects for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "delete own projects" on public.projects;
create policy "delete own projects" on public.projects for delete to authenticated using (auth.uid() = owner_id);
-- Create a PRIVATE bucket and owner-only policies for Storage.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('project-files','project-files',false,10485760,array['text/html','text/css','application/javascript','application/json','text/plain','image/svg+xml','image/png','image/jpeg','image/webp','image/gif','image/x-icon','application/zip','font/woff','font/woff2','application/octet-stream']) on conflict (id) do update set public=false,file_size_limit=10485760;
drop policy if exists "owner reads project files" on storage.objects;
create policy "owner reads project files" on storage.objects for select to authenticated using (bucket_id='project-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "owner uploads project files" on storage.objects;
create policy "owner uploads project files" on storage.objects for insert to authenticated with check (bucket_id='project-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "owner deletes project files" on storage.objects;
create policy "owner deletes project files" on storage.objects for delete to authenticated using (bucket_id='project-files' and (storage.foldername(name))[1]=auth.uid()::text);


-- ===== 4.5 migration (idempotent) =====
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text, plan text not null default 'free' check (plan in ('free','pro')),
 is_admin boolean not null default false, suspended boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create or replace function public.is_admin() returns boolean language sql security definer set search_path=public stable as $$
 select coalesce((select is_admin from public.profiles where id=auth.uid()),false) $$;
drop policy if exists "read own or admin profile" on public.profiles;
create policy "read own or admin profile" on public.profiles for select to authenticated using (auth.uid()=id or public.is_admin());
drop policy if exists "admin updates profiles" on public.profiles;
create policy "admin updates profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,email) values (new.id,new.email) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,email) select id,email from auth.users on conflict do nothing;

create table if not exists public.sites (
 slug text primary key check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$'),
 owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid, created_at timestamptz not null default now()
);
alter table public.sites enable row level security;
drop policy if exists "read own or admin sites" on public.sites;
create policy "read own or admin sites" on public.sites for select to authenticated using (auth.uid()=owner_id or public.is_admin());
drop policy if exists "claim own site" on public.sites;
create policy "claim own site" on public.sites for insert to authenticated with check (auth.uid()=owner_id);
drop policy if exists "drop own or admin site" on public.sites;
create policy "drop own or admin site" on public.sites for delete to authenticated using (auth.uid()=owner_id or public.is_admin());
-- Make yourself the first admin (replace the email), run once:
-- update public.profiles set is_admin=true where email='you@example.com';
