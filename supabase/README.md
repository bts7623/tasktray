# TaskTray 동기화 백엔드 (Supabase)

모바일·다기기에서 같은 데이터를 쓰기 위한 클라우드 저장소 설정 안내입니다.
(데스크톱은 "로컬 우선 + 동기화" 방식 — 오프라인에서도 동작하고, 온라인일 때 이 백엔드와 동기화)

## 1. Supabase 프로젝트 만들기

1. https://supabase.com → **Start your project** → GitHub 로그인
2. **New project**
   - Name: `tasktray`
   - Database Password: 강한 비밀번호(관리용, 메모해두기 — 클라이언트에는 안 씀)
   - Region: **Northeast Asia (Seoul)** 또는 Tokyo
3. 생성 완료 후 좌측 **Project Settings → API** 에서 확인:
   - **Project URL** (예: `https://xxxx.supabase.co`)
   - **anon public** 키 (공개 클라이언트 키)

## 2. 테이블·보안규칙 생성

좌측 **SQL Editor** → 새 쿼리에 [`schema.sql`](./schema.sql) 전체를 붙여넣고 **Run**.

## 3. 로그인(인증) 설정

- 좌측 **Authentication → Providers → Email** 활성화 (이메일+비밀번호).
- 개인용이면 **Authentication → Users → Add user** 로 본인 계정 1개를 미리 만들어도 됩니다.
- (선택) 개발 편의를 위해 **Email confirm** 을 끄면 가입 즉시 로그인됩니다.

## 4. 앱에 키 연결

프로젝트 루트의 `.env.local` 파일에 아래 값을 채웁니다:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ... (anon public 키)
```

> `.env.local` 은 git 에 올라가지 않습니다. anon 키는 클라이언트 공개용이지만, RLS 로 데이터가 보호됩니다.

여기까지 되면 알려주세요 — 이후 클라이언트 연동(로그인 UI + 동기화)을 붙입니다.
