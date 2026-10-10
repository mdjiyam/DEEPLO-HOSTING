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
