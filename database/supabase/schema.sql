-- Supabase/Postgres schema for migrating data from MongoDB
-- Strategy: keep original Mongo _id as text PK to avoid broken references.

create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  password text,
  person_id text,
  role text not null,
  department text not null,
  store_region text,
  store_branch_ids jsonb,
  store_lead_user_id text,
  verified boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists people (
  id text primary key,
  name text not null,
  role text not null,
  email text not null,
  image_url text,
  team_id text not null,
  working_hours jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists company_teams (
  id text primary key,
  name text not null,
  color text,
  member_ids jsonb,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists workspace_teams (
  id text primary key,
  name text not null,
  slug text,
  color text,
  member_ids jsonb,
  owner_id text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists tasks (
  id text primary key,
  task_number bigint,
  workspace_team_id text,
  time_period text,
  name text,
  comments integer,
  likes integer,
  assignee_id text,
  status text,
  status_color text,
  execution_period text,
  audience text,
  weight text,
  result_method text,
  target text,
  progress numeric,
  kpis jsonb,
  child_goal text,
  parent_goal text,
  description text,
  attachments jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists document_folders (
  id text primary key,
  name text not null,
  owner_id text,
  team_id text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists documents (
  id text primary key,
  name text not null,
  type text,
  size bigint,
  owner_id text,
  created_at timestamptz,
  modified_at timestamptz,
  folder text,
  folder_id text,
  tags jsonb,
  is_starred boolean,
  thumbnail text,
  description text,
  url text,
  visibility text,
  visible_to_person_ids jsonb,
  is_learning_material boolean,
  learning_plan jsonb,
  deadline_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists learning_quizzes (
  id text primary key,
  document_id text not null,
  title text,
  description text,
  questions jsonb,
  duration_minutes integer,
  time_per_question_seconds integer,
  deadline_at timestamptz,
  created_by_person_id text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists quiz_attempts (
  id text primary key,
  quiz_id text,
  document_id text,
  person_id text,
  answers jsonb,
  score numeric,
  correct_answers integer,
  total_questions integer,
  started_at timestamptz,
  submitted_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists learning_progress (
  id text primary key,
  person_id text,
  document_id text,
  started_at timestamptz,
  completed_at timestamptz,
  active_step_index integer,
  completed_step_ids jsonb,
  started_at_by_step_id jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists chat_threads (
  id text primary key,
  type text,
  participant_ids jsonb,
  team_id text,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists chat_messages (
  id text primary key,
  thread_id text,
  sender_id text,
  type text,
  content text,
  file_name text,
  mime_type text,
  file_size bigint,
  status text,
  created_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists schedules (
  id text primary key,
  workspace_team_id text,
  date_key text,
  title text,
  description text,
  start_time text,
  end_time text,
  attendee_ids jsonb,
  created_by_person_id text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists tests (
  id text primary key,
  title text,
  description text,
  questions jsonb,
  duration_minutes integer,
  created_by_person_id text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists person_notifications (
  id text primary key,
  person_id text,
  type text,
  actor_id text,
  action text,
  entity_type text,
  entity_label text,
  thread_id text,
  project_id text,
  schedule_id text,
  entity_id text,
  message_id text,
  target_person_ids jsonb,
  occurred_at timestamptz,
  created_at timestamptz,
  read_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists pending_registrations (
  id text primary key,
  email text,
  name text,
  role text,
  department text,
  store_region text,
  store_branch_ids jsonb,
  store_lead_user_id text,
  otp text,
  expires_at timestamptz,
  created_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists pending_login_otps (
  id text primary key,
  email text,
  otp text,
  expires_at timestamptz,
  created_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists role_approval_requests (
  id text primary key,
  email text,
  name text,
  role text,
  department text,
  store_region text,
  store_branch_ids jsonb,
  store_lead_user_id text,
  status text,
  approver_user_id text,
  otp_verified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb
);

-- Optional metadata table for GridFS files.
create table if not exists uploads_files (
  id text primary key,
  filename text,
  length bigint,
  chunk_size integer,
  upload_date timestamptz,
  metadata jsonb,
  raw_json jsonb not null default '{}'::jsonb
);

-- Binary file storage (Phase B): used by /api/files and upload APIs when Supabase is enabled.
create table if not exists uploads_blobs (
  id text primary key,
  filename text not null,
  content_type text not null,
  size bigint not null,
  data bytea not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_owner_modified on documents(owner_id, modified_at desc);
create index if not exists idx_documents_folder on documents(folder_id);
create index if not exists idx_learning_quizzes_document on learning_quizzes(document_id);
create index if not exists idx_quiz_attempts_document_person on quiz_attempts(document_id, person_id);
create index if not exists idx_learning_progress_person_document on learning_progress(person_id, document_id);
create index if not exists idx_people_team on people(team_id);
create index if not exists idx_notifications_person_created on person_notifications(person_id, created_at desc);
