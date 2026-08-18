-- TaskTray 동기화용 테이블 (Supabase / PostgreSQL)
-- 사용법: Supabase 대시보드 → 왼쪽 [SQL Editor] → 새 쿼리에 아래 전체를 붙여넣고 [Run].
--
-- 설계 메모:
--  - 시각 필드(createdAt 등)는 앱이 항상 "+09:00" 고정 문자열로 저장하므로 text 로 둔다
--    (형식 손실 없음, updatedAt 문자열 비교 = 시간순 비교라 동기화에도 안전).
--  - user_id 는 로그인 사용자로 자동 설정되고, RLS 로 "본인 데이터만" 접근하도록 제한한다.

create table if not exists public.tasks (
  id                text primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null default '',
  category          text,
  status            text not null default 'active',   -- active | done | archived
  pinned            boolean not null default false,
  due_date          text,                              -- YYYY-MM-DD
  created_at        text not null default '',
  completed_at      text,
  flow_status       text,                              -- registered | excluded | null
  flow_processed_at text,
  deleted           boolean not null default false,
  deleted_at        text,
  updated_at        text not null default ''           -- 마지막 변경(KST). 동기화 충돌 판정
);

-- 행 수준 보안: 로그인한 본인 데이터만 조회/수정 가능
alter table public.tasks enable row level security;

drop policy if exists "tasks are private to owner" on public.tasks;
create policy "tasks are private to owner" on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 변경분(updated_at) 동기화 조회 최적화
create index if not exists tasks_user_updated_idx on public.tasks (user_id, updated_at);

-- (선택) 실시간 반영: tasks 테이블을 Realtime publication 에 추가.
-- 이미 추가돼 있으면 무시. 없어도 웹/데스크톱은 주기·포커스 동기화로 동작함.
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when others then null;
end $$;
