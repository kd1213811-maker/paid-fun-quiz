-- Supabase 表结构（第一期路线：密钥 + 答题记录）
-- 用法：在 Supabase 项目的 SQL Editor 里整段执行一次。
-- 安全设计：
--   1. 数据库里只存密钥的 SHA-256 哈希，不存明文密钥。明文只在生成时给卖家一次，见 tools/generate-keys.mjs。
--   2. 前端 anon key 只能调 Edge Function，不能直接读这些表（RLS 全开且不给 anon 读权限）。
--   3. 密钥核销必须是原子操作：UPDATE ... WHERE status='unused'，防止同一密钥被两个人同时用掉。

create table if not exists public.key_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.access_keys (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.key_batches(id),
  code_hash text not null unique,
  code_prefix text not null, -- 前 4 位，供卖家核对用，不足以还原完整密钥
  status text not null default 'unused' check (status in ('unused','used','void')),
  used_at timestamptz,
  session_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_access_keys_hash on public.access_keys(code_hash);
create index if not exists idx_access_keys_status on public.access_keys(status);

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  key_id uuid references public.access_keys(id),
  content_version text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result_id text,
  answers jsonb,
  scores jsonb
);
create index if not exists idx_quiz_sessions_key on public.quiz_sessions(key_id);

-- RLS：全部开启，anon 不给任何直接访问权限；Edge Function 用 service_role key 操作。
alter table public.key_batches enable row level security;
alter table public.access_keys enable row level security;
alter table public.quiz_sessions enable row level security;
-- 注意：不建任何 anon 的 policy，就是“默认拒绝”。卖家查密钥状态请用 Supabase Dashboard
-- 或 service_role 的管理脚本，不要把 service_role key 放进前端。

-- 卖家常用查询（在 SQL Editor 里跑，不要放进前端）：
-- 某一批次用了多少：select status, count(*) from access_keys where batch_id = '<batch_id>' group by status;
-- 某天完成多少次：select date(completed_at), result_id, count(*) from quiz_sessions
--   where completed_at is not null group by 1, 2 order by 1 desc;
