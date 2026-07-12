-- videoUse.studio — initial schema
-- Tables mirror the reference pipeline's artifacts: sources, packed transcripts,
-- EDLs, and per-session memory (project.md → `sessions`).

create extension if not exists "pgcrypto";

-- A video project: one folder of raw takes the user is editing toward a final cut.
create table if not exists projects (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users (id) on delete cascade,
  title        text not null default 'Untitled',
  target_spec  jsonb,                       -- {width,height,fps,aspect}
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One raw source clip uploaded into a project.
create table if not exists sources (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects (id) on delete cascade,
  storage_path  text not null,             -- Supabase Storage object path
  filename      text not null,
  duration_s    numeric,
  transcript    jsonb,                      -- word-level Whisper output (cached)
  created_at    timestamptz not null default now()
);

-- An edit decision + its render job. `edl` is the contract in src/lib/types.ts.
create table if not exists edls (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects (id) on delete cascade,
  edl             jsonb not null,
  status          text not null default 'queued',  -- see JobStatus in types.ts
  output_path     text,                             -- final.mp4 in Storage
  error           text,
  created_at      timestamptz not null default now()
);

-- Session memory — the web equivalent of the reference's project.md.
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects (id) on delete cascade,
  strategy     text,
  decisions    text,
  outstanding  text,
  created_at   timestamptz not null default now()
);

-- Row Level Security: users only see their own projects and everything under them.
alter table projects enable row level security;
alter table sources  enable row level security;
alter table edls     enable row level security;
alter table sessions enable row level security;

create policy "own projects" on projects
  for all using (owner = auth.uid()) with check (owner = auth.uid());

create policy "own sources" on sources
  for all using (exists (select 1 from projects p where p.id = sources.project_id and p.owner = auth.uid()))
  with check (exists (select 1 from projects p where p.id = sources.project_id and p.owner = auth.uid()));

create policy "own edls" on edls
  for all using (exists (select 1 from projects p where p.id = edls.project_id and p.owner = auth.uid()))
  with check (exists (select 1 from projects p where p.id = edls.project_id and p.owner = auth.uid()));

create policy "own sessions" on sessions
  for all using (exists (select 1 from projects p where p.id = sessions.project_id and p.owner = auth.uid()))
  with check (exists (select 1 from projects p where p.id = sessions.project_id and p.owner = auth.uid()));
