-- TaskTray 사용자 피드백 (D-23)
-- Supabase SQL Editor 에 붙여넣고 실행하세요. 여러 번 실행해도 안전합니다(멱등).
--
-- 구성: feedback(피드백) 테이블 + admins(관리자) 테이블 + RLS + 하루 제한 트리거.
-- 보안: RLS 가 실제 방어선. 일반 사용자는 자기 피드백을 넣을 수만 있고(열람 불가),
--       admins 에 등록된 사용자만 전체 피드백을 읽고 상태를 바꿀 수 있습니다.
-- 하루 제한: 사용자별 KST(자정) 기준 하루 5건. 서버 트리거로 강제(클라이언트 우회 불가).

-- ── 관리자 목록 ────────────────────────────────────────────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

-- 본인이 관리자인지 여부만 조회 가능(다른 관리자 목록은 노출하지 않음)
drop policy if exists "admins can see own row" on public.admins;
create policy "admins can see own row" on public.admins
  for select using (user_id = auth.uid());

-- ── 피드백 ────────────────────────────────────────────────────
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_email  text,
  kind        text not null default '기타',                 -- 버그 / 제안 / 기타
  message     text not null check (char_length(message) between 1 and 4000),
  app_version text,
  platform    text,                                          -- desktop / web
  status      text not null default 'open',                  -- open / done (관리자 처리용)
  created_at  timestamptz not null default now()
);
alter table public.feedback enable row level security;
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_user_day_idx on public.feedback (user_id, created_at);

-- 작성: 로그인 사용자는 자기 것만 삽입
drop policy if exists "insert own feedback" on public.feedback;
create policy "insert own feedback" on public.feedback
  for insert to authenticated with check (user_id = auth.uid());

-- 열람: 관리자만 전체 조회
drop policy if exists "admins read all feedback" on public.feedback;
create policy "admins read all feedback" on public.feedback
  for select using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- 수정(상태 토글): 관리자만
drop policy if exists "admins update feedback" on public.feedback;
create policy "admins update feedback" on public.feedback
  for update using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- ── 하루 제한(5건, KST 기준) ───────────────────────────────────
-- 오늘(KST) 해당 사용자가 넣은 건수
create or replace function public.feedback_used_today(uid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.feedback
  where user_id = uid
    and (created_at at time zone 'Asia/Seoul')::date
      = (now() at time zone 'Asia/Seoul')::date;
$$;

-- 삽입 전 제한 검사(초과 시 거부)
create or replace function public.feedback_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.feedback_used_today(new.user_id) >= 5 then
    raise exception '하루 피드백 제출 제한(5건)을 초과했습니다. 내일 다시 시도해주세요.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feedback_rate_limit on public.feedback;
create trigger trg_feedback_rate_limit
  before insert on public.feedback
  for each row execute function public.feedback_rate_limit();

-- 클라이언트가 "오늘 남은 횟수"를 표시하기 위한 함수(행은 노출하지 않음)
create or replace function public.feedback_left_today()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, 5 - public.feedback_used_today(auth.uid()));
$$;
grant execute on function public.feedback_left_today() to authenticated;

-- 관리자 화면 실시간 갱신(선택) — 이미 추가돼 있으면 무시
do $$ begin
  alter publication supabase_realtime add table public.feedback;
exception when others then null; end $$;

-- ── 관리자 지정 ───────────────────────────────────────────────
-- ▼▼▼ 아래 이메일을 "본인 로그인 이메일"로 바꾼 뒤 실행하세요(계정이 먼저 회원가입돼 있어야 함). ▼▼▼
insert into public.admins (user_id)
select id from auth.users where email = 'bts7623@gmail.com'
on conflict (user_id) do nothing;
-- 관리자 확인: select * from public.admins;
